package fr.openent.exercizer.practice;

import org.junit.Test;

import static org.junit.Assert.*;

public class RateLimiterTest {

	@Test
	public void limitsPerKeyAndWindow() {
		final RateLimiter limiter = new RateLimiter(2);
		assertTrue(limiter.tryAcquire("a", 0));
		assertTrue(limiter.tryAcquire("a", 10));
		assertFalse(limiter.tryAcquire("a", 20));
		assertTrue("une autre adresse a son propre compte", limiter.tryAcquire("b", 20));
		assertTrue("nouvelle fenêtre", limiter.tryAcquire("a", 60_000));
	}
}
