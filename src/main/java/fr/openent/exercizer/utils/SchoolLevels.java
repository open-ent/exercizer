package fr.openent.exercizer.utils;

import io.vertx.core.json.JsonArray;
import io.vertx.core.json.JsonObject;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Niveaux d'enseignement servis par un établissement — les groupes de niveaux du catalogue
 * ({@code level_group} de sql/041) : maternelle, élémentaire, collège, lycée, lycée professionnel,
 * supérieur.
 *
 * Recopie de {@code org.entcore.directory.services.SchoolLevels} (entcore) et de
 * {@code schoolLevels.ts} (dashboard) : toute modification de la table se reporte aux trois.
 */
public final class SchoolLevels {

    public static final List<String> ALL = Collections.unmodifiableList(Arrays.asList(
            "maternelle", "elementaire", "college", "lycee", "lycee_pro", "superieur"));

    private SchoolLevels() {}

    /** Les niveaux déduits de la nature AAF d'un établissement ; vide si elle ne dit rien. */
    public static List<String> fromType(final String type) {
        if (type == null || type.trim().isEmpty()) return Collections.emptyList();
        final String t = Normalizer.normalize(type, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toUpperCase(Locale.ROOT);
        if (t.contains("MATERNELLE")) return Collections.singletonList("maternelle");
        if (t.contains("ECOLE") || t.contains("ELEMENTAIRE") || t.contains("PRIMAIRE")) {
            return Arrays.asList("maternelle", "elementaire");
        }
        if (t.contains("COLLEGE") || t.contains("SEGPA") || t.contains("EREA")
                || t.contains("ENSEIGNT ADAPTE") || t.contains("ENSEIGNEMENT ADAPTE")) {
            return Collections.singletonList("college");
        }
        if (t.contains("LYCEE")) {
            if (t.contains("POLYVALENT")) return Arrays.asList("lycee", "lycee_pro");
            if (t.contains("PROFESSIONNEL")) return Collections.singletonList("lycee_pro");
            return Collections.singletonList("lycee");
        }
        return Collections.emptyList();
    }

    /**
     * Les niveaux servis par ces établissements ({@code schoolLevels}, {@code type}) : l'union de ceux
     * qu'un administrateur a choisis, et pour les autres de ceux que l'on déduit de leur nature.
     * {@code source} dit d'où ils viennent : {@code structures} (au moins un choix explicite),
     * {@code type} (seulement déduits) ou {@code none}.
     */
    public static JsonObject resolve(final JsonArray structures) {
        final Set<String> levels = new LinkedHashSet<>();
        boolean explicit = false;
        for (Object row : structures) {
            if (!(row instanceof JsonObject)) continue;
            final JsonObject structure = (JsonObject) row;
            final JsonArray chosen = structure.getJsonArray("schoolLevels");
            if (chosen != null && !chosen.isEmpty()) {
                explicit = true;
                chosen.forEach(level -> {
                    if (ALL.contains(level)) levels.add((String) level);
                });
            } else {
                levels.addAll(fromType(structure.getString("type")));
            }
        }
        final List<String> ordered = ALL.stream().filter(levels::contains).collect(Collectors.toList());
        return new JsonObject()
                .put("schoolLevels", new JsonArray(ordered))
                .put("source", ordered.isEmpty() ? "none" : explicit ? "structures" : "type");
    }
}
