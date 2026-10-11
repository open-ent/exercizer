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
 * produire : il nomme le paquet, l'usager et une échéance. Il n'ouvre rien d'autre que la
 * lecture des fichiers de ce paquet, et il expire.
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
        long expiry = now + lifetimeMillis;
        String payload = packageId + SEPARATOR + userId + SEPARATOR + expiry;
        return encode(payload) + SEPARATOR + sign(payload);
    }

    /** Ce qu'un jeton valide atteste. */
    public static final class Claims {
        private final long packageId;
        private final String userId;

        Claims(long packageId, String userId) {
            this.packageId = packageId;
            this.userId = userId;
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
        if (parts.length != 3) {
            return null;
        }
        try {
            long packageId = Long.parseLong(parts[0]);
            long expiry = Long.parseLong(parts[2]);
            if (packageId != expectedPackageId || expiry < now) {
                return null;
            }
            return new Claims(packageId, parts[1]);
        } catch (NumberFormatException e) {
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
