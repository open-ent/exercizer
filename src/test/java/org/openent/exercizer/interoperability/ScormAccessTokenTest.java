package org.openent.exercizer.interoperability;

import fr.openent.exercizer.interoperability.ScormAccessToken;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

/**
 * Le jeton est la seule chose qui autorise l'accès au contenu SCORM, puisque le domaine qui le
 * sert ne voit aucune session. Ses tests négatifs comptent donc plus que les positifs.
 */
public class ScormAccessTokenTest {

    private static final long NOW = 1_700_000_000_000L;
    private final ScormAccessToken tokens = new ScormAccessToken("secret-de-plateforme", 60_000L);

    @Test
    public void un_jeton_emis_est_accepte_pour_son_paquet() {
        String token = tokens.issue(42L, "user-1", NOW);
        ScormAccessToken.Claims claims = tokens.verify(token, 42L, NOW + 1_000L);
        assertNotNull(claims);
        assertEquals(42L, claims.packageId());
        assertEquals("user-1", claims.userId());
    }

    @Test
    public void un_jeton_perime_est_refuse() {
        String token = tokens.issue(42L, "user-1", NOW);
        assertNull(tokens.verify(token, 42L, NOW + 61_000L));
    }

    @Test
    public void un_jeton_ne_vaut_que_pour_le_paquet_qu_il_nomme() {
        // Sans cette vérification, le jeton d'un paquet ouvrirait le contenu de tous les autres.
        String token = tokens.issue(42L, "user-1", NOW);
        assertNull(tokens.verify(token, 43L, NOW + 1_000L));
    }

    @Test
    public void une_signature_falsifiee_est_refusee() {
        String token = tokens.issue(42L, "user-1", NOW);
        String tampered = token.substring(0, token.lastIndexOf('.')) + ".signature-inventee";
        assertNull(tokens.verify(tampered, 42L, NOW + 1_000L));
    }

    @Test
    public void une_charge_utile_modifiee_est_refusee() {
        // Repousser l'échéance en réécrivant la charge utile doit invalider la signature.
        String forged = java.util.Base64.getUrlEncoder().withoutPadding()
                .encodeToString(("42.user-1." + (NOW + 999_999_999L)).getBytes());
        String token = tokens.issue(42L, "user-1", NOW);
        String signature = token.substring(token.lastIndexOf('.') + 1);
        assertNull(tokens.verify(forged + "." + signature, 42L, NOW + 1_000L));
    }

    @Test
    public void un_jeton_absent_ou_malforme_est_refuse() {
        assertNull(tokens.verify(null, 42L, NOW));
        assertNull(tokens.verify("", 42L, NOW));
        assertNull(tokens.verify("nimporte-quoi", 42L, NOW));
        assertNull(tokens.verify("a.b.c", 42L, NOW));
    }

    @Test
    public void un_jeton_d_une_autre_plateforme_est_refuse() {
        ScormAccessToken autre = new ScormAccessToken("un-autre-secret", 60_000L);
        assertNull(tokens.verify(autre.issue(42L, "user-1", NOW), 42L, NOW + 1_000L));
    }

    @Test
    public void refuse_de_fonctionner_sans_secret() {
        // Démarrer avec un secret vide laisserait signer n'importe qui : mieux vaut ne pas
        // démarrer du tout.
        try {
            new ScormAccessToken("  ", 60_000L);
            fail("un secret vide doit être refusé");
        } catch (IllegalArgumentException expected) {
            // attendu
        }
    }
}
