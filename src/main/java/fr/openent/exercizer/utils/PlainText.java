package fr.openent.exercizer.utils;

import io.vertx.core.json.JsonObject;

import java.util.regex.Pattern;

/**
 * Texte brut à partir d'un fragment HTML, pour les champs qu'exercizer saisit et affiche en TEXTE.
 *
 * <p>L'explication d'une réponse ({@code answer_explanation}) est une zone de texte dans les deux
 * éditeurs, et s'affiche telle quelle à la correction et à l'impression. Du balisage y apparaît
 * donc littéralement à l'élève ({@code <p>…</p>}). Les packs pédagogiques en portaient sur près de
 * 2 000 questions : le générateur l'enveloppait dans un paragraphe.</p>
 *
 * <p>Même règle que la migration {@code 049-answer-explanation-plain-text.sql} et que
 * {@code htmlToText} côté navigateur : fins de bloc et {@code <br>} deviennent des sauts de ligne,
 * les balises disparaissent, les entités courantes sont décodées.</p>
 */
public final class PlainText {

    /** Les balises qu'un générateur ou un éditeur riche produit ; un « x < 3 » écrit à la main n'en est pas une. */
    private static final Pattern TAG = Pattern.compile(
            "</?(p|br|strong|em|b|i|u|span|div|ul|ol|li|sup|sub|h[1-6]|a)([\\s/][^>]*)?>",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern BLOCK_END = Pattern.compile("</(p|div|li|h[1-6])>\\s*|<br\\s*/?>",
            Pattern.CASE_INSENSITIVE);

    private PlainText() {
    }

    public static boolean looksLikeHtml(String value) {
        return value != null && TAG.matcher(value).find();
    }

    public static String fromHtml(String html) {
        if (html == null) {
            return null;
        }
        if (!looksLikeHtml(html)) {
            return html;
        }
        String text = BLOCK_END.matcher(html).replaceAll("\n");
        text = TAG.matcher(text).replaceAll("");
        text = text.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'")
                .replace("&amp;", "&");
        return text.replaceAll("\n{3,}", "\n\n").trim();
    }

    /** Ramène au texte l'explication d'un {@code grain_data}, en place ; rend le même objet. */
    public static JsonObject normaliseExplanation(JsonObject grainData) {
        if (grainData != null && grainData.getValue("answer_explanation") instanceof String) {
            String explanation = grainData.getString("answer_explanation");
            if (looksLikeHtml(explanation)) {
                grainData.put("answer_explanation", fromHtml(explanation));
            }
        }
        return grainData;
    }
}
