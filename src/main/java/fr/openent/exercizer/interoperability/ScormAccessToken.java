package fr.openent.exercizer.interoperability;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.Charset;
import java.security.GeneralSecurityException;
import java.util.Base64;

/**
 * Jeton d'accès au contenu d'un paquet SCORM.
 *
 * Le contenu est servi depuis un domaine distinct de l'ENT, précisément pour que le code tiers
 * qu'il contient ne s'exécute pas dans le contexte de session de l'ENT. Mais ce cloisonnement a
 * une conséquence qu'il faut traiter : les cookies de session de l'ENT sont en
 * {@code SameSite=Lax}, et Lax ne les joint PAS aux requêtes d'une iframe tierce. Le domaine du
 * contenu ne voit donc aucune session, et ne peut pas en voir — c'est le but.
 *
 * L'autorisation voyage donc dans l'URL, sous forme d'un jeton signé que seul l'ENT sait
 * produire : il nomme le paquet, l'usager, une échéance et l'origine de la page de l'ENT qui
 * encadre le contenu. Il n'ouvre rien d'autre que la lecture des fichiers de ce paquet, et il
 * expire.
 *
 * <p>L'origine parente est signée avec le reste parce que l'ENT est servi sous plusieurs hôtes
 * ({@code www}, {@code cd04}, {@code eclat-bfc}…) : le pont injecté dans le contenu ne parle qu'à
 * cette origine, et elle ne peut donc être ni une constante de la plateforme (le suivi serait
 * perdu hors de {@code www}), ni un paramètre libre de l'URL.</p>
 *
 * Le secret est celui de la plateforme ; il ne quitte jamais le serveur.
 */
public final class ScormAccessToken {

    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final String ALGORITHM = "HmacSHA256";
    private static final String SEPARATOR = ".";

    private final String secret;
    private final long lifetimeMillis;

    public ScormAccessToken(String secret, long lifetimeMillis) {
        if (secret == null || secret.trim().isEmpty()) {
            throw new IllegalArgumentException(
                    "Aucun secret de signature : le contenu SCORM ne peut pas être servi sans.");
        }
        this.secret = secret;
        this.lifetimeMillis = lifetimeMillis > 0 ? lifetimeMillis : 3_600_000L;
    }

    public String issue(long packageId, String userId, long now) {
        return issue(packageId, userId, now, null);
    }

    /**
     * @param parentOrigin origine de la page de l'ENT qui encadre le contenu, ou {@code null}
     *                     pour s'en remettre à l'origine déclarée de la plateforme.
     */
    public String issue(long packageId, String userId, long now, String parentOrigin) {
        long expiry = now + lifetimeMillis;
        String payload = packageId + SEPARATOR + userId + SEPARATOR + expiry;
        if (parentOrigin != null && !parentOrigin.isEmpty()) {
            // L'origine porte des points : encodée, elle ne se confond pas avec le séparateur.
            payload += SEPARATOR + encode(parentOrigin);
        }
        return encode(payload) + SEPARATOR + sign(payload);
    }

    /** Ce qu'un jeton valide atteste. */
    public static final class Claims {
        private final long packageId;
        private final String userId;
        private final String parentOrigin;

        Claims(long packageId, String userId, String parentOrigin) {
            this.packageId = packageId;
            this.userId = userId;
            this.parentOrigin = parentOrigin;
        }

        /** Origine de la page qui encadre le contenu, ou {@code null} si le jeton n'en nomme pas. */
        public String parentOrigin() {
            return parentOrigin;
        }

        public long packageId() {
            return packageId;
        }

        public String userId() {
            return userId;
        }
    }

    /**
     * @return ce que le jeton atteste, ou {@code null} s'il est absent, malformé, mal signé,
     *         périmé, ou s'il ne désigne pas le paquet demandé.
     */
    public Claims verify(String token, long expectedPackageId, long now) {
        if (token == null) {
            return null;
        }
        int lastSeparator = token.lastIndexOf(SEPARATOR);
        if (lastSeparator <= 0) {
            return null;
        }
        String encodedPayload = token.substring(0, lastSeparator);
        String signature = token.substring(lastSeparator + 1);

        String payload;
        try {
            payload = new String(Base64.getUrlDecoder().decode(encodedPayload), UTF8);
        } catch (IllegalArgumentException e) {
            return null;
        }

        // Comparaison à temps constant : une comparaison ordinaire laisse mesurer où deux
        // signatures divergent, et donc reconstruire la bonne octet par octet.
        if (!constantTimeEquals(sign(payload), signature)) {
            return null;
        }

        String[] parts = payload.split("\\" + SEPARATOR);
        if (parts.length != 3 && parts.length != 4) {
            return null;
        }
        try {
            long packageId = Long.parseLong(parts[0]);
            long expiry = Long.parseLong(parts[2]);
            if (packageId != expectedPackageId || expiry < now) {
                return null;
            }
            String parentOrigin = parts.length == 4
                    ? new String(Base64.getUrlDecoder().decode(parts[3]), UTF8) : null;
            return new Claims(packageId, parts[1], parentOrigin);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private String encode(String payload) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(UTF8));
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(secret.getBytes(UTF8), ALGORITHM));
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(mac.doFinal(payload.getBytes(UTF8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Signature du jeton SCORM impossible", e);
        }
    }

    static boolean constantTimeEquals(String left, String right) {
        if (left == null || right == null) {
            return false;
        }
        byte[] a = left.getBytes(UTF8);
        byte[] b = right.getBytes(UTF8);
        int difference = a.length ^ b.length;
        for (int i = 0; i < a.length && i < b.length; i++) {
            difference |= a[i] ^ b[i];
        }
        return difference == 0;
    }
}
