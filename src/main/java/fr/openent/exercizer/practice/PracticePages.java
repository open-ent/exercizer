package fr.openent.exercizer.practice;

import fr.openent.exercizer.practice.SiteIndex.Discipline;
import fr.openent.exercizer.practice.SiteIndex.Entry;
import fr.openent.exercizer.practice.SiteIndex.Level;
import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Les pages du site public d'entraînement, rendues PAR LE SERVEUR : la vue {@code exercizer-practice.html}
 * (générée par Vite) reçoit ici un modèle par page (accueil, niveau, matière d'un niveau, recherche,
 * exercice) et le gabarit en fait du HTML complet, lisible sans JavaScript et par les moteurs de
 * recherche. React n'y monte que des îlots : le lecteur d'exercice, l'encart du compte, « Mes résultats ».
 *
 * Le site est en français, quelle que soit la langue du navigateur : ses exercices le sont.
 *
 * Tout ce qui vient d'un sujet est réduit à du TEXTE ici, puis échappé par le moteur de gabarits
 * ({@code {{…}}}). Seuls {@code jsonld} et {@code boot} sont insérés tels quels ({@code {{{…}}}}) :
 * ils sont construits ici et passés par {@link #scriptJson}.
 */
public final class PracticePages {

	/** Chemin des pages, sous le préfixe du module. */
	public static final String PATH = "/exercizer/practice";
	/** Exercices par page de recherche. */
	public static final int SEARCH_PAGE = 24;

	private static final Map<String, String[]> ACCENTS = new HashMap<>();

	static {
		// code de matière → { couleur, monogramme }
		ACCENTS.put("MATHEMATIQUES", new String[]{"indigo", "Ma"});
		ACCENTS.put("FRANCAIS", new String[]{"coral", "Fr"});
		ACCENTS.put("LANGAGE", new String[]{"coral", "La"});
		ACCENTS.put("HISTOIRE_GEO", new String[]{"amber", "HG"});
		ACCENTS.put("SVT", new String[]{"green", "SVT"});
		ACCENTS.put("QUESTIONNER_LE_MONDE", new String[]{"green", "QM"});
		ACCENTS.put("EXPLORER_LE_MONDE", new String[]{"green", "EM"});
		ACCENTS.put("PHYSIQUE_CHIMIE", new String[]{"violet", "PC"});
		ACCENTS.put("TECHNOLOGIE", new String[]{"teal", "Te"});
		ACCENTS.put("SCIENCES_TECHNO", new String[]{"teal", "ST"});
		ACCENTS.put("EMC", new String[]{"amber", "EMC"});
		ACCENTS.put("LANGUES_VIVANTES", new String[]{"violet", "LV"});
	}

	private PracticePages() {}

	// ── Accueil ─────────────────────────────────────────────────────────────────

	public static JsonObject home(final JsonObject config, final String origin, final SiteIndex index) {
		final List<Level> used = index.usedLevels();
		final String range = range(used);
		final String title = siteTitle(config) + " — exercices corrigés en ligne et gratuits" + (range.isEmpty() ? "" : ", " + range);
		final String description = index.entries.size() + " exercices corrigés en ligne, gratuits et sans inscription"
				+ (range.isEmpty() ? "" : ", " + range) + ". Rangés selon les programmes officiels, corrigés instantanément.";

		final JsonArray groups = new JsonArray();
		for (final String group : SiteIndex.groups()) {
			final JsonArray levels = new JsonArray();
			for (final Level level : used) {
				if (!group.equals(level.group)) continue;
				final int count = index.entries(level, null).size();
				final JsonArray disciplines = new JsonArray();
				for (final Discipline d : index.usedDisciplines(level)) disciplines.add(d.label);
				levels.add(new JsonObject().put("label", level.label).put("url", levelUrl(level))
						.put("count", plural(count, "exercice", "exercices"))
						.put("disciplines", String.join(" · ", disciplines.getList())));
			}
			if (!levels.isEmpty()) {
				groups.add(new JsonObject().put("label", SiteIndex.groupLabel(group)).put("group", group).put("levels", levels));
			}
		}

		final JsonArray disciplines = new JsonArray();
		for (final Discipline d : index.usedDisciplines(null)) {
			final JsonArray links = new JsonArray();
			for (final Level level : used) {
				final int count = index.entries(level, d).size();
				if (count > 0) links.add(new JsonObject().put("label", level.label).put("url", disciplineUrl(level, d))
						.put("title", "Exercices de " + inSentence(d.longLabel) + " en " + level.label));
			}
			disciplines.add(accent(new JsonObject(), d).put("label", d.label)
					.put("count", plural(index.entries(null, d).size(), "exercice", "exercices")).put("levels", links));
		}

		final JsonArray faq = faq(config);
		final JsonObject website = new JsonObject().put("@type", "WebSite").put("name", siteTitle(config))
				.put("url", origin + PATH).put("inLanguage", "fr")
				.put("potentialAction", new JsonObject().put("@type", "SearchAction")
						.put("target", origin + PATH + "/recherche?q={search_term_string}")
						.put("query-input", "required name=search_term_string"));
		final JsonArray questions = new JsonArray();
		for (final Object o : faq) {
			final JsonObject item = (JsonObject) o;
			questions.add(new JsonObject().put("@type", "Question").put("name", item.getString("q"))
					.put("acceptedAnswer", new JsonObject().put("@type", "Answer").put("text", item.getString("a"))));
		}
		final JsonObject jsonld = new JsonObject().put("@context", "https://schema.org").put("@graph", new JsonArray()
				.add(website).add(new JsonObject().put("@type", "FAQPage").put("mainEntity", questions)));

		return base(config, origin, index, title, description, origin + PATH, jsonld, "home", null)
				.put("isHome", true)
				.put("range", range)
				.put("stats", new JsonObject()
						.put("exercises", number(index.entries.size()))
						.put("questions", number(index.questionCount()))
						.put("levels", used.size()))
				.put("groups", groups)
				.put("disciplines", disciplines)
				.put("search", searchForm(index, "", null, null)).put("hasSearch", true)
				.put("faq", faq);
	}

	private static JsonArray faq(final JsonObject config) {
		final String ent = entName(config);
		final JsonArray faq = new JsonArray()
				.add(qa("Les exercices sont-ils gratuits ?",
						"Oui. Tous les exercices sont gratuits et se font en ligne, sans publicité."))
				.add(qa("Faut-il créer un compte ?",
						"Non. Vous faites l'exercice et obtenez votre score sans compte. Un compte gratuit sert seulement "
								+ "à garder vos résultats et à suivre vos progrès."))
				.add(qa("Les exercices suivent-ils le programme ?",
						"Oui. Chaque exercice est rattaché à une notion des programmes officiels de l'Éducation nationale, "
								+ "et les pages sont rangées par niveau, matière et domaine du programme."))
				.add(qa("Comment la correction fonctionne-t-elle ?",
						"La correction est immédiate : chaque question affiche si la réponse est juste, et souvent une "
								+ "explication pour comprendre son erreur."));
		if (!ent.isEmpty()) {
			faq.add(qa("Je suis enseignant : puis-je utiliser ces exercices avec ma classe ?",
					"Oui. Les élèves peuvent les faire ici librement. Avec " + ent + ", l'espace numérique de travail "
							+ "de votre établissement, vous les donnez à votre classe, suivez les résultats et créez vos propres exercices."));
		}
		return faq;
	}

	private static JsonObject qa(final String q, final String a) {
		return new JsonObject().put("q", q).put("a", a);
	}

	// ── Niveau ──────────────────────────────────────────────────────────────────

	public static JsonObject level(final JsonObject config, final String origin, final SiteIndex index, final Level level) {
		final List<Entry> all = index.entries(level, null);
		final List<Discipline> used = index.usedDisciplines(level);
		final List<String> names = new ArrayList<>();
		for (final Discipline d : used) names.add(inSentence(d.label));
		final String title = "Exercices de " + level.label + " corrigés en ligne — " + siteTitle(config);
		final String description = all.size() + " exercices de " + level.label + " gratuits et corrigés"
				+ (names.isEmpty() ? "" : " en " + join(names)) + ", rangés selon le programme officiel.";

		final JsonArray disciplines = new JsonArray();
		for (final Discipline d : used) {
			final List<Entry> entries = index.entries(level, d);
			final Map<String, Integer> domains = new LinkedHashMap<>();
			for (final Entry e : entries) domains.merge(domainOf(e), 1, Integer::sum);
			final JsonArray domainList = new JsonArray();
			domains.forEach((name, count) -> domainList.add(new JsonObject().put("label", name)
					.put("url", disciplineUrl(level, d) + "#" + SiteIndex.slug(name)).put("count", count)));
			disciplines.add(accent(new JsonObject(), d).put("label", d.label).put("url", disciplineUrl(level, d))
					.put("count", plural(entries.size(), "exercice", "exercices")).put("domains", domainList)
					.put("more", "Les " + plural(entries.size(), "exercice", "exercices") + " de " + inSentence(d.longLabel)));
		}

		final JsonArray crumbs = crumbs(origin, new String[][]{{level.label, levelUrl(level)}});
		return base(config, origin, index, title, description, origin + levelUrl(level),
				graph(collection(title, description, origin + levelUrl(level), all, origin), breadcrumbLd(crumbs)), "level", null)
				.put("isLevel", true)
				.put("breadcrumb", crumbs).put("hasBreadcrumb", true).put("hasSiblings", true)
				.put("heading", "Exercices de " + level.label)
				.put("lead", plural(all.size(), "exercice corrigé", "exercices corrigés") + " en ligne, rangés selon le programme officiel"
						+ (SiteIndex.groupLabel(level.group).isEmpty() ? "" : " — " + SiteIndex.groupLabel(level.group).toLowerCase(Locale.FRENCH)) + ".")
				.put("group", level.group)
				.put("disciplines", disciplines)
				.put("siblings", siblings(index, level))
				.put("search", searchForm(index, "", level, null)).put("hasSearch", true);
	}

	// ── Matière d'un niveau ─────────────────────────────────────────────────────

	public static JsonObject discipline(final JsonObject config, final String origin, final SiteIndex index, final Level level,
										final Discipline discipline) {
		final List<Entry> entries = index.entries(level, discipline);
		final String subject = inSentence(discipline.longLabel);
		final String heading = "Exercices de " + subject + " en " + level.label;
		final String title = heading + " — corrigés et gratuits | " + siteTitle(config);

		// Domaine → thème → exercices, dans l'ordre du programme.
		final Map<String, Map<String, List<Entry>>> tree = new LinkedHashMap<>();
		for (final Entry e : entries) {
			tree.computeIfAbsent(domainOf(e), k -> new LinkedHashMap<>()).computeIfAbsent(e.theme, k -> new ArrayList<>()).add(e);
		}
		final JsonArray domains = new JsonArray();
		final List<String> domainNames = new ArrayList<>();
		tree.forEach((domain, themes) -> {
			domainNames.add(domain);
			final JsonArray themeList = new JsonArray();
			int count = 0;
			for (final Map.Entry<String, List<Entry>> theme : themes.entrySet()) {
				final JsonArray cards = new JsonArray();
				for (final Entry e : theme.getValue()) cards.add(card(index, e));
				count += theme.getValue().size();
				themeList.add(new JsonObject().put("label", theme.getKey()).put("hasLabel", !theme.getKey().isEmpty()).put("cards", cards));
			}
			domains.add(new JsonObject().put("label", domain).put("anchor", SiteIndex.slug(domain))
					.put("count", count).put("themes", themeList));
		});
		final String description = entries.size() + " exercices de " + subject + " en " + level.label
				+ ", gratuits et corrigés en ligne" + (domainNames.isEmpty() ? "" : " : " + truncate(join(lower(domainNames)), 160)) + ".";

		final JsonArray crumbs = crumbs(origin, new String[][]{{level.label, levelUrl(level)},
				{discipline.label, disciplineUrl(level, discipline)}});
		final JsonArray otherLevels = new JsonArray();
		for (final Level other : index.usedLevels()) {
			if (other.id == level.id || index.entries(other, discipline).isEmpty()) continue;
			otherLevels.add(new JsonObject().put("label", other.label).put("url", disciplineUrl(other, discipline)));
		}
		return base(config, origin, index, title, description, origin + disciplineUrl(level, discipline),
				graph(collection(heading, description, origin + disciplineUrl(level, discipline), entries, origin), breadcrumbLd(crumbs)),
				"discipline", null)
				.put("isDiscipline", true)
				.put("breadcrumb", crumbs).put("hasBreadcrumb", true)
				.put("heading", heading)
				.put("lead", plural(entries.size(), "exercice", "exercices") + " pour réviser le programme de " + level.label
						+ ", du cours à l'entraînement. Choisissez un chapitre, faites l'exercice, la correction est immédiate.")
				.put("group", level.group)
				.put("discipline", accent(new JsonObject(), discipline).put("label", discipline.label))
				.put("domains", domains)
				.put("hasToc", domains.size() > 1)
				.put("otherLevels", otherLevels)
				.put("hasOtherLevels", !otherLevels.isEmpty())
				.put("levelLabel", level.label)
				.put("levelUrl", levelUrl(level));
	}

	// ── Recherche ───────────────────────────────────────────────────────────────

	public static JsonObject search(final JsonObject config, final String origin, final SiteIndex index, final String q,
									final Level level, final Discipline discipline, final JsonArray subjects,
									final long total, final int page) {
		final JsonArray cards = new JsonArray();
		for (final Object o : subjects) {
			final JsonObject subject = (JsonObject) o;
			final Entry entry = index.entry(((Number) subject.getValue("id")).longValue());
			cards.add(card(index, entry != null ? entry : SiteIndex.loose(subject)));
		}
		final List<String> filters = new ArrayList<>();
		if (level != null) filters.add(level.label);
		if (discipline != null) filters.add(discipline.label);
		final String query = q == null ? "" : q.trim();
		final String heading = query.isEmpty() ? "Tous les exercices" + (filters.isEmpty() ? "" : " — " + String.join(", ", filters))
				: "Résultats pour « " + truncate(query, 60) + " »" + (filters.isEmpty() ? "" : " — " + String.join(", ", filters));
		final int pages = (int) Math.max(1, (total + SEARCH_PAGE - 1) / SEARCH_PAGE);
		final JsonObject pagination = new JsonObject().put("page", page).put("pages", pages).put("show", pages > 1);
		if (page > 1) pagination.put("prev", searchUrl(query, level, discipline, page - 1)).put("hasPrev", true);
		if (page < pages) pagination.put("next", searchUrl(query, level, discipline, page + 1)).put("hasNext", true);

		final JsonArray crumbs = crumbs(origin, new String[][]{{"Recherche", PATH + "/recherche"}});
		return base(config, origin, index, heading + " — " + siteTitle(config),
				"Recherchez parmi les exercices corrigés et gratuits de " + siteTitle(config) + ".",
				origin + PATH + "/recherche", null, "search", null)
				.put("robots", "noindex, follow")
				.put("isSearch", true)
				.put("breadcrumb", crumbs).put("hasBreadcrumb", true)
				.put("heading", heading)
				.put("lead", total == 0 ? "Aucun exercice ne correspond. Essayez un autre mot, ou parcourez les niveaux ci-dessous."
						: plural((int) total, "exercice trouvé", "exercices trouvés") + ".")
				.put("cards", cards)
				.put("empty", total == 0)
				.put("pagination", pagination)
				.put("search", searchForm(index, query, level, discipline)).put("hasSearch", true)
				.put("browse", browseLinks(index));
	}

	public static String searchUrl(final String q, final Level level, final Discipline discipline, final int page) {
		final List<String> params = new ArrayList<>();
		if (q != null && !q.isEmpty()) params.add("q=" + urlEncode(q));
		if (level != null) params.add("niveau=" + level.slug);
		if (discipline != null) params.add("matiere=" + discipline.slug);
		if (page > 1) params.add("page=" + page);
		return PATH + "/recherche" + (params.isEmpty() ? "" : "?" + String.join("&", params));
	}

	// ── Exercice ────────────────────────────────────────────────────────────────

	/** La page d'un exercice : fil d'Ariane, notion du programme, aperçu des questions, exercices voisins. */
	public static JsonObject exercise(final JsonObject config, final String origin, final SiteIndex index,
									  final JsonObject subject, final JsonArray grains) {
		final long id = ((Number) subject.getValue("id")).longValue();
		final String name = text(subject.getValue("title"));
		final Entry entry = index.entry(id);
		final Level level = entry == null || entry.levels.isEmpty() ? null : firstLevel(index, entry);
		final Discipline discipline = entry == null || entry.disciplines.isEmpty() ? null : index.discipline(entry.disciplines.get(0));
		final String summary = plainText(subject.getString("description"));
		final String context = (discipline == null ? "" : inSentence(discipline.longLabel))
				+ (level == null ? "" : (discipline == null ? "" : ", ") + level.label);
		final String description = truncate(entry != null && !entry.summary.isEmpty() ? entry.summary
				: "Exercice corrigé en ligne" + (context.isEmpty() ? "" : " de " + context)
				+ (entry != null && !entry.notion.isEmpty() ? " : " + lowerFirst(entry.notion) : "")
				+ ". Gratuit, sans inscription, correction immédiate.", 300);
		final String url = origin + exerciseUrl(id, name);

		final JsonArray questions = new JsonArray();
		int count = 0;
		for (final Object row : grains) {
			final JsonObject grain = (JsonObject) row;
			final JsonObject data = grain.getJsonObject("grain_copy_data", new JsonObject());
			final boolean statement = grain.getInteger("grain_type_id", 0) == AutomaticCorrection.STATEMENT;
			final String body = plainText(statement
					? data.getJsonObject("custom_copy_data", new JsonObject()).getString("statement")
					: data.getString("statement"));
			if (!statement) count++;
			questions.add(new JsonObject().put("title", text(data.getValue("title"))).put("text", truncate(body, 400)));
		}

		final List<String[]> path = new ArrayList<>();
		if (level != null) path.add(new String[]{level.label, levelUrl(level)});
		if (level != null && discipline != null) path.add(new String[]{discipline.label, disciplineUrl(level, discipline)});
		path.add(new String[]{name, exerciseUrl(id, name)});
		final JsonArray crumbs = crumbs(origin, path.toArray(new String[0][]));

		final JsonArray chips = new JsonArray();
		if (entry != null) {
			for (final Long l : entry.levels) if (index.level(l) != null) chips.add(index.level(l).label);
		}
		if (discipline != null) chips.add(discipline.label);
		if (count > 0) chips.add(plural(count, "question", "questions"));

		final JsonObject quiz = new JsonObject().put("@type", "Quiz")
				.put("name", name).put("description", description).put("url", url)
				.put("isAccessibleForFree", true).put("inLanguage", "fr")
				.put("learningResourceType", "Exercice autocorrigé")
				.put("numberOfQuestions", count);
		if (level != null) quiz.put("educationalLevel", level.label);
		if (discipline != null) quiz.put("about", discipline.longLabel);
		final JsonArray alignments = subject.getJsonArray("alignments", new JsonArray());
		if (!alignments.isEmpty()) {
			final JsonArray educationalAlignment = new JsonArray();
			for (final Object a : alignments) {
				if (!(a instanceof JsonObject)) continue;
				final JsonObject alignment = (JsonObject) a;
				educationalAlignment.add(new JsonObject().put("@type", "AlignmentObject")
						.put("alignmentType", "teaches")
						.put("educationalFramework", "Programmes de l'Éducation nationale")
						.put("targetName", text(alignment.getValue("label")))
						.put("targetDescription", text(alignment.getValue("code"))));
			}
			quiz.put("educationalAlignment", educationalAlignment);
		}

		final JsonObject params = base(config, origin, index, name + (context.isEmpty() ? "" : " — " + context) + " | " + siteTitle(config),
				description, url, graph(quiz, breadcrumbLd(crumbs)), "exercise", id)
				.put("isExercise", true)
				.put("breadcrumb", crumbs).put("hasBreadcrumb", true)
				.put("heading", name)
				.put("summary", summary)
				.put("hasSummary", !summary.isEmpty())
				.put("chips", chips)
				.put("questions", questions)
				.put("group", level == null ? "" : level.group);
		if (entry != null && !entry.notion.isEmpty()) {
			params.put("notion", entry.notion).put("hasNotion", true)
					.put("domain", domainOf(entry)).put("hasDomain", !entry.domain.isEmpty());
		}
		final JsonArray related = related(index, entry, level, discipline);
		params.put("related", related).put("hasRelated", !related.isEmpty());
		if (level != null && discipline != null) {
			params.put("moreUrl", disciplineUrl(level, discipline)).put("hasMore", true)
					.put("moreLabel", "Tous les exercices de " + inSentence(discipline.longLabel) + " en " + level.label);
		}
		if (discipline != null) accent(params, discipline);
		return params;
	}

	/** Le même chapitre d'abord, puis la même matière au même niveau. */
	private static JsonArray related(final SiteIndex index, final Entry entry, final Level level, final Discipline discipline) {
		final JsonArray out = new JsonArray();
		if (entry == null || level == null || discipline == null) return out;
		final List<Entry> pool = index.entries(level, discipline);
		final List<Entry> picked = new ArrayList<>();
		for (final Entry e : pool) if (e.id != entry.id && !entry.domain.isEmpty() && entry.domain.equals(e.domain)) picked.add(e);
		for (final Entry e : pool) if (e.id != entry.id && !picked.contains(e)) picked.add(e);
		// Les voisins dans l'ordre du programme, autour de l'exercice.
		for (final Entry e : picked.subList(0, Math.min(6, picked.size()))) out.add(card(index, e));
		return out;
	}

	private static Level firstLevel(final SiteIndex index, final Entry entry) {
		for (final Long id : entry.levels) if (index.level(id) != null) return index.level(id);
		return null;
	}

	// ── Plan du site, robots ────────────────────────────────────────────────────

	/** Le plan du site (sitemaps.org) : l'accueil, chaque niveau, chaque matière d'un niveau, chaque exercice. */
	public static String sitemap(final String origin, final SiteIndex index) {
		final StringBuilder xml = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
				.append("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
		url(xml, origin + PATH, null, "1.0");
		for (final Level level : index.usedLevels()) {
			url(xml, origin + levelUrl(level), null, "0.9");
			for (final Discipline d : index.usedDisciplines(level)) url(xml, origin + disciplineUrl(level, d), null, "0.8");
		}
		for (final Entry e : index.entries) {
			url(xml, origin + exerciseUrl(e.id, e.title), e.modified != null && e.modified.length() >= 10 ? e.modified.substring(0, 10) : null, "0.6");
		}
		return xml.append("</urlset>\n").toString();
	}

	private static void url(final StringBuilder xml, final String loc, final String modified, final String priority) {
		xml.append("<url><loc>").append(escape(loc)).append("</loc>");
		if (modified != null) xml.append("<lastmod>").append(escape(modified)).append("</lastmod>");
		xml.append("<priority>").append(priority).append("</priority></url>\n");
	}

	/** robots.txt : le site public s'indexe, sa recherche et ses médias non. */
	public static String robots(final String origin) {
		return "User-agent: *\nAllow: " + PATH + "\nDisallow: " + PATH + "/media/\nDisallow: " + PATH + "/recherche\n"
				+ "Sitemap: " + origin + PATH + "/sitemap.xml\n";
	}

	// ── Adresses ────────────────────────────────────────────────────────────────

	public static String levelUrl(final Level level) {
		return PATH + "/niveau/" + level.slug;
	}

	public static String disciplineUrl(final Level level, final Discipline discipline) {
		return levelUrl(level) + "/" + discipline.slug;
	}

	public static String exerciseUrl(final long id, final String title) {
		final String slug = SiteIndex.slug(title);
		return PATH + "/exercice/" + id + (slug.isEmpty() ? "" : "/" + slug);
	}

	// ── Morceaux communs ────────────────────────────────────────────────────────

	private static JsonObject base(final JsonObject config, final String origin, final SiteIndex index, final String title,
								   final String description, final String canonical, final JsonObject jsonld,
								   final String page, final Long subjectId) {
		final String ent = entName(config);
		final String entUrl = config.getString("ent-url", "");
		final JsonArray footerLevels = new JsonArray();
		for (final Level level : index.usedLevels()) {
			footerLevels.add(new JsonObject().put("label", "Exercices de " + level.label).put("url", levelUrl(level)));
		}
		final JsonObject boot = new JsonObject().put("page", page).put("config", publicConfig(config));
		if (subjectId != null) boot.put("subjectId", subjectId);
		return new JsonObject()
				.put("product", product(config))
				.put("title", title)
				.put("description", description)
				.put("canonical", canonical)
				.put("robots", "index, follow")
				.put("ogImage", config.getString("og-image", ""))
				.put("hasOgImage", !config.getString("og-image", "").isEmpty())
				.put("jsonld", jsonld == null ? "{}" : scriptJson(jsonld))
				.put("boot", scriptJson(boot))
				.put("site", new JsonObject()
						.put("name", siteTitle(config))
						.put("short", shortName(config))
						.put("ent", ent)
						.put("hasEnt", !ent.isEmpty() && !entUrl.isEmpty())
						.put("entUrl", entUrl)
						.put("signupUrl", config.getString("signup-url", "/auth/login"))
						.put("home", PATH)
						.put("searchUrl", PATH + "/recherche"))
				.put("footerLevels", footerLevels)
				// Les sections du gabarit ne se fient qu'à des booléens et des listes : une clé absente ou une
				// chaîne vide y serait VRAIE (jmustache).
				.put("isHome", false).put("isLevel", false).put("isDiscipline", false).put("isSearch", false)
				.put("isExercise", false).put("hasBreadcrumb", false).put("breadcrumb", new JsonArray())
				.put("hasSearch", false).put("hasSiblings", false).put("siblings", new JsonArray())
				.put("hasNotion", false).put("hasDomain", false).put("hasSummary", false).put("hasRelated", false)
				.put("hasMore", false).put("hasToc", false).put("hasOtherLevels", false).put("group", "");
	}

	/** Les niveaux du même cycle, celui de la page compris : des liens internes. */
	private static JsonArray siblings(final SiteIndex index, final Level level) {
		final JsonArray out = new JsonArray();
		for (final Level other : index.usedLevels()) {
			final boolean current = other.id == level.id;
			if (!current && !other.group.equals(level.group)) continue;
			out.add(new JsonObject().put("label", other.label).put("url", levelUrl(other)).put("current", current));
		}
		return out;
	}

	private static JsonArray browseLinks(final SiteIndex index) {
		final JsonArray out = new JsonArray();
		for (final Level level : index.usedLevels()) out.add(new JsonObject().put("label", level.label).put("url", levelUrl(level)));
		return out;
	}

	private static JsonObject searchForm(final SiteIndex index, final String q, final Level level, final Discipline discipline) {
		final JsonArray levels = new JsonArray();
		for (final Level l : index.usedLevels()) {
			levels.add(new JsonObject().put("value", l.slug).put("label", l.label).put("selected", level != null && level.id == l.id ? "selected" : "data-option"));
		}
		final JsonArray disciplines = new JsonArray();
		final List<Discipline> used = new ArrayList<>(index.usedDisciplines(null));
		used.sort((a, b) -> a.label.compareToIgnoreCase(b.label));
		for (final Discipline d : used) {
			disciplines.add(new JsonObject().put("value", d.slug).put("label", d.label)
					.put("selected", discipline != null && discipline.id == d.id ? "selected" : "data-option"));
		}
		return new JsonObject().put("q", q).put("levels", levels).put("disciplines", disciplines);
	}

	private static JsonObject card(final SiteIndex index, final Entry e) {
		final List<String> levels = new ArrayList<>();
		for (final Long id : e.levels) if (index.level(id) != null) levels.add(index.level(id).label);
		final Discipline discipline = e.disciplines.isEmpty() ? null : index.discipline(e.disciplines.get(0));
		final JsonObject card = new JsonObject()
				.put("url", exerciseUrl(e.id, e.title))
				.put("title", e.title)
				.put("summary", truncate(e.summary, 140))
				.put("hasSummary", !e.summary.isEmpty())
				.put("notion", truncate(e.notion, 150))
				.put("hasNotion", !e.notion.isEmpty())
				.put("levels", String.join(" · ", levels))
				.put("discipline", discipline == null ? "" : discipline.label)
				.put("questions", e.questions > 0 ? plural(e.questions, "question", "questions") : "");
		if (discipline != null) accent(card, discipline);
		else card.put("accent", "slate").put("monogram", "Ex");
		return card;
	}

	private static JsonObject accent(final JsonObject target, final Discipline d) {
		final String[] accent = ACCENTS.get(d.code);
		return target.put("accent", accent == null ? "slate" : accent[0])
				.put("monogram", accent == null ? (d.label.length() > 1 ? d.label.substring(0, 2) : d.label) : accent[1]);
	}

	private static String domainOf(final Entry e) {
		return e.domain.isEmpty() ? "Autres exercices" : e.domain;
	}

	private static JsonArray crumbs(final String origin, final String[]... path) {
		final JsonArray out = new JsonArray().add(new JsonObject().put("label", "Accueil").put("url", PATH)
				.put("absolute", origin + PATH).put("last", false));
		for (int i = 0; i < path.length; i++) {
			out.add(new JsonObject().put("label", path[i][0]).put("url", path[i][1]).put("absolute", origin + path[i][1])
					.put("last", i == path.length - 1));
		}
		return out;
	}

	private static JsonObject breadcrumbLd(final JsonArray crumbs) {
		final JsonArray items = new JsonArray();
		int position = 1;
		for (final Object o : crumbs) {
			final JsonObject c = (JsonObject) o;
			items.add(new JsonObject().put("@type", "ListItem").put("position", position++)
					.put("name", c.getString("label")).put("item", c.getString("absolute")));
		}
		return new JsonObject().put("@type", "BreadcrumbList").put("itemListElement", items);
	}

	private static JsonObject collection(final String name, final String description, final String url,
										 final List<Entry> entries, final String origin) {
		final JsonArray items = new JsonArray();
		int position = 1;
		for (final Entry e : entries) {
			items.add(new JsonObject().put("@type", "ListItem").put("position", position++)
					.put("url", origin + exerciseUrl(e.id, e.title)).put("name", e.title));
		}
		return new JsonObject().put("@type", "CollectionPage").put("name", name).put("description", description)
				.put("url", url).put("inLanguage", "fr")
				.put("mainEntity", new JsonObject().put("@type", "ItemList").put("numberOfItems", entries.size())
						.put("itemListElement", items));
	}

	private static JsonObject graph(final JsonObject... nodes) {
		final JsonArray graph = new JsonArray();
		for (final JsonObject n : nodes) graph.add(n);
		return new JsonObject().put("@context", "https://schema.org").put("@graph", graph);
	}

	private static String siteTitle(final JsonObject config) {
		return config.getString("title", "Exercices");
	}

	/** Le nom de l'ENT à faire découvrir : {@code ent-name}, sinon ce qui suit « Exercices » dans le titre. */
	static String entName(final JsonObject config) {
		final String configured = config.getString("ent-name", "");
		if (!configured.isEmpty()) return configured;
		final String title = siteTitle(config);
		return title.matches("(?i)exercices\\s+\\S.*") ? title.replaceFirst("(?i)exercices\\s+", "") : "";
	}

	private static String shortName(final JsonObject config) {
		final String title = siteTitle(config);
		return title.matches("(?i)exercices\\s+\\S.*") ? "Exercices" : title;
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
				.put("title", siteTitle(config))
				.put("signupUrl", config.getString("signup-url", "/auth/login"))
				.put("entUrl", config.getString("ent-url", ""))
				.put("entName", entName(config));
	}

	/** « du CE1 à la 3e », « du CP au CM2 », « de la 6e à la 3e ». */
	static String range(final List<Level> levels) {
		if (levels.isEmpty()) return "";
		final Level first = levels.get(0);
		final Level last = levels.get(levels.size() - 1);
		if (first.id == last.id) return "en " + inSentence(first.label);
		return (feminine(first.label) ? "de la " : "du ") + inSentence(first.label)
				+ (feminine(last.label) ? " à la " : " au ") + inSentence(last.label);
	}

	private static boolean feminine(final String label) {
		return label.matches("\\d.*") || label.matches("(?i)(petite|moyenne|grande|seconde|terminale|premi).*");
	}

	/** Une matière au milieu d'une phrase : « mathématiques », mais « SVT ». */
	static String inSentence(final String label) {
		if (label == null || label.isEmpty()) return "";
		if (label.length() > 1 && Character.isUpperCase(label.charAt(1))) return label;
		return label.substring(0, 1).toLowerCase(Locale.FRENCH) + label.substring(1);
	}

	private static String lowerFirst(final String text) {
		return inSentence(text);
	}

	private static List<String> lower(final List<String> items) {
		final List<String> out = new ArrayList<>();
		for (final String item : items) out.add(inSentence(item));
		return out;
	}

	/** « a, b et c ». */
	private static String join(final List<String> items) {
		if (items.size() <= 1) return String.join("", items);
		return String.join(", ", items.subList(0, items.size() - 1)) + " et " + items.get(items.size() - 1);
	}

	static String plural(final int count, final String one, final String many) {
		return number(count) + " " + (count > 1 ? many : one);
	}

	/** 4284 → « 4 284 » (espace fine insécable). */
	static String number(final long value) {
		return String.format(Locale.FRENCH, "%,d", value).replace('\u00a0', '\u202f').replace(',', '\u202f');
	}

	private static String urlEncode(final String value) {
		try {
			return java.net.URLEncoder.encode(value, "UTF-8");
		} catch (java.io.UnsupportedEncodingException e) {
			return "";
		}
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

	static String truncate(final String text, final int max) {
		if (text == null) return "";
		return text.length() <= max ? text : text.substring(0, max - 1).trim() + "…";
	}

	private static String text(final Object value) {
		return value == null ? "" : plainText(value.toString());
	}
}
