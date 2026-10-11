package fr.openent.exercizer.interoperability;

import io.vertx.core.json.JsonObject;

/**
 * Lecture du modèle CMI, dans les deux versions de SCORM.
 *
 * Les deux n'emploient ni les mêmes clés ni la même échelle, et c'est le piège : écrire ou lire
 * les clés de l'une en croyant lire l'autre ne lève aucune erreur — la progression disparaît
 * simplement, sans trace.
 *
 * <ul>
 *   <li><strong>1.2</strong> : {@code cmi.core.lesson_status} porte à la fois l'achèvement et la
 *       réussite ({@code passed}, {@code failed}, {@code completed}, {@code incomplete}…), et le
 *       score est brut ({@code cmi.core.score.raw}) sur une échelle donnée par
 *       {@code cmi.core.score.max}.</li>
 *   <li><strong>2004</strong> : l'achèvement ({@code cmi.completion_status}) et la réussite
 *       ({@code cmi.success_status}) sont distincts, et le score normalisé
 *       ({@code cmi.score.scaled}) va de -1 à 1.</li>
 * </ul>
 */
public final class ScormCmi {

    public static final String VERSION_12 = "1.2";
    public static final String VERSION_2004 = "2004";

    private final JsonObject cmi;
    private final String version;

    public ScormCmi(JsonObject cmi, String version) {
        this.cmi = cmi == null ? new JsonObject() : cmi;
        this.version = VERSION_2004.equals(version) ? VERSION_2004 : VERSION_12;
    }

    /** @return le score brut, ou {@code null} si le SCO n'en a pas rapporté. */
    public Double scoreRaw() {
        Double raw = readDouble(VERSION_2004.equals(version) ? "cmi.score.raw" : "cmi.core.score.raw");
        if (raw != null) {
            return raw;
        }
        if (VERSION_2004.equals(version)) {
            // Un SCO 2004 peut ne rapporter que le score normalisé ; le ramener à l'échelle
            // déclarée vaut mieux que de rendre « pas de score ».
            Double scaled = readDouble("cmi.score.scaled");
            Double max = scoreMax();
            if (scaled != null && max != null) {
                return scaled * max;
            }
        }
        return null;
    }

    public Double scoreMax() {
        return readDouble(VERSION_2004.equals(version) ? "cmi.score.max" : "cmi.core.score.max");
    }

    /** @return la part du barème obtenue, entre 0 et 1, ou {@code null} si indéterminable. */
    public Double ratio() {
        if (VERSION_2004.equals(version)) {
            Double scaled = readDouble("cmi.score.scaled");
            if (scaled != null) {
                // L'échelle de 2004 va de -1 à 1 ; une note négative vaut zéro pour nous.
                return Math.max(0d, Math.min(1d, scaled));
            }
        }
        Double raw = scoreRaw();
        Double max = scoreMax();
        if (raw == null || max == null || max <= 0d) {
            return null;
        }
        return Math.max(0d, Math.min(1d, raw / max));
    }

    public boolean completed() {
        if (VERSION_2004.equals(version)) {
            return "completed".equalsIgnoreCase(readString("cmi.completion_status"));
        }
        String status = readString("cmi.core.lesson_status");
        return "completed".equalsIgnoreCase(status) || "passed".equalsIgnoreCase(status)
                || "failed".equalsIgnoreCase(status);
    }

    /** @return {@code null} si le SCO ne se prononce pas sur la réussite, ce qui est licite. */
    public Boolean passed() {
        String status = VERSION_2004.equals(version)
                ? readString("cmi.success_status") : readString("cmi.core.lesson_status");
        if (status == null) {
            return null;
        }
        if ("passed".equalsIgnoreCase(status)) {
            return Boolean.TRUE;
        }
        if ("failed".equalsIgnoreCase(status)) {
            return Boolean.FALSE;
        }
        return null;
    }

    /**
     * Note à reporter sur le grain, rapportée à son barème.
     *
     * @return {@code null} si le SCO n'a pas rapporté de score : poser zéro ferait passer pour
     *         un échec ce qui n'est qu'une absence de mesure.
     */
    public Double gradeOver(double maxScore) {
        Double ratio = ratio();
        return ratio == null ? null : Math.round(ratio * maxScore * 100d) / 100d;
    }

    private String readString(String key) {
        Object value = cmi.getValue(key);
        return value == null ? null : String.valueOf(value);
    }

    private Double readDouble(String key) {
        Object value = cmi.getValue(key);
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        if (value instanceof String) {
            try {
                // Un SCO écrit toutes ses valeurs en chaînes : l'API SCORM ne transporte que du
                // texte, et attendre un nombre ici ne trouverait jamais rien.
                return Double.valueOf(((String) value).trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }
}
