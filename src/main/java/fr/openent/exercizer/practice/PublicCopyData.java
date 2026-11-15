package fr.openent.exercizer.practice;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

import static fr.openent.exercizer.practice.AutomaticCorrection.*;

/**
 * Ce qu'un visiteur du site public reçoit d'un grain : la copie VIERGE que l'élève trouverait dans sa
 * copie avant d'y répondre. Port de {@code initialCopyData} ({@code frontend/src/schedule.ts}) et de
 * {@code zoneCopyData} ({@code zones.ts}), qui préparent la copie d'un élève à la distribution.
 *
 * C'est une LISTE BLANCHE : on construit un objet neuf champ par champ, on ne retire rien d'un grain.
 * Un champ ajouté demain au grain (une nouvelle forme de réponse attendue) ne fuit donc pas.
 *
 * Écarts volontaires avec la distribution de l'ENT, tous deux pour ne pas laisser deviner la réponse :
 *  - les propositions des zones sont mélangées ici (l'ENT les mélange à l'affichage, côté client, or
 *    la bonne réponse est rangée en tête) ;
 *  - l'explication de la réponse et le corrigé d'une réponse ouverte ne sont jamais envoyés : ils
 *    reviennent avec la correction.
 */
public final class PublicCopyData {

	private PublicCopyData() {}

	/** Le grain est-il montré sur le site public ? Ni grain non décidé, ni module SCORM. */
	public static boolean isPublishable(final int grainTypeId) {
		return grainTypeId >= STATEMENT && grainTypeId != SCORM;
	}

	/**
	 * Le grain tel qu'un visiteur le voit : {@code grain} est une ligne de {@code exercizer.grain}, dont
	 * {@code grain_data} est une chaîne JSON.
	 */
	public static JsonObject grain(final JsonObject grain, final Random random) {
		final int type = grain.getInteger("grain_type_id", 0);
		final JsonObject data = parse(grain.getValue("grain_data"));
		final JsonObject custom = data.getJsonObject("custom_data", new JsonObject());

		final JsonObject copy = new JsonObject();
		putIfPresent(copy, "title", data.getValue("title"));
		putIfPresent(copy, "statement", data.getValue("statement"));
		putIfPresent(copy, "answer_hint", data.getValue("answer_hint"));
		if (data.getValue("document_list") instanceof JsonArray) {
			copy.put("document_list", documents(data.getJsonArray("document_list")));
		}
		if (type == STATEMENT) {
			// L'énoncé d'un grain de type 3 vit dans custom_data (et son titre y est recopié) ; la
			// passation le lit dans custom_copy_data (GrainCopyStatement) : on le pose aux deux endroits.
			final JsonObject statement = new JsonObject();
			putIfPresent(statement, "statement", custom.getValue("statement"));
			putIfPresent(statement, "title", custom.getValue("title"));
			copy.put("custom_data", statement);
			copy.put("custom_copy_data", statement.copy());
		} else {
			copy.put("max_score", sanitizeScore(data.getValue("max_score")));
			copy.put("custom_copy_data", initialCopyData(type, custom, random));
		}

		return new JsonObject()
				.put("id", grain.getValue("id"))
				.put("grain_type_id", type)
				.put("order_by", grain.getValue("order_by"))
				.put("section_id", grain.getValue("section_id"))
				.put("grain_copy_data", new JsonObject(publicMedia(copy.encode())));
	}

	/** Un document de l'espace documentaire cité dans un sujet : {@code /workspace/document/<uuid>}. */
	private static final java.util.regex.Pattern WORKSPACE_DOCUMENT =
			java.util.regex.Pattern.compile("/workspace/document/([0-9a-fA-F-]{36})");

	/**
	 * Les images et sons d'un sujet sont des documents de l'espace documentaire — c'est là que
	 * l'installation d'un pack les dépose —, illisibles sans session. Sur le site public, ils passent
	 * par {@code /exercizer/practice/media/<id>}, qui ne sert un document que s'il est cité par un sujet
	 * public. S'applique au texte (HTML ou JSON encodé) tel quel.
	 */
	public static String publicMedia(final String text) {
		return text == null ? null : WORKSPACE_DOCUMENT.matcher(text).replaceAll("/exercizer/practice/media/$1");
	}

	/** L'identifiant est-il celui d'un document de l'espace documentaire ? */
	public static boolean isDocumentId(final String id) {
		return id != null && id.matches("[0-9a-fA-F-]{36}");
	}

	/** {@code initialCopyData} : la copie vierge d'une question. */
	static JsonObject initialCopyData(final int type, final JsonObject data, final Random random) {
		final List<JsonObject> answers = list(data, "correct_answer_list");
		switch (type) {
			case SIMPLE_ANSWER:
				return new JsonObject().put("filled_answer", "");

			case OPEN_ANSWER: {
				final String starting = string(data, "starting_answer");
				return starting != null && !starting.isEmpty()
						? new JsonObject().put("filled_answer", starting).put("starting_answer", starting)
						: new JsonObject().put("filled_answer", "");
			}

			case MULTIPLE_ANSWERS: {
				final JsonArray fields = new JsonArray();
				answers.forEach(a -> fields.add(new JsonObject().put("text", "")));
				return new JsonObject().put("filled_answer_list", fields)
						.put("no_error_allowed", data.getValue("no_error_allowed") == Boolean.TRUE);
			}

			case QCM: {
				// Le texte des propositions seulement : isChecked est la réponse attendue.
				final JsonArray choices = new JsonArray();
				answers.forEach(a -> choices.add(new JsonObject().put("text", string(a, "text"))));
				return new JsonObject().put("filled_answer_list", choices)
						.put("no_error_allowed", data.getValue("no_error_allowed") == Boolean.TRUE)
						.put("multipleAnswers", data.getValue("multipleAnswers") == Boolean.TRUE);
			}

			case ASSOCIATION:
				return association(answers, data.getValue("show_left_column") != Boolean.FALSE, random);

			case ORDER_BY: {
				final List<JsonObject> shuffled = shuffle(answers, random);
				final JsonArray items = new JsonArray();
				for (int i = 0; i < shuffled.size(); i++) {
					items.add(new JsonObject().put("text", string(shuffled.get(i), "text")).put("order_by", i + 1));
				}
				return new JsonObject().put("filled_answer_list", items)
						.put("no_error_allowed", data.getValue("no_error_allowed") == Boolean.TRUE);
			}

			case TEXT_TO_FILL:
			case AREA_SELECT:
			case AREA_SELECT_IMAGE:
				return zoneCopyData(data, random);

			default:
				return new JsonObject();
		}
	}

	private static JsonObject association(final List<JsonObject> answers, final boolean showLeftColumn,
										  final Random random) {
		final JsonArray rows = new JsonArray();
		if (showLeftColumn) {
			final List<JsonObject> right = new ArrayList<>();
			for (final JsonObject answer : answers) {
				rows.add(new JsonObject().put("text_left", string(answer, "text_left")).putNull("text_right"));
				right.add(new JsonObject().put("text_right", string(answer, "text_right")));
			}
			return new JsonObject().put("filled_answer_list", rows)
					.put("possible_answer_list", new JsonArray(new ArrayList<>(shuffle(right, random))))
					.put("show_left_column", true);
		}
		final List<JsonObject> all = new ArrayList<>();
		for (final JsonObject answer : answers) {
			rows.add(new JsonObject().putNull("text_left").putNull("text_right"));
			all.add(new JsonObject().put("item", orEmpty(string(answer, "text_left"))));
			all.add(new JsonObject().put("item", orEmpty(string(answer, "text_right"))));
		}
		return new JsonObject().put("filled_answer_list", rows)
				.put("all_possible_answer", new JsonArray(new ArrayList<>(shuffle(all, random))))
				.put("show_left_column", false);
	}

	/**
	 * {@code zoneCopyData} : le texte, l'image de fond et les propositions, réponses des zones effacées.
	 * Les propositions sont mélangées (la bonne réponse d'une zone est rangée en tête de ses options).
	 */
	static JsonObject zoneCopyData(final JsonObject data, final Random random) {
		final JsonArray zones = new JsonArray();
		for (final JsonObject zone : list(data, "zones")) {
			final JsonObject copy = new JsonObject().put("answer", "");
			putIfPresent(copy, "id", zone.getValue("id"));
			if (zone.getValue("position") instanceof JsonObject) {
				final JsonObject p = zone.getJsonObject("position");
				copy.put("position", new JsonObject().put("x", p.getValue("x")).put("y", p.getValue("y")).put("z", p.getValue("z")));
			}
			if (zone.getValue("options") instanceof JsonArray) {
				copy.put("options", new JsonArray(new ArrayList<>(shuffle(strings(zone.getJsonArray("options")), random))));
			}
			zones.add(copy);
		}
		final JsonArray options = data.getValue("options") instanceof JsonArray
				? new JsonArray(new ArrayList<>(shuffle(strings(data.getJsonArray("options")), random)))
				: new JsonArray();
		final JsonObject copy = new JsonObject().put("zones", zones).put("options", options);
		putIfPresent(copy, "answersType", data.getValue("answersType"));
		if (data.getValue("htmlContent") != null) {
			copy.put("htmlContent", blankFillZones(data.getValue("htmlContent").toString()));
		}
		putIfPresent(copy, "_guideImage", data.getValue("_guideImage"));
		return copy;
	}

	private static final java.util.regex.Pattern FILL_ZONE = java.util.regex.Pattern.compile(
			"<fill-zone\\b[^>]*?\\bzone-id=\"([^\"]*)\"[^>]*>.*?</fill-zone>",
			java.util.regex.Pattern.DOTALL | java.util.regex.Pattern.CASE_INSENSITIVE);
	private static final java.util.regex.Pattern PLACEHOLDER = java.util.regex.Pattern.compile(
			"\\splaceholder\\s*=\\s*(\"[^\"]*\"|'[^']*')", java.util.regex.Pattern.CASE_INSENSITIVE);

	/**
	 * Le texte d'un texte à trous porte souvent la RÉPONSE de chaque zone : l'ancienne IHM enregistre le
	 * rendu de la zone (un {@code <span>} et un {@code placeholder} avec la réponse), et l'import Moodle
	 * ou la numérisation posent {@code placeholder="<réponse>"}. Chaque zone est réduite à son seul
	 * identifiant — c'est tout ce que lit l'affichage ({@code zones.ts}) — et tout {@code placeholder}
	 * restant est retiré.
	 */
	static String blankFillZones(final String html) {
		final String zones = FILL_ZONE.matcher(html).replaceAll("<fill-zone zone-id=\"$1\"></fill-zone>");
		return PLACEHOLDER.matcher(zones).replaceAll("");
	}

	/** Les documents joints : leur identité et leur nom, sans propriétaire. */
	private static JsonArray documents(final JsonArray list) {
		final JsonArray result = new JsonArray();
		for (final Object item : list) {
			if (!(item instanceof JsonObject)) continue;
			final JsonObject doc = (JsonObject) item;
			final JsonObject copy = new JsonObject();
			putIfPresent(copy, "id", doc.getValue("id"));
			putIfPresent(copy, "name", doc.getValue("name"));
			putIfPresent(copy, "title", doc.getValue("title"));
			putIfPresent(copy, "path", doc.getValue("path"));
			result.add(copy);
		}
		return result;
	}

	/** Fisher-Yates, comme {@code shuffle} de schedule.ts. */
	static <T> List<T> shuffle(final List<T> items, final Random random) {
		final List<T> result = new ArrayList<>(items);
		for (int i = result.size() - 1; i > 0; i--) {
			Collections.swap(result, i, random.nextInt(i + 1));
		}
		return result;
	}

	private static List<String> strings(final JsonArray array) {
		final List<String> result = new ArrayList<>();
		for (final Object item : array) {
			if (item != null) result.add(item.toString());
		}
		return result;
	}

	/** {@code grain_data} est rangé en TEXTE : il arrive en chaîne JSON (parfois déjà décodé). */
	public static JsonObject parse(final Object value) {
		if (value instanceof JsonObject) return (JsonObject) value;
		if (value instanceof String && !((String) value).isEmpty()) {
			try {
				return new JsonObject((String) value);
			} catch (RuntimeException e) {
				return new JsonObject();
			}
		}
		return new JsonObject();
	}

	private static void putIfPresent(final JsonObject json, final String key, final Object value) {
		if (value != null) json.put(key, value);
	}

	private static String orEmpty(final String value) {
		return value == null ? "" : value;
	}
}
