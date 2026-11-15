package fr.openent.exercizer.practice;

import com.samskivert.mustache.Mustache;
import fr.wseduc.webutils.collections.JsonUtils;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

import static org.junit.Assert.*;

/** Pages publiques rendues par le serveur : modèles, rangement par programme, et rendu du gabarit. */
public class PracticePagesTest {

	private static final JsonObject CONFIG = new JsonObject().put("title", "Exercices ENT Scolaire")
			.put("ent-url", "https://ent.example/").put("signup-url", "https://ent.example/register");

	private static final JsonObject REFERENTIAL = new JsonObject()
			.put("levels", new JsonArray()
					.add(new JsonObject().put("id", 33).put("code", "CE1").put("label", "CE1").put("rank", 11).put("level_group", "elementaire"))
					.add(new JsonObject().put("id", 1).put("code", "6E").put("label", "6ème").put("rank", 20).put("level_group", "college"))
					.add(new JsonObject().put("id", 2).put("code", "5E").put("label", "5ème").put("rank", 21).put("level_group", "college")))
			.put("disciplines", new JsonArray()
					.add(new JsonObject().put("id", 11).put("code", "MATHEMATIQUES").put("label", "Mathématiques"))
					.add(new JsonObject().put("id", 8).put("code", "HISTOIRE_GEO").put("label", "Histoire géographie")));

	/** Cycle 4 › Mathématiques › Nombres et calculs › (objectif) ; Histoire › Thème 1 › (objectif). */
	private static final JsonArray TREE = new JsonArray()
			.add(node("c4", null, 2, "Cycle", "Cycle 4"))
			.add(node("mat", "c4", 2, "Enseignement", "Mathématiques"))
			.add(node("nc", "mat", 1, "Domaine", "Nombres et calculs"))
			.add(node("geo", "mat", 2, "Domaine", "Espace et géométrie"))
			.add(node("o1", "nc", 1, "Objectif d’apprentissage", "Additionner des fractions"))
			.add(node("o2", "geo", 1, "Objectif d’apprentissage", "Construire un triangle"))
			.add(node("hg", "c4", 4, "Enseignement", "Histoire-géographie"))
			.add(node("his", "hg", 1, "Domaine", "Sixième : Histoire (45 heures)"))
			.add(node("t1", "his", 1, "Sous-domaine", "Thème 1 : Chrétientés et islam"))
			.add(node("o3", "t1", 1, "Objectif d’apprentissage", "Raconter Byzance"));

	private static JsonObject node(final String id, final String parent, final int seq, final String type, final String label) {
		return new JsonObject().put("id", id).put("parent", parent).put("seq", seq).put("type", type).put("label", label);
	}

	private static JsonObject subject(final long id, final String title, final long level, final long discipline, final String item) {
		return new JsonObject().put("id", id).put("title", title).put("question_count", 5)
				.put("description", "<p>" + title + " — résumé généré.</p>")
				.put("level_ids", new JsonArray().add(level)).put("discipline_ids", new JsonArray().add(discipline))
				.put("modified", "2026-11-15T10:00:00.000")
				.put("alignments", new JsonArray().add(new JsonObject().put("id", item).put("code", item)
						.put("label", "Notion " + item).put("programme", "p")));
	}

	private static SiteIndex index() {
		final JsonArray subjects = new JsonArray()
				.add(subject(3, "Construire des triangles", 2, 11, "o2"))
				.add(subject(4, "Ajouter des fractions", 2, 11, "o1"))
				.add(subject(5, "Byzance <b>et</b> l'Empire", 2, 8, "o3"))
				.add(subject(6, "Problèmes CE1", 33, 11, "absent"));
		return SiteIndex.build(subjects, REFERENTIAL, TREE);
	}

	@Test
	public void indexPlacesEachExerciseInTheCurriculum() {
		final SiteIndex index = index();
		final SiteIndex.Entry fractions = index.entry(4);
		assertEquals("Nombres et calculs", fractions.domain);
		assertEquals("", fractions.theme);
		assertEquals("Notion o1", fractions.notion);
		// « Sixième : » et le volume horaire sont retirés ; le thème vient du sous-domaine.
		assertEquals("Histoire", index.entry(5).domain);
		assertEquals("Thème 1 : Chrétientés et islam", index.entry(5).theme);
		// Ordre du programme, pas ordre alphabétique : les nombres avant la géométrie.
		final java.util.List<SiteIndex.Entry> maths = index.entries(index.level("5e"), index.discipline("mathematiques"));
		assertEquals(4L, maths.get(0).id);
		assertEquals(3L, maths.get(1).id);
		// Un alignement hors arbre garde sa notion, sans domaine.
		assertEquals("", index.entry(6).domain);
		assertEquals("Notion absent", index.entry(6).notion);
		assertEquals("", fractions.summary);
		assertEquals("ajouter-des-fractions", fractions.slug);
	}

	@Test
	public void labelsAndAddresses() {
		final SiteIndex index = index();
		assertEquals("5e", index.level("5e").label);
		assertEquals("Histoire-géographie", index.discipline("histoire-geo").label);
		assertEquals("du CE1 à la 5e", PracticePages.range(index.usedLevels()));
		assertEquals("mathématiques", PracticePages.inSentence("Mathématiques"));
		assertEquals("SVT", PracticePages.inSentence("SVT"));
		assertEquals("ENT Scolaire", PracticePages.entName(CONFIG));
		assertEquals("", PracticePages.entName(new JsonObject().put("title", "Exercices")));
		assertEquals("4 284 questions", PracticePages.plural(4284, "question", "questions"));
		assertEquals("/exercizer/practice/exercice/5/byzance-et-l-empire", PracticePages.exerciseUrl(5, "Byzance et l'Empire"));
	}

	@Test
	public void exercisePageKeepsOnlyTextFromTheDatabase() {
		final JsonObject subject = new JsonObject().put("id", 5).put("title", "Calcul <script>alert(1)</script>")
				.put("description", "<p>Des \"guillemets\" &amp; </script><img src=x onerror=alert(2)></p>")
				.put("level_ids", new JsonArray().add(2)).put("discipline_ids", new JsonArray().add(8))
				.put("alignments", new JsonArray().add(new JsonObject().put("code", "C4.HGE.1").put("label", "Raconter")));
		final JsonArray grains = new JsonArray()
				.add(new JsonObject().put("grain_type_id", 4).put("grain_copy_data",
						new JsonObject().put("title", "Q1").put("statement", "<p>63 − 28 = <b>?</b></p>")));
		final JsonObject params = PracticePages.exercise(CONFIG, "https://ent.example", index(), subject, grains);

		assertEquals("Calcul", params.getString("heading"));
		assertEquals("63 − 28 = ?", params.getJsonArray("questions").getJsonObject(0).getString("text"));
		assertFalse(params.getString("summary").contains("<"));
		assertEquals("https://ent.example/exercizer/practice/exercice/5/calcul", params.getString("canonical"));
		for (final String key : new String[]{"jsonld", "boot"}) {
			assertFalse(params.getString(key), params.getString(key).contains("<"));
		}
		final JsonObject jsonld = new JsonObject(params.getString("jsonld"));
		final JsonObject quiz = jsonld.getJsonArray("@graph").getJsonObject(0);
		assertEquals("Quiz", quiz.getString("@type"));
		assertEquals(1, quiz.getInteger("numberOfQuestions").intValue());
		assertEquals("C4.HGE.1", quiz.getJsonArray("educationalAlignment").getJsonObject(0).getString("targetDescription"));
		assertEquals("BreadcrumbList", jsonld.getJsonArray("@graph").getJsonObject(1).getString("@type"));
		assertEquals(5, new JsonObject(params.getString("boot")).getInteger("subjectId").intValue());
		// Fil d'Ariane : accueil › 5e › Histoire-géographie › exercice.
		assertEquals(4, params.getJsonArray("breadcrumb").size());
	}

	@Test
	public void themeProductIsAPlainToken() {
		final JsonObject params = PracticePages.home(new JsonObject().put("theme-product", "\" onload=\"x"), "https://e", index());
		assertEquals("neo", params.getString("product"));
	}

	@Test
	public void sitemapListsLevelsSubjectsAndExercises() {
		final String xml = PracticePages.sitemap("https://e", index());
		assertTrue(xml, xml.contains("<loc>https://e/exercizer/practice/niveau/5e</loc>"));
		assertTrue(xml, xml.contains("<loc>https://e/exercizer/practice/niveau/5e/mathematiques</loc>"));
		assertTrue(xml, xml.contains("<loc>https://e/exercizer/practice/exercice/4/ajouter-des-fractions</loc><lastmod>2026-11-15</lastmod>"));
		final String robots = PracticePages.robots("https://e");
		assertTrue(robots.contains("Sitemap: https://e/exercizer/practice/sitemap.xml"));
		assertTrue(robots.contains("Disallow: /exercizer/practice/recherche"));
	}

	/** Le gabarit, rendu comme le fait entcore (jmustache, échappement HTML, valeur par défaut vide). */
	private static String render(final JsonObject params) throws IOException {
		final String template = new String(Files.readAllBytes(Paths.get("frontend/practice.html")), StandardCharsets.UTF_8);
		return Mustache.compiler().defaultValue("").escapeHTML(true).compile(template).execute(JsonUtils.convertMap(params));
	}

	@Test
	public void everyPageRendersWithoutMarkupFromTheDatabase() throws IOException {
		final SiteIndex index = index();
		final String home = render(PracticePages.home(CONFIG, "https://e", index));
		assertTrue(home, home.contains("href=\"/exercizer/practice/niveau/5e\""));
		assertTrue(home, home.contains("Votre établissement sur ENT Scolaire"));
		assertFalse(home, home.contains("<b>et</b>"));

		final String level = render(PracticePages.level(CONFIG, "https://e", index, index.level("5e")));
		assertTrue(level, level.contains("<h1 class=\"ps-title\">Exercices de 5e</h1>"));
		assertTrue(level, level.contains("/exercizer/practice/niveau/5e/mathematiques#nombres-et-calculs"));

		final String discipline = render(PracticePages.discipline(CONFIG, "https://e", index, index.level("5e"),
				index.discipline("histoire-geo")));
		assertTrue(discipline, discipline.contains("Thème 1 : Chrétientés et islam"));
		assertTrue(discipline, discipline.contains("Byzance &lt;b&gt;et&lt;/b&gt; l&#39;Empire")
				|| discipline.contains("Byzance et l&#39;Empire") || discipline.contains("Byzance et l'Empire"));

		final String search = render(PracticePages.search(CONFIG, "https://e", index, "<script>", null, null,
				new JsonArray().add(new JsonObject().put("id", 4)), 1, 1));
		assertFalse(search, search.contains("<script>\""));
		assertTrue(search, search.contains("noindex"));

		final JsonObject subject = subject(4, "Ajouter des fractions", 2, 11, "o1");
		final String exercise = render(PracticePages.exercise(CONFIG, "https://e", index, subject, new JsonArray()));
		assertTrue(exercise, exercise.contains("id=\"ps-player\""));
		assertTrue(exercise, exercise.contains("Au programme · Nombres et calculs"));
		assertTrue(exercise, exercise.contains("Construire des triangles"));
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
