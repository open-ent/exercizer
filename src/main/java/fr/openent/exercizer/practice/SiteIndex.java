package fr.openent.exercizer.practice;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * L'index du site public : les exercices publiés, leurs niveaux et matières, et la place de chacun dans
 * le programme officiel (domaine, thème, notion), lue dans l'arbre CASE auquel le sujet est aligné.
 *
 * Construit à partir de données déjà publiques (sujets expurgés par {@code publicSubject}, référentiel,
 * arbres des programmes) ; il ne fait aucun accès lui-même, ce qui le rend testable. Le contrôleur le
 * garde en cache quelques minutes : toutes les pages de navigation et le plan du site en dérivent.
 */
public final class SiteIndex {

	/** Un niveau scolaire tel que le site l'affiche : « 6e », « CE1 ». */
	public static final class Level {
		public final long id;
		public final String code;
		public final String slug;
		public final String label;
		public final String group;
		public final int rank;

		Level(final long id, final String code, final String label, final String group, final int rank) {
			this.id = id;
			this.code = code;
			this.slug = slug(code);
			this.label = label;
			this.group = group;
			this.rank = rank;
		}
	}

	/** Une matière : « Mathématiques », avec un nom long pour les titres (« SVT » → « Sciences de la vie… »). */
	public static final class Discipline {
		public final long id;
		public final String code;
		public final String slug;
		public final String label;
		public final String longLabel;

		Discipline(final long id, final String code, final String label, final String longLabel) {
			this.id = id;
			this.code = code;
			this.slug = slug(code);
			this.label = label;
			this.longLabel = longLabel;
		}
	}

	/** Un exercice publié et sa place dans le programme. */
	public static final class Entry {
		public final long id;
		public final String title;
		public final String slug;
		public final String summary;
		public final int questions;
		public final List<Long> levels;
		public final List<Long> disciplines;
		/** Domaine du programme (« Nombres et calculs »), ou vide si le sujet n'est pas aligné. */
		public final String domain;
		/** Thème sous le domaine (« Thème 1 : Chrétientés et islam »), ou vide. */
		public final String theme;
		/** L'objectif ou l'attendu précis auquel le sujet est aligné. */
		public final String notion;
		/** Ordre du programme : l'exercice se range là où sa notion apparaît. */
		public final String order;
		public final String modified;

		Entry(final long id, final String title, final String summary, final int questions, final List<Long> levels,
			  final List<Long> disciplines, final String domain, final String theme, final String notion,
			  final String order, final String modified) {
			this.id = id;
			this.title = title;
			this.slug = slug(title);
			this.summary = summary;
			this.questions = questions;
			this.levels = levels;
			this.disciplines = disciplines;
			this.domain = domain;
			this.theme = theme;
			this.notion = notion;
			this.order = order;
			this.modified = modified;
		}
	}

	private static final Map<String, String> GROUPS = new LinkedHashMap<>();
	private static final Map<String, String[]> DISCIPLINE_NAMES = new HashMap<>();

	static {
		GROUPS.put("maternelle", "Maternelle");
		GROUPS.put("elementaire", "École élémentaire");
		GROUPS.put("college", "Collège");
		GROUPS.put("lycee", "Lycée");
		GROUPS.put("lycee_pro", "Lycée professionnel");
		GROUPS.put("superieur", "Après le bac");
		DISCIPLINE_NAMES.put("HISTOIRE_GEO", new String[]{"Histoire-géographie", "Histoire-géographie"});
		DISCIPLINE_NAMES.put("PHYSIQUE_CHIMIE", new String[]{"Physique-chimie", "Physique-chimie"});
		DISCIPLINE_NAMES.put("SVT", new String[]{"SVT", "Sciences de la vie et de la Terre"});
		DISCIPLINE_NAMES.put("TECHNOLOGIE", new String[]{"Technologie", "Technologie"});
		DISCIPLINE_NAMES.put("EMC", new String[]{"EMC", "Enseignement moral et civique"});
		DISCIPLINE_NAMES.put("LANGAGE", new String[]{"Langage", "Mobiliser le langage"});
	}

	public final List<Level> levels;
	public final List<Discipline> disciplines;
	public final List<Entry> entries;
	private final Map<Long, Level> levelById = new HashMap<>();
	private final Map<String, Level> levelBySlug = new HashMap<>();
	private final Map<Long, Discipline> disciplineById = new HashMap<>();
	private final Map<String, Discipline> disciplineBySlug = new HashMap<>();
	private final Map<Long, Entry> entryById = new HashMap<>();

	private SiteIndex(final List<Level> levels, final List<Discipline> disciplines, final List<Entry> entries) {
		this.levels = levels;
		this.disciplines = disciplines;
		this.entries = entries;
		levels.forEach(l -> {
			levelById.put(l.id, l);
			levelBySlug.put(l.slug, l);
		});
		disciplines.forEach(d -> {
			disciplineById.put(d.id, d);
			disciplineBySlug.put(d.slug, d);
		});
		entries.forEach(e -> entryById.put(e.id, e));
	}

	/**
	 * @param subjects    les sujets publics (forme {@code publicSubject})
	 * @param referential le référentiel aux libellés traduits ({@code levels}, {@code disciplines})
	 * @param trees       les nœuds des arbres de programme ({@code nodes} de {@code programmeTree}), tous programmes confondus
	 */
	public static SiteIndex build(final JsonArray subjects, final JsonObject referential, final JsonArray trees) {
		final Map<String, JsonObject> nodes = new HashMap<>();
		for (final Object n : trees) {
			if (n instanceof JsonObject && ((JsonObject) n).getString("id") != null) {
				nodes.put(((JsonObject) n).getString("id"), (JsonObject) n);
			}
		}
		final List<Level> levels = new ArrayList<>();
		for (final Object o : referential.getJsonArray("levels", new JsonArray())) {
			if (!(o instanceof JsonObject) || !(((JsonObject) o).getValue("id") instanceof Number)) continue;
			final JsonObject row = (JsonObject) o;
			final String code = row.getString("code", "");
			levels.add(new Level(((Number) row.getValue("id")).longValue(), code,
					levelLabel(code, row.getString("label", code)), row.getString("level_group", ""),
					row.getInteger("rank", 999)));
		}
		levels.sort(Comparator.comparingInt((Level l) -> l.rank).thenComparing(l -> l.code));
		final List<Discipline> disciplines = new ArrayList<>();
		for (final Object o : referential.getJsonArray("disciplines", new JsonArray())) {
			if (!(o instanceof JsonObject) || !(((JsonObject) o).getValue("id") instanceof Number)) continue;
			final JsonObject row = (JsonObject) o;
			final String code = row.getString("code", "");
			final String[] names = DISCIPLINE_NAMES.get(code);
			final String label = row.getString("label", code);
			disciplines.add(new Discipline(((Number) row.getValue("id")).longValue(), code,
					names == null ? label : names[0], names == null ? label : names[1]));
		}
		final List<Entry> entries = new ArrayList<>();
		for (final Object o : subjects) {
			if (!(o instanceof JsonObject) || !(((JsonObject) o).getValue("id") instanceof Number)) continue;
			entries.add(entry((JsonObject) o, nodes));
		}
		entries.sort(Comparator.comparing((Entry e) -> e.order).thenComparing(e -> e.title.toLowerCase(Locale.FRENCH)));
		return new SiteIndex(Collections.unmodifiableList(levels), Collections.unmodifiableList(disciplines),
				Collections.unmodifiableList(entries));
	}

	/** Un sujet que l'index ne connaît pas encore (publié depuis sa construction) : sans place dans le programme. */
	public static Entry loose(final JsonObject subject) {
		return entry(subject, Collections.emptyMap());
	}

	private static Entry entry(final JsonObject subject, final Map<String, JsonObject> nodes) {
		String domain = "";
		String theme = "";
		String notion = "";
		String order = "~";
		for (final Object a : subject.getJsonArray("alignments", new JsonArray())) {
			if (!(a instanceof JsonObject)) continue;
			final JsonObject alignment = (JsonObject) a;
			final JsonObject item = nodes.get(alignment.getString("id"));
			if (item == null) {
				if (notion.isEmpty()) notion = PracticePages.plainText(alignment.getString("label"));
				continue;
			}
			// De la notion vers la racine : le domaine est le premier « Domaine » rencontré, le thème le
			// premier « Sous-domaine » avant lui.
			final List<JsonObject> path = new ArrayList<>();
			for (JsonObject n = item; n != null && path.size() < 20; n = nodes.get(n.getString("parent"))) path.add(n);
			JsonObject domainNode = null;
			JsonObject themeNode = null;
			for (final JsonObject n : path) {
				final String type = n.getString("type", "");
				if ("Domaine".equals(type)) {
					domainNode = n;
					break;
				}
				if (themeNode == null && "Sous-domaine".equals(type)) themeNode = n;
			}
			domain = domainNode == null ? "" : cleanLabel(domainNode.getString("label"));
			theme = domainNode == null || themeNode == null ? "" : cleanLabel(themeNode.getString("label"));
			notion = PracticePages.plainText(alignment.getString("label"));
			final StringBuilder key = new StringBuilder();
			for (int i = path.size() - 1; i >= 0; i--) {
				key.append(String.format("%04d.", path.get(i).getInteger("seq", 0)));
			}
			order = key.toString();
			break;
		}
		final String title = PracticePages.plainText(subject.getString("title"));
		final String summary = PracticePages.plainText(subject.getString("description"));
		return new Entry(((Number) subject.getValue("id")).longValue(), title,
				// Les descriptions générées répètent le titre (« Titre — notion, sixième. ») : sans intérêt.
				summary.startsWith(title) ? "" : summary,
				subject.getInteger("question_count", 0), ids(subject.getJsonArray("level_ids")),
				ids(subject.getJsonArray("discipline_ids")), domain, theme, notion, order,
				subject.getString("modified", ""));
	}

	// ── Requêtes ────────────────────────────────────────────────────────────────

	public Level level(final String slug) {
		return slug == null ? null : levelBySlug.get(slug.toLowerCase(Locale.ROOT));
	}

	public Level level(final long id) {
		return levelById.get(id);
	}

	public Discipline discipline(final String slug) {
		return slug == null ? null : disciplineBySlug.get(slug.toLowerCase(Locale.ROOT));
	}

	public Discipline discipline(final long id) {
		return disciplineById.get(id);
	}

	public Entry entry(final long id) {
		return entryById.get(id);
	}

	/** Les exercices d'un niveau, et d'une matière si elle est donnée. */
	public List<Entry> entries(final Level level, final Discipline discipline) {
		final List<Entry> out = new ArrayList<>();
		for (final Entry e : entries) {
			if (level != null && !e.levels.contains(level.id)) continue;
			if (discipline != null && !e.disciplines.contains(discipline.id)) continue;
			out.add(e);
		}
		return out;
	}

	/** Les niveaux qui ont au moins un exercice, dans l'ordre scolaire. */
	public List<Level> usedLevels() {
		final List<Level> out = new ArrayList<>();
		for (final Level l : levels) if (!entries(l, null).isEmpty()) out.add(l);
		return out;
	}

	/** Les matières qui ont au moins un exercice (pour un niveau donné, ou en tout), les plus fournies d'abord. */
	public List<Discipline> usedDisciplines(final Level level) {
		final List<Discipline> out = new ArrayList<>();
		for (final Discipline d : disciplines) if (!entries(level, d).isEmpty()) out.add(d);
		out.sort(Comparator.comparingInt((Discipline d) -> -entries(level, d).size()).thenComparing(d -> d.label));
		return out;
	}

	public int questionCount() {
		int total = 0;
		for (final Entry e : entries) total += e.questions;
		return total;
	}

	public static String groupLabel(final String group) {
		return GROUPS.getOrDefault(group, "");
	}

	public static List<String> groups() {
		return new ArrayList<>(GROUPS.keySet());
	}

	// ── Libellés ────────────────────────────────────────────────────────────────

	/** « 6E » → « 6e » ; les autres niveaux gardent leur libellé (CP, CE1, Petite section). */
	static String levelLabel(final String code, final String label) {
		if (code.matches("\\d+E")) return code.substring(0, code.length() - 1) + "e";
		return label;
	}

	/**
	 * Un intitulé de programme lisible : sans le volume horaire (« (45 heures) ») ni le rappel du
	 * niveau (« Sixième : »), avec une majuscule.
	 */
	static String cleanLabel(final String label) {
		String text = PracticePages.plainText(label)
				.replaceAll("\\s*\\([^()]*\\bheures?\\)", "")
				.replaceAll("^(Sixième|Cinquième|Quatrième|Troisième)\\s*:\\s*", "")
				.trim();
		if (text.isEmpty()) return text;
		return text.substring(0, 1).toUpperCase(Locale.FRENCH) + text.substring(1);
	}

	/** Un segment d'adresse : minuscules sans accents, mots séparés par des tirets. */
	public static String slug(final String text) {
		if (text == null) return "";
		final String ascii = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
				.replace("œ", "oe").replace("Œ", "oe").replace("æ", "ae");
		final String slug = ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
		return slug.length() > 80 ? slug.substring(0, 80).replaceAll("-[^-]*$", "") : slug;
	}

	private static List<Long> ids(final JsonArray values) {
		final List<Long> out = new ArrayList<>();
		if (values == null) return out;
		for (final Object v : values) if (v instanceof Number) out.add(((Number) v).longValue());
		return out;
	}
}
