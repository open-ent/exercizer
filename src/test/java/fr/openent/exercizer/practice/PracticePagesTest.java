package fr.openent.exercizer.practice;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import static org.junit.Assert.*;

/** Pages publiques rendues par le serveur : rien de la base n'y arrive sous forme de balise. */
public class PracticePagesTest {

	private static final JsonObject REFERENTIAL = new JsonObject()
			.put("levels", new JsonArray().add(new JsonObject().put("id", 1).put("label", "CE1")))
			.put("disciplines", new JsonArray().add(new JsonObject().put("id", 2).put("label", "Mathématiques")));

	@Test
	public void exercisePageEscapesEverythingFromTheDatabase() {
		final JsonObject subject = new JsonObject().put("id", 7).put("title", "Calcul <script>alert(1)</script>")
				.put("description", "<p>Des \"guillemets\" &amp; </script><img src=x onerror=alert(2)></p>")
				.put("level_ids", new JsonArray().add(1)).put("discipline_ids", new JsonArray().add(2))
				.put("alignments", new JsonArray().add(new JsonObject().put("code", "C2.MAT.1").put("label", "Calculer")));
		final JsonArray grains = new JsonArray()
				.add(new JsonObject().put("grain_type_id", 4).put("grain_copy_data",
						new JsonObject().put("title", "Q1").put("statement", "<p>63 − 28 = <b>?</b></p>")));
		final JsonObject params = PracticePages.exercise(new JsonObject().put("title", "Exercices"),
				"https://ent.example", subject, grains, REFERENTIAL);

		final String content = params.getString("content");
		assertFalse(content, content.contains("<script"));
		assertFalse(content, content.contains("<img"));
		assertFalse(content, content.contains("<b>"));
		assertTrue(content, content.contains("63 − 28 = ?"));
		assertTrue(content, content.contains("CE1 · Mathématiques"));
		assertEquals("https://ent.example/exercizer/practice/exercice/7", params.getString("canonical"));
		// Le JSON des balises <script> ne peut pas les refermer.
		for (final String key : new String[]{"jsonld", "boot"}) {
			assertFalse(params.getString(key), params.getString(key).contains("</"));
			assertFalse(params.getString(key), params.getString(key).contains("<"));
		}
		final JsonObject jsonld = new JsonObject(params.getString("jsonld"));
		assertEquals("Quiz", jsonld.getString("@type"));
		assertEquals(1, jsonld.getInteger("numberOfQuestions").intValue());
		assertEquals("C2.MAT.1", jsonld.getJsonArray("educationalAlignment").getJsonObject(0).getString("targetDescription"));
		assertEquals(7, new JsonObject(params.getString("boot")).getInteger("subjectId").intValue());
	}

	@Test
	public void homeListsSubjectsAsLinks() {
		final JsonArray subjects = new JsonArray().add(new JsonObject().put("id", 3).put("title", "A & B"));
		final JsonObject params = PracticePages.home(new JsonObject().put("title", "Exos").put("theme-product", "neo"),
				"https://ent.example", subjects, REFERENTIAL);
		assertTrue(params.getString("content").contains("href=\"https://ent.example/exercizer/practice/exercice/3\">A &amp; B</a>"));
		assertEquals("neo", params.getString("product"));
		assertEquals("ItemList", new JsonObject(params.getString("jsonld")).getString("@type"));
	}

	@Test
	public void themeProductIsAPlainToken() {
		final JsonObject params = PracticePages.home(new JsonObject().put("theme-product", "\" onload=\"x"),
				"https://e", new JsonArray(), REFERENTIAL);
		assertEquals("neo", params.getString("product"));
	}

	@Test
	public void sitemapAndRobots() {
		final String xml = PracticePages.sitemap("https://e", new JsonArray()
				.add(new JsonObject().put("id", 4).put("modified", "2026-11-15T10:00:00.000")));
		assertTrue(xml, xml.contains("<loc>https://e/exercizer/practice/exercice/4</loc><lastmod>2026-11-15</lastmod>"));
		assertTrue(PracticePages.robots("https://e").contains("Sitemap: https://e/exercizer/practice/sitemap.xml"));
	}

	@Test
	public void workspaceDocumentsGoThroughThePublicMediaRoute() {
		final String id = "7cd482aa-b2d0-47dc-9593-ee6e88e42dd4";
		assertEquals("<img src=\"/exercizer/practice/media/" + id + "\">",
				PublicCopyData.publicMedia("<img src=\"/workspace/document/" + id + "\">"));
		final JsonObject grain = new JsonObject().put("id", 1).put("grain_type_id", AutomaticCorrection.STATEMENT)
				.put("grain_data", new JsonObject().put("custom_data", new JsonObject()
						.put("statement", "<img src=\"/workspace/document/" + id + "\">")).encode());
		final String json = PublicCopyData.grain(grain, new java.util.Random()).encode();
		assertFalse(json, json.contains("/workspace/document/"));
		assertTrue(PublicCopyData.isDocumentId(id));
		assertFalse(PublicCopyData.isDocumentId("../../etc/passwd-xxxxxxxxxxxxxxxxxxxxx"));
	}
}
