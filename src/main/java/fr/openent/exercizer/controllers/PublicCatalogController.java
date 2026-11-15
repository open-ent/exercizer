package fr.openent.exercizer.controllers;

import static org.entcore.common.http.response.DefaultResponseHandler.arrayResponseHandler;

import fr.openent.exercizer.practice.AutomaticCorrection;
import fr.openent.exercizer.practice.PracticePages;
import fr.openent.exercizer.practice.PublicCopyData;
import fr.openent.exercizer.practice.RateLimiter;
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
 * Un usager connecté qui détient le droit {@code exercizer.practice} voit sa tentative enregistrée, et
 * publiée sur le bus ({@value #COMPLETED_ADDRESS}) si {@code practice-badges} est actif.
 */
public class PublicCatalogController extends ControllerHelper {

	public static final String COMPLETED_ADDRESS = "exercizer.practice.completed";
	private static final String PRACTICE_ACTION = "fr.openent.exercizer.controllers.PublicCatalogController|practice";
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

	// ── Droit d'entraînement ────────────────────────────────────────────────────

	@Get("/practice/right")
	@ApiDoc("Declares the free practice right: an attempt made on the public site is recorded for its author.")
	@SecuredAction("exercizer.practice")
	public void practice(final HttpServerRequest request) {
		renderJson(request, new JsonObject().put("practice", true));
	}

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
				.put("canonicalHost", conf.getString("canonical-host", "")));
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

	@Get("/practice")
	@ApiDoc("Public practice site home page (server-rendered, then the React reader).")
	public void homePage(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		catalogService.list(new JsonObject().put("public", true).put("structures", new JsonArray()).put("limit", 100),
				page -> {
					if (page.isLeft()) {
						renderError(request);
						return;
					}
					catalogService.referential(referential -> {
						final JsonArray subjects = new JsonArray();
						page.right().getValue().getJsonArray("subjects", new JsonArray())
								.forEach(row -> subjects.add(publicSubject((JsonObject) row)));
						renderView(request, PracticePages.home(publicConfig(), origin(request), subjects,
								translated(request, referential)),
								"exercizer-practice.html", null);
					});
				});
	}

	@Get("/practice/")
	@ApiDoc("Same as /practice (trailing slash).")
	public void homePageSlash(final HttpServerRequest request) {
		homePage(request);
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
			catalogService.referential(referential -> renderView(request,
					PracticePages.exercise(publicConfig(), origin(request), detail.getJsonObject("subject"),
							detail.getJsonArray("grains"),
							translated(request, referential)),
					"exercizer-practice.html", null));
		});
	}

	@Get("/practice/sitemap.xml")
	@ApiDoc("Sitemap of the public practice site.")
	public void sitemap(final HttpServerRequest request) {
		if (!enabled()) {
			notFound(request);
			return;
		}
		practiceService.sitemap(event -> {
			if (event.isLeft()) {
				renderError(request);
				return;
			}
			request.response().putHeader("Content-Type", "application/xml; charset=utf-8")
					.end(PracticePages.sitemap(origin(request), event.right().getValue()));
		});
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

	/** Le référentiel des niveaux et matières, libellés traduits : la base n'en garde que les clés. */
	private static JsonObject translated(final HttpServerRequest request, final Either<String, JsonObject> referential) {
		if (referential.isLeft()) return new JsonObject();
		final JsonObject result = referential.right().getValue().copy();
		final String host = getHost(request);
		final String lang = I18n.acceptLanguage(request);
		for (final String list : new String[]{"levels", "disciplines"}) {
			for (final Object item : result.getJsonArray(list, new JsonArray())) {
				final JsonObject row = (JsonObject) item;
				final String label = row.getString("label");
				if (label != null) row.put("label", I18n.getInstance().translate(label, host, lang));
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
		if (user == null || !hasAction(user, PRACTICE_ACTION)) {
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

	private static boolean hasAction(final UserInfos user, final String action) {
		return user.getAuthorizedActions() != null &&
				user.getAuthorizedActions().stream().anyMatch(a -> action.equals(a.getName()));
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
