package fr.openent.exercizer.controllers;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import static org.junit.Assert.*;

public class PublicCatalogControllerTest {

	private static JsonObject grain(final long id, final int type, final Object max, final JsonObject custom) {
		return new JsonObject().put("id", id).put("grain_type_id", type)
				.put("grain_data", new JsonObject().put("max_score", max).put("custom_data", custom)
						.put("answer_explanation", "car c'est ainsi").encode());
	}

	@Test
	public void totalCountsUnansweredQuestionsAndSkipsOpenAnswers() {
		final JsonArray grains = new JsonArray()
				.add(grain(1, 3, null, new JsonObject().put("statement", "Énoncé")))
				.add(grain(2, 4, 2, new JsonObject().put("correct_answer", "Paris")))
				.add(grain(3, 4, "1,5", new JsonObject().put("correct_answer", "Rome")))
				.add(grain(4, 5, 4, new JsonObject().put("model_answer", "corrigé")));
		final JsonArray answers = new JsonArray()
				.add(new JsonObject().put("grain_id", 2).put("custom_copy_data", new JsonObject().put("filled_answer", "paris")))
				.add(new JsonObject().put("grain_id", 99).put("custom_copy_data", new JsonObject().put("filled_answer", "x")));

		final JsonObject result = PublicCatalogController.correct(grains, answers);

		assertEquals(2, result.getDouble("score"), 0);
		assertEquals("la question 3 sans réponse reste au barème, la réponse ouverte en sort",
				3.5, result.getDouble("max_score"), 0);
		final JsonArray perGrain = result.getJsonArray("grains");
		assertEquals(2, perGrain.size());
		assertTrue(perGrain.getJsonObject(0).getBoolean("answered"));
		assertFalse(perGrain.getJsonObject(1).getBoolean("answered"));
		assertEquals("car c'est ainsi", perGrain.getJsonObject(0).getString("answer_explanation"));
		assertFalse(result.encode().contains("Rome"));
	}

	@Test
	public void publicSubjectHidesAuthor() {
		final JsonObject subject = new JsonObject().put("id", 1).put("title", "T").put("owner", "uid")
				.put("owner_username", "Mme X").put("authors_contributors", "Mme X");
		final JsonObject visible = PublicCatalogController.publicSubject(subject);
		assertEquals(new JsonObject().put("id", 1).put("title", "T"), visible);
	}
}
