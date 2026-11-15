package fr.openent.exercizer.controllers;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;

import fr.openent.exercizer.practice.AutomaticCorrection;
import fr.openent.exercizer.practice.PracticePages;
import fr.openent.exercizer.practice.PublicCopyData;
import fr.openent.exercizer.practice.RateLimiter;
import fr.openent.exercizer.practice.SiteIndex;
import fr.openent.exercizer.services.ICatalogService;
import fr.openent.exercizer.services.impl.CatalogServiceSqlImpl;
import fr.openent.exercizer.services.impl.PracticeServiceSqlImpl;
import fr.wseduc.rs.ApiDoc;
import fr.wseduc.rs.Get;
import fr.wseduc.rs.Post;
import fr.wseduc.security.ActionType;
import fr.wseduc.security.SecuredAction;
import fr.wseduc.webutils.Either;
import fr.wseduc.webutils.I18n;
import fr.wseduc.webutils.request.RequestUtils;
import io.vertx.core.Handler;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.entcore.common.controller.ControllerHelper;
import org.entcore.common.folders.impl.DocumentHelper;
import org.entcore.common.storage.Storage;
import org.entcore.common.user.UserInfos;
import org.entcore.common.user.UserUtils;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

/**
 * Site public d'entraînement : les sujets du catalogue publiés par un modérateur, consultables et
 * faisables SANS COMPTE, corrigés par le serveur.
 *
 * Fonction ÉTEINTE par défaut : sans {@code public-catalog.enabled: true} dans la configuration du
 * module, toutes ces routes ({@code /exercizer/practice/*}) répondent 404 et le module se comporte
 * comme avant. Une instance d'ENT qui ne veut pas de site public n'a rien à faire.
 *
 * Préfixe {@code /practice} et non {@code /public} : entcore sert les fichiers statiques du module sous
 * {@code /exercizer/public/}, avant tout routage.
 *
 * Ces routes n'ont pas de {@code @SecuredAction} — c'est ce qui les ouvre aux visiteurs non connectés
 * (cf. le portail portal-mui, route {@code /}). D'où deux règles :
 *  - rien de ce qui sort d'ici ne porte de réponse attendue : les grains sont reconstruits par
 *    {@link PublicCopyData} (liste blanche), jamais filtrés ;
 *  - le score est calculé ici ({@link AutomaticCorrection}), jamais reçu du client.
 *
 * Un usager connecté, quel que soit son profil, voit sa tentative enregistrée dans son compte : elle
 * n'appartient qu'à lui, et le site entier est derrière {@code public-catalog.enabled}. Elle est publiée sur le bus ({@value #COMPLETED_ADDRESS}) si {@code practice-badges} est actif.
 */
public class PublicCatalogController extends ControllerHelper {

	public static final String COMPLETED_ADDRESS = "exercizer.practice.completed";
	/** Nombre de grains au plus dans une réponse : un corps plus gros n'est pas une copie. */
	private static final int MAX_ANSWERS = 500;

	private final ICatalogService catalogService = new CatalogServiceSqlImpl();
	private final PracticeServiceSqlImpl practiceService = new PracticeServiceSqlImpl();
	private final Random random = new SecureRandom();
	private RateLimiter rateLimiter;
	private final Storage storage;

	public PublicCatalogController(final Storage storage) {
		this.storage = storage;
	}

	private JsonObject publicConfig() {
		return config.getJsonObject("public-catalog", new JsonObject());
	}

	private boolean enabled() {
		return publicConfig().getBoolean("enabled", false);
	}

	private RateLimiter limiter() {
		if (rateLimiter == null) {
			rateLimiter = new RateLimiter(publicConfig().getInteger("rate-limit-per-minute", 30));
		}
		return rateLimiter;
	}

	// ── Tentatives de l'usager ──────────────────────────────────────────────────

	@Get("/practice/attempts")
	@ApiDoc("Lists the user's own practice attempts (most recent first).")
	@SecuredAction(value = "", type = ActionType.AUTHENTICATED)
	public void attempts(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		UserUtils.getUserInfos(eb, request, user -> {
			if (user == null) {
				unauthorized(request);
				return;
			}
			practiceService.attempts(user.getUserId(), arrayResponseHandler(request));
		});
	}

	// ── Routes publiques ────────────────────────────────────────────────────────

	@Get("/practice/config")
	@ApiDoc("Public site settings: title, sign-up and ENT links. 404 when the public site is disabled.")
	public void publicSettings(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		final JsonObject conf = publicConfig();
		renderJson(request, new JsonObject()
				.put("title", conf.getString("title", "Exercices"))
				.put("signupUrl", conf.getString("signup-url", "/auth/login"))
				.put("entUrl", conf.getString("ent-url", ""))
				.put("canonicalHost", conf.getString("canonical-host", ""))
				.put("allPacks", PracticeServiceSqlImpl.allPacks()));
	}

	@Get("/practice/referential")
	@ApiDoc("Lists school levels and disciplines.")
	public void referential(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		catalogService.referential(json(request));
	}

	@Get("/practice/catalog")
	@ApiDoc("Searches the public subjects: q, levels, disciplines, programme, node, direct, limit, offset.")
	public void list(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		final JsonObject criteria = criteria(request)
				.put("programme", request.params().get("programme"))
				.put("node", request.params().get("node"))
				.put("direct", "true".equals(request.params().get("direct")));
		final Integer limit = intParam(request.params().get("limit"));
		final Integer offset = intParam(request.params().get("offset"));
		if (limit != null) criteria.put("limit", limit);
		if (offset != null) criteria.put("offset", offset);
		catalogService.list(criteria, event -> {
			if (event.isLeft()) {
				renderError(request);
				return;
			}
			final JsonObject page = event.right().getValue();
			final JsonArray subjects = new JsonArray();
			page.getJsonArray("subjects", new JsonArray()).forEach(row -> subjects.add(publicSubject((JsonObject) row)));
			renderJson(request, new JsonObject().put("total", page.getValue("total")).put("subjects", subjects));
		});
	}

	@Get("/practice/facets")
	@ApiDoc("Counts public subjects per (level, discipline) pair.")
	public void facets(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		catalogService.facets(criteria(request), json(request));
	}

	@Get("/practice/programmes")
	@ApiDoc("Lists the curricula with their public subject count.")
	public void programmes(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		catalogService.programmes(criteria(request), json(request));
	}

	@Get("/practice/programmes/:id/tree")
	@ApiDoc("Gets a curriculum tree with public subject counts; full=true keeps empty branches.")
	public void programmeTree(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		catalogService.programmeTree(request.params().get("id"), "true".equals(request.params().get("full")),
				criteria(request), json(request));
	}

	@Get("/practice/subject/:id")
	@ApiDoc("Gets a public subject as a blank copy: no expected answer, no explanation.")
	public void subject(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		final Long id = idParam(request);
		if (id == null) return;
		practiceService.subject(id, event -> {
			if (event.isLeft()) {
				if ("not.found".equals(event.left().getValue())) notFound(request);
				else renderError(request);
				return;
			}
			renderJson(request, publicDetail(event.right().getValue(), random));
		});
	}

	/** Le sujet tel qu'un visiteur le reçoit : sujet expurgé, copies vierges des grains, sections. */
	static JsonObject publicDetail(final JsonObject detail, final Random random) {
		final JsonArray grains = new JsonArray();
		for (final Object row : detail.getJsonArray("grains", new JsonArray())) {
			final JsonObject grain = (JsonObject) row;
			if (PublicCopyData.isPublishable(grain.getInteger("grain_type_id", 0))) {
				grains.add(PublicCopyData.grain(grain, random));
			}
		}
		final JsonArray sections = new JsonArray();
		for (final Object row : detail.getJsonArray("sections", new JsonArray())) {
			final JsonObject section = (JsonObject) row;
			sections.add(new JsonObject()
					.put("id", section.getValue("id"))
					.put("title", section.getValue("title"))
					.put("description", PublicCopyData.publicMedia(section.getString("description")))
					.put("order_by", section.getValue("order_by")));
		}
		return new JsonObject()
				.put("subject", publicSubject(detail.getJsonObject("subject", new JsonObject())))
				.put("grains", grains)
				.put("sections", sections);
	}

	// ── Pages (rendues par le serveur, pour les moteurs de recherche) ───────────

	/** Durée de vie de l'index du site : une publication apparaît sur les pages au plus tard après ce délai. */
	private static final long INDEX_TTL_MS = 5 * 60 * 1000L;
	/** Plafond de l'index : au-delà, le site public n'est plus une vitrine mais un catalogue. */
	private static final int INDEX_MAX = 3000;
	private static volatile SiteIndex siteIndex;
	private static volatile long siteIndexBuilt;

	/** Une publication ou un retrait du site public : l'index se reconstruit à la prochaine page. */
	public static void invalidateSiteIndex() {
		siteIndexBuilt = 0;
	}

	/**
	 * L'index du site (exercices publics, référentiel, place dans le programme), gardé en mémoire
	 * {@value #INDEX_TTL_MS} ms. Si sa reconstruction échoue, l'ancien sert encore.
	 */
	private void withIndex(final HttpServerRequest request, final Handler<SiteIndex> handler) {
		final SiteIndex cached = siteIndex;
		if (cached != null && System.currentTimeMillis() - siteIndexBuilt < INDEX_TTL_MS) {
			handler.handle(cached);
			return;
		}
		buildIndex(index -> {
			if (index != null) {
				siteIndex = index;
				siteIndexBuilt = System.currentTimeMillis();
				handler.handle(index);
			} else if (cached != null) {
				handler.handle(cached);
			} else {
				renderError(request);
			}
		});
	}

	private void buildIndex(final Handler<SiteIndex> handler) {
		catalogService.referential(referential -> {
			if (referential.isLeft()) {
				handler.handle(null);
				return;
			}
			final JsonObject labels = translated(referential);
			allPublicSubjects(new JsonArray(), subjects -> {
				if (subjects == null) {
					handler.handle(null);
					return;
				}
				final java.util.Set<String> programmes = new java.util.LinkedHashSet<>();
				subjects.forEach(o -> ((JsonObject) o).getJsonArray("alignments", new JsonArray()).forEach(a -> {
					if (a instanceof JsonObject && ((JsonObject) a).getString("programme") != null) {
						programmes.add(((JsonObject) a).getString("programme"));
					}
				}));
				trees(new java.util.ArrayList<>(programmes), new JsonArray(), nodes ->
						handler.handle(SiteIndex.build(subjects, labels, nodes)));
			});
		});
	}

	/** Tous les sujets publics, par pages de 100 (le plafond de la requête du catalogue). */
	private void allPublicSubjects(final JsonArray acc, final Handler<JsonArray> handler) {
		catalogService.list(new JsonObject().put("public", true).put("structures", new JsonArray())
				.put("limit", 100).put("offset", acc.size()), page -> {
			if (page.isLeft()) {
				handler.handle(null);
				return;
			}
			final JsonArray rows = page.right().getValue().getJsonArray("subjects", new JsonArray());
			rows.forEach(row -> acc.add(publicSubject((JsonObject) row)));
			final long total = page.right().getValue().getLong("total", 0L);
			if (rows.isEmpty() || acc.size() >= total || acc.size() >= INDEX_MAX) handler.handle(acc);
			else allPublicSubjects(acc, handler);
		});
	}

	/** Les nœuds des arbres de programme cités ; un arbre illisible est seulement ignoré (pas de rangement). */
	private void trees(final java.util.List<String> programmes, final JsonArray acc, final Handler<JsonArray> handler) {
		if (programmes.isEmpty()) {
			handler.handle(acc);
			return;
		}
		final String programme = programmes.remove(0);
		catalogService.programmeTree(programme, false, new JsonObject().put("public", true).put("structures", new JsonArray()),
				tree -> {
					if (tree.isRight()) acc.addAll(tree.right().getValue().getJsonArray("nodes", new JsonArray()));
					else log.warn("[Exercizer] practice site: programme tree " + programme + " unreadable: " + tree.left().getValue());
					trees(programmes, acc, handler);
				});
	}

	private void page(final HttpServerRequest request, final JsonObject params) {
		request.response().putHeader("Content-Language", "fr");
		renderView(request, params, "exercizer-practice.html", null);
	}

	@Get("/practice")
	@ApiDoc("Public practice site home page (server-rendered).")
	public void homePage(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		withIndex(request, index -> page(request, PracticePages.home(publicConfig(), origin(request), index)));
	}

	@Get("/practice/")
	@ApiDoc("Same as /practice (trailing slash).")
	public void homePageSlash(final HttpServerRequest request) {
		homePage(request);
	}

	@Get("/practice/niveau/:level")
	@ApiDoc("Public practice page of a school level: its subjects and curriculum domains (server-rendered).")
	public void levelPage(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		withIndex(request, index -> {
			final SiteIndex.Level level = index.level(request.params().get("level"));
			if (level == null || index.entries(level, null).isEmpty()) {
				notFound(request);
				return;
			}
			page(request, PracticePages.level(publicConfig(), origin(request), index, level));
		});
	}

	@Get("/practice/niveau/:level/:discipline")
	@ApiDoc("Public practice page of a subject at a school level, ordered by the curriculum (server-rendered).")
	public void disciplinePage(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		withIndex(request, index -> {
			final SiteIndex.Level level = index.level(request.params().get("level"));
			final SiteIndex.Discipline discipline = index.discipline(request.params().get("discipline"));
			if (level == null || discipline == null || index.entries(level, discipline).isEmpty()) {
				notFound(request);
				return;
			}
			page(request, PracticePages.discipline(publicConfig(), origin(request), index, level, discipline));
		});
	}

	@Get("/practice/recherche")
	@ApiDoc("Public practice search page: q, niveau, matiere, page (server-rendered, not indexed).")
	public void searchPage(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		withIndex(request, index -> {
			final String q = request.params().get("q");
			final SiteIndex.Level level = index.level(request.params().get("niveau"));
			final SiteIndex.Discipline discipline = index.discipline(request.params().get("matiere"));
			final Integer asked = intParam(request.params().get("page"));
			final int pageNumber = asked == null ? 1 : Math.max(1, Math.min(asked, 1000));
			final JsonObject criteria = new JsonObject().put("public", true).put("structures", new JsonArray())
					.put("q", q == null ? null : (q.length() > 100 ? q.substring(0, 100) : q))
					.put("levels", level == null ? new JsonArray() : new JsonArray().add(level.id))
					.put("disciplines", discipline == null ? new JsonArray() : new JsonArray().add(discipline.id))
					.put("limit", PracticePages.SEARCH_PAGE)
					.put("offset", (pageNumber - 1) * PracticePages.SEARCH_PAGE);
			catalogService.list(criteria, result -> {
				if (result.isLeft()) {
					renderError(request);
					return;
				}
				final JsonObject found = result.right().getValue();
				final JsonArray subjects = new JsonArray();
				found.getJsonArray("subjects", new JsonArray()).forEach(row -> subjects.add(publicSubject((JsonObject) row)));
				page(request, PracticePages.search(publicConfig(), origin(request), index, q, level, discipline,
						subjects, found.getLong("total", 0L), pageNumber));
			});
		});
	}

	@Get("/practice/exercice/:id")
	@ApiDoc("Public practice page of one exercise (server-rendered, then the React reader).")
	public void exercisePage(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		final Long id = idParam(request);
		if (id == null) return;
		practiceService.subject(id, event -> {
			if (event.isLeft()) {
				if ("not.found".equals(event.left().getValue())) notFound(request);
				else renderError(request);
				return;
			}
			final JsonObject detail = publicDetail(event.right().getValue(), random);
			withIndex(request, index -> page(request, PracticePages.exercise(publicConfig(), origin(request), index,
					detail.getJsonObject("subject"), detail.getJsonArray("grains"))));
		});
	}

	@Get("/practice/exercice/:id/:slug")
	@ApiDoc("Same as /practice/exercice/:id; the slug is the exercise title, for readable addresses.")
	public void exercisePageSlug(final HttpServerRequest request) {
		exercisePage(request);
	}

	@Get("/practice/sitemap.xml")
	@ApiDoc("Sitemap of the public practice site.")
	public void sitemap(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		withIndex(request, index -> request.response().putHeader("Content-Type", "application/xml; charset=utf-8")
				.end(PracticePages.sitemap(origin(request), index)));
	}

	@Get("/practice/robots.txt")
	@ApiDoc("robots.txt of the public practice site (served at the root of its own host).")
	public void robots(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		request.response().putHeader("Content-Type", "text/plain; charset=utf-8").end(PracticePages.robots(origin(request)));
	}

	@Get("/practice/media/:id")
	@ApiDoc("A workspace document (image, sound) cited by a public subject; 404 for any other document.")
	public void media(final HttpServerRequest request) {
		final String docId = request.params().get("id");
		if (!enabled() || !PublicCopyData.isDocumentId(docId)) {
			notFound(request);
			return;
		}
		practiceService.isPublicMedia(docId, cited -> {
			if (!cited) {
				notFound(request);
				return;
			}
			eb.request("org.entcore.workspace", new JsonObject().put("action", "getDocument").put("id", docId), reply -> {
				final JsonObject body = reply.succeeded() ? (JsonObject) reply.result().body() : null;
				if (body == null || !"ok".equals(body.getString("status")) || body.getJsonObject("result") == null) {
					notFound(request);
					return;
				}
				try {
					final JsonObject doc = body.getJsonObject("result");
					final JsonObject metadata = DocumentHelper.getMetadata(doc);
					storage.sendFile(DocumentHelper.getFileId(doc), metadata.getString("filename"), request, true, metadata);
				} catch (RuntimeException e) {
					notFound(request);
				}
			});
		});
	}

	/**
	 * Le référentiel des niveaux et matières, libellés traduits EN FRANÇAIS : la base n'en garde que les
	 * clés, et le site public est en français quelle que soit la langue du navigateur (ses exercices le sont).
	 */
	private static JsonObject translated(final Either<String, JsonObject> referential) {
		if (referential.isLeft()) return new JsonObject();
		final JsonObject result = referential.right().getValue().copy();
		for (final String list : new String[]{"levels", "disciplines"}) {
			for (final Object item : result.getJsonArray(list, new JsonArray())) {
				final JsonObject row = (JsonObject) item;
				final String label = row.getString("label");
				if (label != null) row.put("label", I18n.getInstance().translate(label, I18n.DEFAULT_DOMAIN, "fr"));
			}
		}
		return result;
	}

	/**
	 * L'origine des adresses absolues (canonique, plan du site) : {@code canonical-host} de la
	 * configuration, sinon celle de la requête. Fixer {@code canonical-host} en production : l'en-tête
	 * Host d'une requête n'est pas une source sûre pour une adresse canonique.
	 */
	private String origin(final HttpServerRequest request) {
		final String configured = publicConfig().getString("canonical-host", "");
		if (!configured.isEmpty()) return configured.replaceAll("/+$", "");
		final String proto = request.getHeader("X-Forwarded-Proto") != null ? request.getHeader("X-Forwarded-Proto")
				: (config.getBoolean("ssl", false) ? "https" : "http");
		final String host = request.getHeader("X-Forwarded-Host") != null ? request.getHeader("X-Forwarded-Host")
				: request.getHeader("Host");
		return proto + "://" + (host == null ? "localhost" : host.split(",")[0].trim());
	}

	@Post("/practice/subject/:id/check")
	@ApiDoc("Corrects answers to a public subject: body {answers: [{grain_id, custom_copy_data}]}. "
			+ "Returns the score per grain, its verdicts and explanation. Recorded for a user holding exercizer.practice.")
	public void check(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		final Long id = idParam(request);
		if (id == null) return;
		if (!limiter().tryAcquire(clientIp(request))) {
			request.response().setStatusCode(429).end();
			return;
		}
		RequestUtils.bodyToJson(request, body -> {
			final JsonArray given = body.getJsonArray("answers", new JsonArray());
			if (given.size() > MAX_ANSWERS) {
				badRequest(request, "exercizer.public.answers.too.many");
				return;
			}
			practiceService.referenceGrains(id, event -> {
				if (event.isLeft()) {
					renderError(request);
					return;
				}
				final JsonArray grains = event.right().getValue();
				if (grains.isEmpty()) {
					notFound(request);
					return;
				}
				final JsonObject result = correct(grains, given);
				UserUtils.getUserInfos(eb, request, user -> record(request, user, id, result, given));
			});
		});
	}

	// ── Correction ──────────────────────────────────────────────────────────────

	/**
	 * Corrige chaque question du sujet. Une question sans réponse compte ZÉRO (elle reste dans le
	 * barème) ; une réponse à un grain qui n'est pas du sujet est ignorée. Les réponses ouvertes n'ont
	 * pas de correction automatique : elles sortent du barème du site public.
	 */
	static JsonObject correct(final JsonArray grains, final JsonArray given) {
		final Map<Long, JsonObject> filledByGrain = new HashMap<>();
		for (final Object item : given) {
			if (!(item instanceof JsonObject)) continue;
			final JsonObject answer = (JsonObject) item;
			final Object grainId = answer.getValue("grain_id");
			if (grainId instanceof Number && answer.getValue("custom_copy_data") instanceof JsonObject) {
				filledByGrain.put(((Number) grainId).longValue(), answer.getJsonObject("custom_copy_data"));
			}
		}

		final JsonArray results = new JsonArray();
		double score = 0;
		double maxScore = 0;
		for (final Object row : grains) {
			final JsonObject grain = (JsonObject) row;
			final int type = grain.getInteger("grain_type_id", 0);
			if (!AutomaticCorrection.isAutoCorrected(type)) continue;
			final JsonObject data = PublicCopyData.parse(grain.getValue("grain_data"));
			final double grainMax = AutomaticCorrection.sanitizeScore(data.getValue("max_score"));
			final long grainId = ((Number) grain.getValue("id")).longValue();
			final JsonObject filled = filledByGrain.get(grainId);
			final AutomaticCorrection.Result correction = AutomaticCorrection.correct(type, grainMax,
					data.getJsonObject("custom_data", new JsonObject()), filled);
			final double grainScore = AutomaticCorrection.formatScore(correction.score);
			score += grainScore;
			maxScore += grainMax;
			final JsonObject result = new JsonObject()
					.put("grain_id", grainId)
					.put("score", grainScore)
					.put("max_score", grainMax)
					.put("answered", filled != null)
					.put("answers", correction.answersJson());
			if (data.getValue("answer_explanation") != null) {
				result.put("answer_explanation", data.getValue("answer_explanation"));
			}
			results.add(result);
		}
		return new JsonObject()
				.put("score", AutomaticCorrection.formatScore(score))
				.put("max_score", AutomaticCorrection.formatScore(maxScore))
				.put("grains", results);
	}

	private void record(final HttpServerRequest request, final UserInfos user, final Long subjectId,
						final JsonObject result, final JsonArray given) {
		if (user == null) {
			renderJson(request, result.put("recorded", false));
			return;
		}
		final double score = result.getDouble("score");
		final double maxScore = result.getDouble("max_score");
		practiceService.recordAttempt(user.getUserId(), subjectId, score, maxScore, given, saved -> {
			if (saved.isLeft()) {
				log.error("[Exercizer] practice attempt not recorded: " + saved.left().getValue());
				renderJson(request, result.put("recorded", false));
				return;
			}
			if (config.getBoolean("practice-badges", false)) {
				eb.publish(COMPLETED_ADDRESS, new JsonObject()
						.put("attemptId", saved.right().getValue().getValue("id"))
						.put("userId", user.getUserId())
						.put("subjectId", subjectId)
						.put("score", score)
						.put("maxScore", maxScore));
			}
			renderJson(request, result.put("recorded", true));
		});
	}

	// ── Outils ──────────────────────────────────────────────────────────────────

	/**
	 * Ce qu'on montre d'un sujet hors connexion : ni l'identité de son auteur (le catalogue la montre aux
	 * enseignants, pas au monde), ni ses partages.
	 */
	static JsonObject publicSubject(final JsonObject subject) {
		final JsonObject result = new JsonObject();
		for (final String key : new String[]{"id", "title", "description", "picture", "max_score", "type",
				"large_display", "question_count", "level_ids", "discipline_ids", "alignments", "modified"}) {
			if (subject.containsKey(key)) result.put(key, subject.getValue(key));
		}
		if (result.getValue("description") instanceof String) {
			result.put("description", PublicCopyData.publicMedia(result.getString("description")));
		}
		if (result.getValue("picture") instanceof String) {
			result.put("picture", PublicCopyData.publicMedia(result.getString("picture")));
		}
		return result;
	}

	private static JsonObject criteria(final HttpServerRequest request) {
		return new JsonObject()
				.put("public", true)
				.put("q", request.params().get("q"))
				.put("levels", idList(request.params().get("levels")))
				.put("disciplines", idList(request.params().get("disciplines")))
				.put("structures", new JsonArray());
	}

	private Handler<Either<String, JsonObject>> json(final HttpServerRequest request) {
		return event -> {
			if (event.isRight()) {
				renderJson(request, event.right().getValue());
			} else if ("not.found".equals(event.left().getValue())) {
				notFound(request);
			} else {
				renderError(request);
			}
		};
	}

	/**
	 * L'adresse du visiteur. Derrière Traefik, le DERNIER maillon de X-Forwarded-For : c'est celui que
	 * le proxy a ajouté. Les premiers viennent du client, qui pourrait en inventer un par requête pour
	 * échapper à la limite de débit.
	 */
	static String clientIp(final HttpServerRequest request) {
		final String forwarded = request.getHeader("X-Forwarded-For");
		if (forwarded != null && !forwarded.isEmpty()) {
			final String[] hops = forwarded.split(",");
			return hops[hops.length - 1].trim();
		}
		final String real = request.getHeader("X-Real-IP");
		if (real != null && !real.isEmpty()) return real.trim();
		return request.remoteAddress() == null ? "unknown" : request.remoteAddress().host();
	}

	private Long idParam(final HttpServerRequest request) {
		try {
			return Long.parseLong(request.params().get("id"));
		} catch (NumberFormatException e) {
			badRequest(request, "exercizer.public.id.invalid");
			return null;
		}
	}

	private static Integer intParam(final String value) {
		if (value == null) return null;
		try {
			return Integer.parseInt(value);
		} catch (NumberFormatException e) {
			return null;
		}
	}

	private static JsonArray idList(final String value) {
		final JsonArray ids = new JsonArray();
		if (value == null || value.isEmpty()) return ids;
		for (final String part : value.split(",")) {
			try {
				ids.add(Long.parseLong(part.trim()));
			} catch (NumberFormatException ignored) {
				// un id illisible est ignoré, comme dans le catalogue
			}
		}
		return ids;
	}
}
