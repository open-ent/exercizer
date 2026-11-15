package fr.openent.exercizer.practice;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Correction automatique d'un grain, CÔTÉ SERVEUR : port à la lettre de {@code frontend/src/correction.ts}.
 *
 * Le module corrige d'ordinaire dans le navigateur (le score est calculé par le client et renvoyé). Sur
 * le site public, un score calculé par le client serait falsifiable, et le client n'a de toute façon pas
 * les réponses attendues : la correction se fait donc ici.
 *
 * ⚠ Ce code décide de NOTES. Toute divergence avec {@code correction.ts} ferait qu'un même exercice
 * serait noté différemment dans l'ENT et sur le site public : les deux sont vérifiés sur le même jeu de
 * cas ({@code frontend/src/__fixtures__/correction-cases.json}). Les bizarreries de l'original sont
 * reprises telles quelles — voir les commentaires de {@code correction.ts}.
 */
public final class AutomaticCorrection {

	public static final int STATEMENT = 3;
	public static final int SIMPLE_ANSWER = 4;
	public static final int OPEN_ANSWER = 5;
	public static final int MULTIPLE_ANSWERS = 6;
	public static final int QCM = 7;
	public static final int ASSOCIATION = 8;
	public static final int ORDER_BY = 9;
	public static final int TEXT_TO_FILL = 10;
	public static final int AREA_SELECT = 11;
	public static final int AREA_SELECT_IMAGE = 12;
	public static final int SCORM = 13;

	/** Les apostrophes typographiques ’ ‘ ʼ, comptées comme l'apostrophe du clavier. */
	private static final Pattern APOSTROPHES = Pattern.compile("[’‘ʼ]");
	/**
	 * Ce que {@code /[​‌\s]/g} retire en JavaScript : les deux caractères de largeur nulle et
	 * TOUS les blancs de {@code \s} JavaScript, Unicode compris (espace insécable, espaces fines…). Le
	 * {@code \s} de Java ne connaît que les blancs ASCII : on énumère donc la classe JavaScript.
	 */
	private static final Pattern BLANKS = Pattern.compile(
			"[​‌\t\n\u000B\f\r    -     　﻿]");
	private static final Pattern NOT_PLAIN = Pattern.compile("[^A-Za-z0-9\\[\\] ]");

	private static final Map<String, String> LATIN_MAP = loadLatinMap();

	private AutomaticCorrection() {}

	/** Résultat : le score et le verdict réponse par réponse (null = ni juste ni fausse). */
	public static final class Result {
		public final double score;
		public final Map<Integer, Boolean> answers;

		Result(final double score, final Map<Integer, Boolean> answers) {
			this.score = score;
			this.answers = answers;
		}

		public JsonObject answersJson() {
			final JsonObject json = new JsonObject();
			answers.forEach((key, value) -> json.put(String.valueOf(key), value));
			return json;
		}
	}

	private static Result empty() {
		return new Result(0, Collections.emptyMap());
	}

	/** Le type de grain a-t-il une correction automatique ? */
	public static boolean isAutoCorrected(final int grainTypeId) {
		return grainTypeId >= SIMPLE_ANSWER && grainTypeId <= AREA_SELECT_IMAGE && grainTypeId != OPEN_ANSWER;
	}

	/**
	 * Corrige un grain. {@code reference} est le {@code custom_data} du grain (avec les bonnes réponses),
	 * {@code filled} le {@code custom_copy_data} rempli par l'usager.
	 */
	public static Result correct(final int grainTypeId, final double maxScore, final JsonObject reference,
								 final JsonObject filled) {
		if (reference == null || filled == null) return empty();
		switch (grainTypeId) {
			case SIMPLE_ANSWER:
				return simpleAnswer(maxScore, reference, filled);
			case MULTIPLE_ANSWERS:
				return multipleAnswers(maxScore, reference, filled);
			case QCM:
				return qcm(maxScore, reference, filled);
			case ASSOCIATION:
				return association(maxScore, reference, filled);
			case ORDER_BY:
				return order(maxScore, reference, filled);
			case TEXT_TO_FILL:
			case AREA_SELECT:
			case AREA_SELECT_IMAGE:
				return zones(maxScore, reference, filled);
			default:
				return empty();
		}
	}

	/** {@code compareAnswers} : casse, blancs, largeur nulle, apostrophes et lettres latines étendues ignorés. */
	public static boolean compareAnswers(final String a, final String b) {
		if (a == null || a.isEmpty() || b == null || b.isEmpty()) return false;
		return normalise(a).equals(normalise(b));
	}

	private static String normalise(final String value) {
		final String latin = latinise(value);
		final String apostrophes = APOSTROPHES.matcher(latin).replaceAll("'");
		// toLowerCase(Locale.ROOT) : en JavaScript, toLowerCase ne dépend pas de la langue.
		return BLANKS.matcher(apostrophes).replaceAll("").toLowerCase(java.util.Locale.ROOT);
	}

	/** {@code latinise} : chaque caractère hors [A-Za-z0-9[] ] est remplacé par son équivalent de la table. */
	static String latinise(final String value) {
		final StringBuilder out = new StringBuilder(value.length());
		for (int i = 0; i < value.length(); i++) {
			final String ch = String.valueOf(value.charAt(i));
			if (NOT_PLAIN.matcher(ch).matches()) {
				out.append(LATIN_MAP.getOrDefault(ch, ch));
			} else {
				out.append(ch);
			}
		}
		return out.toString();
	}

	/** {@code formatScore} : deux décimales au plus. */
	public static double formatScore(final double score) {
		if (Double.isNaN(score)) return 0;
		// Math.round de JavaScript arrondit .5 vers +∞, comme Math.round de Java.
		return Math.round(score * 100) / 100.0;
	}

	/** {@code sanitizeScore} : un barème peut être une chaîne, avec une virgule décimale. */
	public static double sanitizeScore(final Object value) {
		if (value == null) return 0;
		if (value instanceof Number) return round2(((Number) value).doubleValue());
		final String text = value.toString().trim().replaceFirst(",", ".");
		if (text.isEmpty()) return 0;
		// parseFloat lit le plus long préfixe numérique (« 2 pts » vaut 2).
		final java.util.regex.Matcher m = Pattern.compile("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?").matcher(text);
		if (!m.find()) return 0;
		return round2(Double.parseDouble(m.group()));
	}

	private static double round2(final double value) {
		if (Double.isNaN(value) || Double.isInfinite(value)) return 0;
		return new java.math.BigDecimal(value).setScale(2, java.math.RoundingMode.HALF_EVEN).doubleValue();
	}

	private static Result simpleAnswer(final double maxScore, final JsonObject reference, final JsonObject filled) {
		final boolean correct = compareAnswers(string(reference, "correct_answer"), string(filled, "filled_answer"));
		final Map<Integer, Boolean> answers = new HashMap<>();
		answers.put(0, correct);
		return new Result(correct ? maxScore : 0, answers);
	}

	private static Result multipleAnswers(final double maxScore, final JsonObject reference, final JsonObject filled) {
		final List<JsonObject> expected = list(reference, "correct_answer_list");
		final boolean[] used = new boolean[expected.size()];
		final boolean noErrorAllowed = reference.getValue("no_error_allowed") == Boolean.TRUE;
		final Map<Integer, Boolean> answers = new HashMap<>();
		int good = 0;
		boolean oneError = false;

		final List<JsonObject> given = list(filled, "filled_answer_list");
		for (int index = 0; index < given.size(); index++) {
			final String text = string(given.get(index), "text");
			int match = -1;
			for (int i = 0; i < expected.size(); i++) {
				if (!used[i] && compareAnswers(string(expected.get(i), "text"), text)) {
					match = i;
					break;
				}
			}
			if (match >= 0) {
				used[match] = true;
				answers.put(index, true);
				if (!(noErrorAllowed && oneError)) good += 1;
			} else {
				answers.put(index, false);
				oneError = true;
				if (noErrorAllowed) good = 0;
			}
		}
		return new Result(ratio(good, expected.size(), maxScore), answers);
	}

	private static Result qcm(final double maxScore, final JsonObject reference, final JsonObject filled) {
		final List<JsonObject> expected = list(reference, "correct_answer_list");
		final boolean noErrorAllowed = reference.getValue("no_error_allowed") == Boolean.TRUE;
		final Map<Integer, Boolean> answers = new HashMap<>();
		int good = 0;
		int recognised = 0;
		boolean oneError = false;

		final List<JsonObject> given = list(filled, "filled_answer_list");
		for (int index = 0; index < given.size(); index++) {
			final boolean givenChecked = given.get(index).getValue("isChecked") == Boolean.TRUE;
			final boolean expectedChecked = index < expected.size()
					&& expected.get(index).getValue("isChecked") == Boolean.TRUE;
			if (givenChecked == expectedChecked) {
				if (expectedChecked) {
					recognised += 1;
					answers.put(index, true);
					if (!(noErrorAllowed && oneError)) good += 1;
				} else {
					answers.put(index, null);
				}
			} else {
				oneError = true;
				recognised += 1;
				if (noErrorAllowed) good = 0;
				answers.put(index, expectedChecked);
			}
		}
		if (recognised == 0) {
			return new Result(oneError ? 0 : maxScore, answers);
		}
		return new Result(ratio(good, recognised, maxScore), answers);
	}

	private static Result association(final double maxScore, final JsonObject reference, final JsonObject filled) {
		final List<JsonObject> expected = list(reference, "correct_answer_list");
		final boolean noErrorAllowed = reference.getValue("no_error_allowed") == Boolean.TRUE;
		// `if (reference.show_left_column)` : vrai seulement pour une valeur « truthy ».
		final boolean showLeft = truthy(reference.getValue("show_left_column"));
		final Map<Integer, Boolean> answers = new HashMap<>();
		final int[] good = {0};
		final boolean[] oneError = {false};

		final List<JsonObject> given = list(filled, "filled_answer_list");
		for (int index = 0; index < given.size(); index++) {
			final JsonObject g = given.get(index);
			final boolean correct;
			if (showLeft) {
				final JsonObject pair = index < expected.size() ? expected.get(index) : null;
				correct = pair != null
						&& compareAnswers(string(g, "text_left"), string(pair, "text_left"))
						&& compareAnswers(string(g, "text_right"), string(pair, "text_right"));
			} else {
				boolean found = false;
				for (final JsonObject pair : expected) {
					if ((compareAnswers(string(pair, "text_left"), string(g, "text_left"))
							&& compareAnswers(string(pair, "text_right"), string(g, "text_right")))
							|| (compareAnswers(string(pair, "text_right"), string(g, "text_left"))
							&& compareAnswers(string(pair, "text_left"), string(g, "text_right")))) {
						found = true;
						break;
					}
				}
				correct = found;
			}
			answers.put(index, correct);
			if (correct) {
				if (!(noErrorAllowed && oneError[0])) good[0] += 1;
			} else {
				oneError[0] = true;
				if (noErrorAllowed) good[0] = 0;
			}
		}
		return new Result(ratio(good[0], expected.size(), maxScore), answers);
	}

	private static Result order(final double maxScore, final JsonObject reference, final JsonObject filled) {
		final List<JsonObject> expected = list(reference, "correct_answer_list");
		final boolean noErrorAllowed = reference.getValue("no_error_allowed") == Boolean.TRUE;
		final Map<Integer, Boolean> answers = new HashMap<>();
		int good = 0;
		boolean oneError = false;

		for (final JsonObject g : list(filled, "filled_answer_list")) {
			final Object rank = g.getValue("order_by");
			JsonObject atRank = null;
			for (final JsonObject answer : expected) {
				if (sameRank(answer.getValue("order_by"), rank)) {
					atRank = answer;
					break;
				}
			}
			final boolean correct = compareAnswers(string(g, "text"), atRank == null ? null : string(atRank, "text"));
			answers.put(rank instanceof Number ? ((Number) rank).intValue() : 0, correct);
			if (correct) {
				if (!(noErrorAllowed && oneError)) good += 1;
			} else {
				oneError = true;
				if (noErrorAllowed) good = 0;
			}
		}
		return new Result(ratio(good, expected.size(), maxScore), answers);
	}

	private static Result zones(final double maxScore, final JsonObject reference, final JsonObject filled) {
		final List<JsonObject> expected = list(reference, "zones");
		final List<JsonObject> given = list(filled, "zones");
		final Map<Integer, Boolean> answers = new HashMap<>();
		int good = 0;
		for (int index = 0; index < expected.size(); index++) {
			final String answer = string(expected.get(index), "answer");
			final String filledAnswer = index < given.size() ? string(given.get(index), "answer") : null;
			final boolean correct = answer != null && !answer.isEmpty() && compareAnswers(answer, filledAnswer);
			answers.put(index, correct);
			if (correct) good += 1;
		}
		return new Result(ratio(good, expected.size(), maxScore), answers);
	}

	private static double ratio(final int good, final int total, final double maxScore) {
		if (total == 0 || Double.isNaN(maxScore) || Double.isInfinite(maxScore)) return 0;
		final double score = ((double) good / total) * maxScore;
		return Double.isNaN(score) ? 0 : score;
	}

	/** {@code ===} entre deux rangs : deux nombres égaux, ou deux absences. */
	private static boolean sameRank(final Object a, final Object b) {
		if (a == null || b == null) return a == b;
		if (a instanceof Number && b instanceof Number) {
			return ((Number) a).doubleValue() == ((Number) b).doubleValue();
		}
		return a.equals(b);
	}

	private static boolean truthy(final Object value) {
		if (value == null) return false;
		if (value instanceof Boolean) return (Boolean) value;
		if (value instanceof Number) return ((Number) value).doubleValue() != 0;
		if (value instanceof String) return !((String) value).isEmpty();
		return true;
	}

	/** Une chaîne, ou null : un nombre posé là où le texte est attendu est lu comme sa forme texte. */
	static String string(final JsonObject json, final String key) {
		if (json == null) return null;
		final Object value = json.getValue(key);
		return value == null ? null : value.toString();
	}

	/** Les objets d'une liste ; un élément qui n'est pas un objet compte comme un objet vide. */
	static List<JsonObject> list(final JsonObject json, final String key) {
		final List<JsonObject> result = new ArrayList<>();
		if (json == null) return result;
		final Object value = json.getValue(key);
		if (!(value instanceof JsonArray)) return result;
		for (final Object item : (JsonArray) value) {
			result.add(item instanceof JsonObject ? (JsonObject) item : new JsonObject());
		}
		return result;
	}

	private static Map<String, String> loadLatinMap() {
		try (InputStream in = AutomaticCorrection.class.getResourceAsStream("/practice/latin-map.json")) {
			if (in == null) throw new IllegalStateException("practice/latin-map.json introuvable");
			final JsonObject json = new JsonObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
			final Map<String, String> map = new HashMap<>();
			json.forEach(entry -> map.put(entry.getKey(), String.valueOf(entry.getValue())));
			return Collections.unmodifiableMap(map);
		} catch (IOException e) {
			throw new IllegalStateException(e);
		}
	}
}
