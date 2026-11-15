package fr.openent.exercizer.services.impl;

import io.vertx.core.json.JsonObject;
import org.junit.After;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** public-catalog.all-packs : les sujets des packs deviennent publics sans marque du modérateur. */
public class PracticePublishedTest {

	@After
	public void reset() {
		PracticeServiceSqlImpl.configure(null);
	}

	@Test
	public void sansReglageSeulsLesSujetsMarques() {
		PracticeServiceSqlImpl.configure(new JsonObject());
		assertFalse(PracticeServiceSqlImpl.allPacks());
		assertEquals("s.is_public = true", PracticeServiceSqlImpl.published());
	}

	@Test
	public void allPacksAjouteLesSujetsDesPacksSousLaGardeDesPacks() {
		PracticeServiceSqlImpl.configure(new JsonObject().put("all-packs", true));
		assertTrue(PracticeServiceSqlImpl.allPacks());
		assertEquals("(s.is_public = true OR s.pack_global_id IS NOT NULL)", PracticeServiceSqlImpl.published());
		// Un pack réservé à des établissements reste exclu : la garde n'accepte que structure_id = '*'.
		final String guard = PracticeServiceSqlImpl.publicGuard();
		assertTrue(guard.contains("s.pack_global_id IS NOT NULL)"));
		assertTrue(guard.contains("a.structure_id = '*'"));
	}
}
