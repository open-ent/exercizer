package org.openent.exercizer.practice;

import fr.openent.exercizer.practice.AutomaticCorrection;
import fr.openent.exercizer.practice.PublicCopyData;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Random;

import static org.junit.Assert.*;

/**
 * Site public d'entraînement : la correction serveur rend les mêmes notes que celle de l'ENT, et la
 * copie publique d'un grain ne porte aucune réponse attendue.
 */
public class PublicPracticeTest {

	/** Écrit par le test Vitest correctionParity.test.ts, à partir de correction.ts. */
	private static JsonArray cases() throws Exception {
		return new JsonArray(new String(Files.readAllBytes(
				Paths.get("frontend/src/__fixtures__/correction-cases.json")), StandardCharsets.UTF_8));
	}

	@Test
	public void correctionMatchesTheClientCorrection() throws Exception {
		final JsonArray cases = cases();
		assertTrue("jeu de cas vide", cases.size() > 10);
		for (final Object item : cases) {
			final JsonObject c = (JsonObject) item;
			final AutomaticCorrection.Result result = AutomaticCorrection.correct(c.getInteger("type"),
					c.getDouble("max"), c.getJsonObject("reference"), c.getJsonObject("filled"));
			final String name = c.getString("name");
			assertEquals(name, c.getDouble("score"), AutomaticCorrection.formatScore(result.score), 0.0001);
			// JSON côté client : un verdict « ni juste ni faux » (undefined) disparaît.
			final JsonObject verdicts = new JsonObject();
			result.answersJson().forEach(e -> {
				if (e.getValue() != null) verdicts.put(e.getKey(), e.getValue());
			});
			assertEquals(name, c.getJsonObject("answers"), verdicts);
		}
	}

	@Test
	public void publicCopyCarriesNoExpectedAnswer() throws Exception {
		for (final Object item : cases()) {
			final JsonObject c = (JsonObject) item;
			final JsonObject reference = c.getJsonObject("reference").copy()
					.put("answer_explanation_marker", "x");
			final JsonObject grain = new JsonObject().put("id", 1).put("grain_type_id", c.getInteger("type"))
					.put("order_by", 1)
					.put("grain_data", new JsonObject().put("title", "t").put("max_score", c.getValue("max"))
							.put("answer_explanation", "EXPLICATION").put("custom_data", reference).encode());
			final String json = PublicCopyData.grain(grain, new Random(1)).encode();
			for (final String forbidden : new String[]{"correct_answer", "isChecked", "model_answer",
					"answer_explanation", "EXPLICATION"}) {
				assertFalse(c.getString("name") + " laisse passer " + forbidden + " : " + json, json.contains(forbidden));
			}
		}
	}

	@Test
	public void zoneAnswersAreErased() {
		final JsonObject data = new JsonObject()
				.put("zones", new JsonArray().add(new JsonObject().put("id", 0).put("answer", "Lyon")
						.put("options", new JsonArray().add("Lyon").add("Paris").add("Lille"))))
				.put("options", new JsonArray().add("Lyon").add("Paris"))
				.put("htmlContent", "<p>La ville <fill-zone zone-id=\"0\" class=\"ng-isolate-scope\"><text-zone>"
						+ "<span>Lyon</span><input type=\"hidden\" placeholder=\"Lyon\" /></text-zone></fill-zone> "
						+ "est grande. <input placeholder='Lyon'></p>");
		final JsonObject grain = new JsonObject().put("id", 7).put("grain_type_id", AutomaticCorrection.TEXT_TO_FILL)
				.put("grain_data", new JsonObject().put("custom_data", data).encode());
		final JsonObject copy = PublicCopyData.grain(grain, new Random(3))
				.getJsonObject("grain_copy_data").getJsonObject("custom_copy_data");
		assertEquals("", copy.getJsonArray("zones").getJsonObject(0).getString("answer"));
		assertEquals(3, copy.getJsonArray("zones").getJsonObject(0).getJsonArray("options").size());
		final String html = copy.getString("htmlContent");
		assertFalse(html, html.contains("Lyon"));
		assertTrue(html, html.contains("<fill-zone zone-id=\"0\"></fill-zone>"));
	}

	@Test
	public void qcmCopyKeepsChoicesOnly() {
		final JsonObject data = new JsonObject().put("multipleAnswers", true).put("correct_answer_list", new JsonArray()
				.add(new JsonObject().put("text", "A").put("isChecked", true))
				.add(new JsonObject().put("text", "B").put("isChecked", false)));
		final JsonObject grain = new JsonObject().put("id", 2).put("grain_type_id", AutomaticCorrection.QCM)
				.put("grain_data", new JsonObject().put("max_score", "1,5").put("custom_data", data).encode());
		final JsonObject copy = PublicCopyData.grain(grain, new Random()).getJsonObject("grain_copy_data");
		assertEquals(1.5, copy.getDouble("max_score"), 0);
		final JsonArray choices = copy.getJsonObject("custom_copy_data").getJsonArray("filled_answer_list");
		assertEquals(new JsonObject().put("text", "A"), choices.getJsonObject(0));
		assertTrue(copy.getJsonObject("custom_copy_data").getBoolean("multipleAnswers"));
	}

	@Test
	public void sanitizeScoreReadsLikeParseFloat() {
		assertEquals(1.5, AutomaticCorrection.sanitizeScore("1,5"), 0);
		assertEquals(2, AutomaticCorrection.sanitizeScore("2 pts"), 0);
		assertEquals(0, AutomaticCorrection.sanitizeScore("abc"), 0);
		assertEquals(0, AutomaticCorrection.sanitizeScore(null), 0);
		assertEquals(0.33, AutomaticCorrection.sanitizeScore(1.0 / 3), 0);
	}
}
