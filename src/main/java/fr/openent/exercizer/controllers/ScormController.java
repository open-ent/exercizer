package fr.openent.exercizer.controllers;

import fr.openent.exercizer.interoperability.ScormAccessToken;
import fr.openent.exercizer.interoperability.ScormCmi;
import fr.openent.exercizer.interoperability.ScormService;
import fr.tech.openent.interoperability.io.MimeTypes;
import fr.tech.openent.interoperability.io.Resources;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Handler;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.HttpServerFileUpload;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.storage.Storage;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;
import org.vertx.java.core.http.RouteMatcher;

import java.io.File;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Lecteur SCORM : dépôt d'un paquet, service de son contenu, et suivi de l'apprenant.
 *
 * <h3>Pourquoi le contenu est servi depuis un autre domaine</h3>
 *
 * Un paquet SCORM est du JavaScript écrit par un tiers. Servi depuis le domaine de l'ENT, il
 * s'exécuterait dans le même contexte que celui-ci — et la configuration de la plateforme note
 * qu'entcore ne pose l'en-tête CSP que sur les vues rendues, jamais sur les ressources
 * statiques. Un paquet mal intentionné pourrait alors appeler les API de l'ENT au nom de l'élève
 * qui l'ouvre. Le contenu est donc servi depuis un domaine distinct, et le navigateur cloisonne.
 *
 * <h3>Conséquence : le contenu ne peut pas s'authentifier par la session</h3>
 *
 * Les cookies de session sont en {@code SameSite=Lax}, et Lax ne les joint PAS aux requêtes d'une
 * iframe tierce. Le domaine du contenu ne voit donc aucune session — c'est le but — et
 * {@code serveContent} est volontairement <strong>sans {@code @SecuredAction}</strong> : entcore
 * n'applique sa chaîne de filtres qu'aux méthodes qui en déclarent une, cette route est donc
 * publique. Son autorisation vient d'un {@link ScormAccessToken} signé qui nomme le paquet,
 * l'usager et une échéance, et n'ouvre rien d'autre que la lecture de ce paquet.
 *
 * <h3>Et le suivi ?</h3>
 *
 * Le modèle CMI est persisté par {@code POST /scorm/:packageId/state}, qui est sur le domaine de
 * l'ENT et exige une session. Le SCO ne l'appelle jamais : il parle à la page qui l'encadre par
 * {@code postMessage}, et c'est elle qui enregistre.
 */
public class ScormController extends ControllerHelper {

    private static final String BRIDGE_RESOURCE = "/scorm/scorm-bridge.js";

    private final ScormService scormService;
    private final ScormAccessToken tokens;
    private final String contentOrigin;
    private final String entOrigin;
    private String bridgeScript = "";

    public ScormController(Vertx vertx, Storage storage, JsonObject configuration) {
        JsonObject scorm = configuration == null
                ? new JsonObject() : configuration.getJsonObject("scorm", new JsonObject());
        this.scormService = new ScormService(vertx, storage);
        this.contentOrigin = scorm.getString("content-origin");
        this.entOrigin = scorm.getString("ent-origin");
        String secret = scorm.getString("token-secret");
        // Sans secret ni domaine de contenu distinct, le lecteur reste éteint : servir malgré
        // tout depuis l'origine de l'ENT serait exactement ce qu'on cherche à éviter.
        this.tokens = secret == null || secret.trim().isEmpty()
                ? null : new ScormAccessToken(secret, scorm.getLong("token-ttl-ms", 3_600_000L));
    }

    @Override
    public void init(Vertx vertx, JsonObject config, RouteMatcher rm,
                     Map<String, fr.wseduc.webutils.security.SecuredAction> securedActions) {
        super.init(vertx, config, rm, securedActions);
        // Un SCO cite ses fichiers par des chemins relatifs de profondeur quelconque : une route
        // à segment unique ne les atteindrait pas, d'où le joker.
        getWithRegEx("/scorm/content/[0-9]+/.*", "serveContent");
        try {
            bridgeScript = Resources.text(BRIDGE_RESOURCE);
        } catch (Exception e) {
            log.error("Pont SCORM introuvable dans le jar : le lecteur ne fonctionnera pas", e);
        }
    }

    private boolean enabled(HttpServerRequest request) {
        if (tokens == null || contentOrigin == null || entOrigin == null) {
            log.warn("Lecteur SCORM non configuré : scorm.token-secret, scorm.content-origin et "
                    + "scorm.ent-origin sont requis.");
            badRequest(request, "exercizer.scorm.not.configured");
            return false;
        }
        return true;
    }

    // ------------------------------------------------------------------ dépôt

    @Post("/subject/:id/scorm")
    @ApiDoc("Deposits a SCORM package on a subject.")
    @SecuredAction("exercizer.subject.import")
    public void deposit(final HttpServerRequest request) {
        if (!enabled(request)) {
            return;
        }
        final long subjectId;
        try {
            subjectId = Long.parseLong(request.params().get("id"));
        } catch (NumberFormatException e) {
            badRequest(request, "exercizer.scorm.subject.invalid");
            return;
        }
        UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
            @Override
            public void handle(final UserInfos user) {
                if (user == null) {
                    unauthorized(request);
                    return;
                }
                receiveUpload(request, new Handler<String>() {
                    @Override
                    public void handle(final String path) {
                        scormService.deposit(path).onComplete(deposited -> {
                            vertx.fileSystem().delete(path, ignored -> { });
                            if (deposited.failed()) {
                                log.error("Dépôt SCORM impossible", deposited.cause());
                                badRequest(request, deposited.cause().getMessage());
                                return;
                            }
                            scormService.create(subjectId, user.getUserId(), deposited.result(),
                                    new Handler<Either<String, JsonObject>>() {
                                        @Override
                                        public void handle(Either<String, JsonObject> created) {
                                            if (created.isLeft()) {
                                                renderError(request, new JsonObject()
                                                        .put("error", created.left().getValue()));
                                            } else {
                                                renderJson(request, created.right().getValue(), 201);
                                            }
                                        }
                                    });
                        });
                    }
                });
            }
        });
    }

    // ------------------------------------------------------------------ ouverture d'une session

    /**
     * Prépare la lecture d'un paquet : rend l'URL à encadrer, déjà porteuse de son jeton.
     *
     * Cette route est sur le domaine de l'ENT et exige une session ; c'est elle, et elle seule,
     * qui décide qu'un usager a le droit d'ouvrir ce paquet.
     */
    @Get("/scorm/:packageId/session")
    @ApiDoc("Opens a reading session on a SCORM package.")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void session(final HttpServerRequest request) {
        if (!enabled(request)) {
            return;
        }
        final Long packageId = parseId(request.params().get("packageId"));
        if (packageId == null) {
            badRequest(request, "exercizer.scorm.package.invalid");
            return;
        }
        UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
            @Override
            public void handle(final UserInfos user) {
                if (user == null) {
                    unauthorized(request);
                    return;
                }
                scormService.get(packageId, new Handler<Either<String, JsonObject>>() {
                    @Override
                    public void handle(Either<String, JsonObject> found) {
                        if (found.isLeft()) {
                            notFound(request);
                            return;
                        }
                        JsonObject scormPackage = found.right().getValue();
                        String token = tokens.issue(packageId, user.getUserId(),
                                System.currentTimeMillis());
                        String url = contentOrigin + "/exercizer/scorm/content/" + packageId + "/"
                                + scormPackage.getString("entry_point") + "?t=" + token;
                        renderJson(request, new JsonObject()
                                .put("contentUrl", url)
                                .put("scormVersion", scormPackage.getString("scorm_version"))
                                .put("title", scormPackage.getString("title")));
                    }
                });
            }
        });
    }

    // ------------------------------------------------------------------ service du contenu

    /**
     * Sert un fichier d'un paquet. <strong>Route publique, autorisée par jeton signé.</strong>
     *
     * L'absence de {@code @SecuredAction} est délibérée et documentée en tête de classe : la
     * requête vient d'une iframe tierce, qui ne porte aucun cookie de session.
     *
     * Aucune traversée de répertoire n'est possible : le chemin demandé est cherché dans la table
     * du paquet, et ce qui n'y figure pas n'existe pas. Il n'y a pas de chemin à assainir parce
     * qu'il n'y a pas de chemin — seulement une clé.
     */
    public void serveContent(final HttpServerRequest request) {
        if (tokens == null) {
            request.response().setStatusCode(503).end();
            return;
        }
        final String path = request.path();
        final int marker = path.indexOf("/scorm/content/");
        if (marker < 0) {
            notFound(request);
            return;
        }
        final String rest = path.substring(marker + "/scorm/content/".length());
        final int slash = rest.indexOf('/');
        if (slash <= 0) {
            notFound(request);
            return;
        }
        final Long packageId = parseId(rest.substring(0, slash));
        final String relativePath = decode(rest.substring(slash + 1));
        if (packageId == null) {
            notFound(request);
            return;
        }

        final ScormAccessToken.Claims claims = tokens.verify(request.params().get("t"), packageId,
                System.currentTimeMillis());
        if (claims == null) {
            // Un jeton absent, périmé ou falsifié ne dit pas pourquoi : l'énoncer renseignerait
            // qui cherche à en forger un.
            request.response().setStatusCode(403).end();
            return;
        }

        scormService.get(packageId, new Handler<Either<String, JsonObject>>() {
            @Override
            public void handle(Either<String, JsonObject> found) {
                if (found.isLeft()) {
                    notFound(request);
                    return;
                }
                final JsonObject scormPackage = found.right().getValue();
                scormService.readFile(scormPackage, relativePath,
                        new Handler<Either<String, Buffer>>() {
                            @Override
                            public void handle(Either<String, Buffer> file) {
                                if (file.isLeft()) {
                                    notFound(request);
                                    return;
                                }
                                sendFile(request, scormPackage, claims, relativePath,
                                        file.right().getValue());
                            }
                        });
            }
        });
    }

    private void sendFile(final HttpServerRequest request, final JsonObject scormPackage,
                          final ScormAccessToken.Claims claims, final String relativePath,
                          final Buffer content) {
        final String mimeType = MimeTypes.ofPath(relativePath);
        if (!"text/html".equals(mimeType) && !"application/xhtml+xml".equals(mimeType)) {
            respond(request, mimeType, content);
            return;
        }
        // Le pont n'est injecté que dans les pages : le greffer dans une image la corromprait.
        scormService.loadState(scormPackage.getLong("id"), claims.userId(), null,
                new Handler<Either<String, JsonObject>>() {
                    @Override
                    public void handle(Either<String, JsonObject> state) {
                        JsonObject cmi = state.isRight() && state.right().getValue() != null
                                ? ScormService.asJson(state.right().getValue().getValue("cmi"))
                                : new JsonObject();
                        String html = inject(content.toString("UTF-8"),
                                scormPackage.getString("scorm_version"), cmi);
                        respond(request, "text/html", Buffer.buffer(html));
                    }
                });
    }

    /**
     * Insère la configuration et le pont dans la page du SCO.
     *
     * L'insertion se fait juste après l'ouverture de {@code <head>}, et à défaut en tête de
     * document : le SCO cherche son API dès son premier script, et un pont injecté après lui
     * arriverait trop tard.
     */
    String inject(String html, String scormVersion, JsonObject cmi) {
        String config = "<script>window.__OPENENT_SCORM__="
                + new JsonObject()
                        .put("parentOrigin", entOrigin)
                        .put("version", ScormCmi.VERSION_2004.equals(scormVersion)
                                ? ScormCmi.VERSION_2004 : ScormCmi.VERSION_12)
                        .put("initial", cmi).encode()
                + ";</script>\n<script>" + bridgeScript + "</script>\n";

        int head = indexOfIgnoreCase(html, "<head>");
        if (head >= 0) {
            return html.substring(0, head + "<head>".length()) + "\n" + config
                    + html.substring(head + "<head>".length());
        }
        int html5 = indexOfIgnoreCase(html, "<html");
        if (html5 >= 0) {
            int close = html.indexOf('>', html5);
            if (close > 0) {
                return html.substring(0, close + 1) + "\n" + config + html.substring(close + 1);
            }
        }
        return config + html;
    }

    private void respond(HttpServerRequest request, String mimeType, Buffer content) {
        request.response()
                .putHeader("content-type", mimeType)
                // Le contenu est servi hors session, sur une origine cloisonnée : rien n'y est
                // personnel, mais rien ne doit non plus être mis en cache par un intermédiaire.
                .putHeader("cache-control", "private, max-age=600")
                .putHeader("x-content-type-options", "nosniff")
                .end(content);
    }

    // ------------------------------------------------------------------ suivi de l'apprenant

    @Post("/scorm/:packageId/state")
    @ApiDoc("Persists the SCORM runtime state of the current user.")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void saveState(final HttpServerRequest request) {
        final Long packageId = parseId(request.params().get("packageId"));
        if (packageId == null) {
            badRequest(request, "exercizer.scorm.package.invalid");
            return;
        }
        UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
            @Override
            public void handle(final UserInfos user) {
                if (user == null) {
                    unauthorized(request);
                    return;
                }
                RequestUtils.bodyToJson(request, new Handler<JsonObject>() {
                    @Override
                    public void handle(JsonObject body) {
                        final JsonObject cmi = body.getJsonObject("cmi", new JsonObject());
                        final Long subjectCopyId = body.getLong("subjectCopyId");
                        scormService.get(packageId, new Handler<Either<String, JsonObject>>() {
                            @Override
                            public void handle(Either<String, JsonObject> found) {
                                if (found.isLeft()) {
                                    notFound(request);
                                    return;
                                }
                                String version = found.right().getValue().getString("scorm_version");
                                scormService.saveState(packageId, user.getUserId(), subjectCopyId,
                                        cmi, version, new Handler<Either<String, JsonObject>>() {
                                            @Override
                                            public void handle(Either<String, JsonObject> saved) {
                                                if (saved.isLeft()) {
                                                    renderError(request, new JsonObject()
                                                            .put("error", saved.left().getValue()));
                                                } else {
                                                    renderJson(request, saved.right().getValue());
                                                }
                                            }
                                        });
                            }
                        });
                    }
                });
            }
        });
    }

    @Get("/scorm/:packageId/state")
    @ApiDoc("Reads the SCORM runtime state of the current user.")
    @SecuredAction(value = "", type = ActionType.AUTHENTICATED)
    public void readState(final HttpServerRequest request) {
        final Long packageId = parseId(request.params().get("packageId"));
        if (packageId == null) {
            badRequest(request, "exercizer.scorm.package.invalid");
            return;
        }
        final Long subjectCopyId = parseId(request.params().get("subjectCopyId"));
        UserUtils.getUserInfos(eb, request, new Handler<UserInfos>() {
            @Override
            public void handle(UserInfos user) {
                if (user == null) {
                    unauthorized(request);
                    return;
                }
                scormService.loadState(packageId, user.getUserId(), subjectCopyId,
                        new Handler<Either<String, JsonObject>>() {
                            @Override
                            public void handle(Either<String, JsonObject> state) {
                                renderJson(request, state.isRight() && state.right().getValue() != null
                                        ? state.right().getValue() : new JsonObject());
                            }
                        });
            }
        });
    }

    // ------------------------------------------------------------------ utilitaires

    /** Reçoit le fichier téléversé dans un fichier temporaire local. */
    private void receiveUpload(final HttpServerRequest request, final Handler<String> handler) {
        request.pause();
        final String path = System.getProperty("java.io.tmpdir") + File.separator
                + "exercizer-scorm-" + UUID.randomUUID();
        final AtomicBoolean received = new AtomicBoolean(false);
        request.setExpectMultipart(true);
        request.uploadHandler(new Handler<HttpServerFileUpload>() {
            @Override
            public void handle(HttpServerFileUpload upload) {
                received.set(true);
                upload.streamToFileSystem(path);
            }
        });
        request.endHandler(new Handler<Void>() {
            @Override
            public void handle(Void event) {
                if (!received.get()) {
                    badRequest(request, "exercizer.scorm.file.missing");
                    return;
                }
                handler.handle(path);
            }
        });
        request.resume();
    }

    private static Long parseId(String value) {
        if (value == null || value.isEmpty()) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Décode les séquences pour-cent d'un chemin.
     *
     * Les clés de la table du paquet sont les chemins TELS QU'ILS FIGURENT dans l'archive ; le
     * navigateur, lui, encode les espaces et les accents. Sans ce décodage, un fichier nommé
     * « leçon 1.html » serait introuvable.
     */
    static String decode(String path) {
        if (path == null) {
            return "";
        }
        int query = path.indexOf('?');
        String cleaned = query < 0 ? path : path.substring(0, query);
        try {
            return java.net.URLDecoder.decode(cleaned.replace("+", "%2B"), "UTF-8");
        } catch (Exception e) {
            return cleaned;
        }
    }

    private static int indexOfIgnoreCase(String haystack, String needle) {
        return haystack.toLowerCase().indexOf(needle.toLowerCase());
    }
}
