package fr.openent.exercizer.interoperability;

/**
 * Les types de grains d'exercizer, tels que les sème {@code sql/002-exercizer.sql}.
 *
 * Les identifiants sont des constantes de base de données : ils ne se devinent pas et ne se
 * renumérotent pas.
 */
public final class GrainType {

    /** Énoncé sans réponse attendue. Son texte vit dans {@code custom_data.statement}. */
    public static final long STATEMENT = 3L;
    /** Réponse simple : une seule réponse attendue, saisie libre. */
    public static final long SIMPLE_ANSWER = 4L;
    /** Réponse ouverte : rédaction, non corrigée automatiquement. */
    public static final long OPEN_ANSWER = 5L;
    /** Réponses multiples : plusieurs saisies libres attendues. */
    public static final long MULTIPLE_ANSWERS = 6L;
    /** QCM. */
    public static final long QCM = 7L;
    /** Association de paires. */
    public static final long ASSOCIATION = 8L;
    /** Mise en ordre. */
    public static final long ORDER_BY = 9L;
    /** Texte à trous. */
    public static final long TEXT_TO_FILL = 10L;

    private GrainType() {
    }
}
