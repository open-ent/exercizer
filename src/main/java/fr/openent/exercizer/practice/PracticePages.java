package fr.openent.exercizer.practice;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Les pages du site public d'entraînement, rendues PAR LE SERVEUR pour les moteurs de recherche : la
 * vue {@code exercizer-practice.html} (générée par Vite) reçoit le titre, la description, l'adresse
 * canonique, les données structurées schema.org et un contenu HTML lisible sans JavaScript. Le lecteur
 * React remplace ce contenu une fois chargé.
 *
 * Tout ce qui vient d'un sujet (titres, énoncés écrits par des enseignants) est réduit à du TEXTE et
 * échappé ici : le contenu servi sans JavaScript ne porte aucune balise venue de la base. Les
 * paramètres {@code content}, {@code jsonld} et {@code boot} sont insérés tels quels dans la vue
 * ({@code {{{…}}}}) : ce sont les seuls, et ils sont construits ici.
 */
public final class PracticePages {

	/** Chemin des pages, sous le préfixe du module. */
	public static final String PATH = "/exercizer/practice";

	private PracticePages() {}

	/** La page d'accueil : la liste des exercices publics, en liens. */
	public static JsonObject home(final JsonObject config, final String origin, final JsonArray subjects,
								  final JsonObject referential) {
		final String title = config.getString("title", "Exercices");
		final String description = "Exercices autocorrigés et gratuits, rattachés aux programmes officiels : "
				+ "à faire en ligne, sans compte.";
		final Map<Long, String> levels = labels(referential.getJsonArray("levels", new JsonArray()));
		final Map<Long, String> disciplines = labels(referential.getJsonArray("disciplines", new JsonArray()));

		final StringBuilder html = new StringBuilder();
		html.append("<main class=\"practice-ssr container py-24\"><h1>").append(escape(title)).append("</h1>")
				.append("<p>").append(escape(description)).append("</p><ul>");
		final JsonArray items = new JsonArray();
		int position = 1;
		for (final Object row : subjects) {
			final JsonObject subject = (JsonObject) row;
			final String url = origin + PATH + "/exercice/" + subject.getValue("id");
			html.append("<li><a href=\"").append(escape(url)).append("\">").append(escape(text(subject.getValue("title"))))
					.append("</a> <small>").append(escape(classification(subject, levels, disciplines))).append("</small>");
			final String summary = plainText(subject.getString("description"));
			if (!summary.isEmpty()) html.append("<br/>").append(escape(truncate(summary, 200)));
			html.append("</li>");
			items.add(new JsonObject().put("@type", "ListItem").put("position", position++).put("url", url)
					.put("name", text(subject.getValue("title"))));
		}
		html.append("</ul></main>");

		final JsonObject jsonld = new JsonObject().put("@context", "https://schema.org").put("@type", "ItemList")
				.put("name", title).put("itemListElement", items);
		return params(title, description, origin + PATH, html.toString(), jsonld,
				new JsonObject().put("page", "home").put("config", publicConfig(config)))
				.put("product", product(config));
	}

	/** La page d'un exercice : son titre, sa description et le texte de ses questions. */
	public static JsonObject exercise(final JsonObject config, final String origin, final JsonObject subject,
									  final JsonArray grains, final JsonObject referential) {
		final String siteTitle = config.getString("title", "Exercices");
		final String name = text(subject.getValue("title"));
		final Map<Long, String> levels = labels(referential.getJsonArray("levels", new JsonArray()));
		final Map<Long, String> disciplines = labels(referential.getJsonArray("disciplines", new JsonArray()));
		final String classification = classification(subject, levels, disciplines);
		final String summary = plainText(subject.getString("description"));
		final String description = truncate(summary.isEmpty()
				? "Exercice autocorrigé" + (classification.isEmpty() ? "" : " — " + classification) + ", gratuit et sans compte."
				: summary, 300);
		final String url = origin + PATH + "/exercice/" + subject.getValue("id");

		final StringBuilder html = new StringBuilder();
		html.append("<main class=\"practice-ssr container py-24\"><p><a href=\"").append(escape(origin + PATH)).append("\">")
				.append(escape(siteTitle)).append("</a></p><h1>").append(escape(name)).append("</h1>");
		if (!classification.isEmpty()) html.append("<p><small>").append(escape(classification)).append("</small></p>");
		if (!summary.isEmpty()) html.append("<p>").append(escape(summary)).append("</p>");
		html.append("<ol>");
		int questions = 0;
		for (final Object row : grains) {
			final JsonObject grain = (JsonObject) row;
			final JsonObject data = grain.getJsonObject("grain_copy_data", new JsonObject());
			final boolean statement = grain.getInteger("grain_type_id", 0) == AutomaticCorrection.STATEMENT;
			final String body = plainText(statement
					? data.getJsonObject("custom_copy_data", new JsonObject()).getString("statement")
					: data.getString("statement"));
			if (!statement) questions++;
			html.append("<li><strong>").append(escape(text(data.getValue("title")))).append("</strong>");
			if (!body.isEmpty()) html.append(" ").append(escape(truncate(body, 400)));
			html.append("</li>");
		}
		html.append("</ol><noscript><p>Activez JavaScript pour faire l'exercice.</p></noscript></main>");

		final JsonObject jsonld = new JsonObject().put("@context", "https://schema.org").put("@type", "Quiz")
				.put("name", name).put("description", description).put("url", url)
				.put("isAccessibleForFree", true).put("inLanguage", "fr")
				.put("educationalLevel", text(levelNames(subject, levels)))
				.put("about", text(disciplineNames(subject, disciplines)))
				.put("numberOfQuestions", questions);
		final JsonArray alignments = subject.getJsonArray("alignments", new JsonArray());
		if (!alignments.isEmpty()) {
			final JsonArray educationalAlignment = new JsonArray();
			for (final Object a : alignments) {
				if (!(a instanceof JsonObject)) continue;
				final JsonObject alignment = (JsonObject) a;
				educationalAlignment.add(new JsonObject().put("@type", "AlignmentObject")
						.put("alignmentType", "teaches")
						.put("targetName", text(alignment.getValue("label")))
						.put("targetDescription", text(alignment.getValue("code"))));
			}
			jsonld.put("educationalAlignment", educationalAlignment);
		}
		return params(name + " — " + siteTitle, description, url, html.toString(), jsonld,
				new JsonObject().put("page", "exercise").put("subjectId", subject.getValue("id"))
						.put("config", publicConfig(config)))
				.put("product", product(config));
	}

	/** Le plan du site (sitemaps.org) : l'accueil et chaque exercice public. */
	public static String sitemap(final String origin, final JsonArray subjects) {
		final StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
				.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n")
				.append("<url><loc>").append(escape(origin + PATH)).append("</loc></url>\n");
		for (final Object row : subjects) {
			final JsonObject subject = (JsonObject) row;
			xml.append("<url><loc>").append(escape(origin + PATH + "/exercice/" + subject.getValue("id"))).append("</loc>");
			final String modified = subject.getString("modified");
			if (modified != null && modified.length() >= 10) {
				xml.append("<lastmod>").append(escape(modified.substring(0, 10))).append("</lastmod>");
			}
			xml.append("</url>\n");
		}
		return xml.append("</urlset>\n").toString();
	}

	/** robots.txt : le site public s'indexe, le reste de l'ENT non. */
	public static String robots(final String origin) {
		return "User-agent: *\nAllow: " + PATH + "\nDisallow: " + PATH + "/media/\nSitemap: " + origin + PATH + "/sitemap.xml\n";
	}

	// ── Outils ──────────────────────────────────────────────────────────────────

	private static JsonObject params(final String title, final String description, final String canonical,
									 final String content, final JsonObject jsonld, final JsonObject boot) {
		return new JsonObject()
				.put("product", "neo")
				.put("title", title)
				.put("description", description)
				.put("canonical", canonical)
				.put("content", content)
				.put("jsonld", scriptJson(jsonld))
				.put("boot", scriptJson(boot));
	}

	/**
	 * Le jeu de couleurs du thème partagé ({@code data-product} : one, neo, 1d). Un visiteur anonyme n'a
	 * pas de thème d'usager : la configuration le fixe ({@code theme-product}, « neo » par défaut).
	 */
	private static String product(final JsonObject config) {
		final String product = config.getString("theme-product", "neo");
		return product.matches("[a-z0-9-]{1,20}") ? product : "neo";
	}

	/** Ce que le lecteur React reçoit de la configuration : rien d'autre que ces liens et ce titre. */
	private static JsonObject publicConfig(final JsonObject config) {
		return new JsonObject()
				.put("title", config.getString("title", "Exercices"))
				.put("signupUrl", config.getString("signup-url", "/auth/login"))
				.put("entUrl", config.getString("ent-url", ""));
	}

	/**
	 * Du JSON à placer dans une balise {@code <script>} : {@code </script>} ou {@code <!--} dans une
	 * chaîne fermeraient la balise. {@code <}, {@code >} et {@code &} sont donc écrits en \\uXXXX, qui
	 * restent du JSON valide.
	 */
	static String scriptJson(final JsonObject json) {
		return json.encode().replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
				.replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
	}

	/** Le texte d'un fragment HTML : balises retirées, entités courantes décodées, blancs réduits. */
	static String plainText(final String html) {
		if (html == null) return "";
		return html.replaceAll("(?is)<(script|style)[^>]*>.*?</\\1>", " ")
				.replaceAll("(?s)<[^>]*>", " ")
				.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"")
				.replace("&#39;", "'").replace("&rsquo;", "’").replace("&amp;", "&")
				.replaceAll("\\s+", " ").trim();
	}

	static String escape(final String text) {
		if (text == null) return "";
		final StringBuilder out = new StringBuilder(text.length());
		for (int i = 0; i < text.length(); i++) {
			final char c = text.charAt(i);
			switch (c) {
				case '<': out.append("&lt;"); break;
				case '>': out.append("&gt;"); break;
				case '&': out.append("&amp;"); break;
				case '"': out.append("&quot;"); break;
				case '\'': out.append("&#39;"); break;
				default: out.append(c);
			}
		}
		return out.toString();
	}

	private static String truncate(final String text, final int max) {
		return text.length() <= max ? text : text.substring(0, max - 1).trim() + "…";
	}

	private static String text(final Object value) {
		return value == null ? "" : plainText(value.toString());
	}

	private static Map<Long, String> labels(final JsonArray items) {
		final Map<Long, String> map = new HashMap<>();
		for (final Object item : items) {
			if (!(item instanceof JsonObject)) continue;
			final JsonObject row = (JsonObject) item;
			if (row.getValue("id") instanceof Number) {
				map.put(((Number) row.getValue("id")).longValue(), row.getString("label", ""));
			}
		}
		return map;
	}

	private static String names(final JsonArray ids, final Map<Long, String> labels) {
		final StringBuilder out = new StringBuilder();
		if (ids == null) return "";
		for (final Object id : ids) {
			if (!(id instanceof Number)) continue;
			final String label = labels.get(((Number) id).longValue());
			if (label == null || label.isEmpty()) continue;
			if (out.length() > 0) out.append(", ");
			out.append(label);
		}
		return out.toString();
	}

	private static String levelNames(final JsonObject subject, final Map<Long, String> levels) {
		return names(subject.getJsonArray("level_ids"), levels);
	}

	private static String disciplineNames(final JsonObject subject, final Map<Long, String> disciplines) {
		return names(subject.getJsonArray("discipline_ids"), disciplines);
	}

	private static String classification(final JsonObject subject, final Map<Long, String> levels,
										 final Map<Long, String> disciplines) {
		final String l = levelNames(subject, levels);
		final String d = disciplineNames(subject, disciplines);
		if (l.isEmpty()) return d;
		if (d.isEmpty()) return l;
		return l + " · " + d;
	}
}
