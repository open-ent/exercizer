package fr.openent.exercizer.practice;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Limite de débit par clé (l'adresse IP du visiteur) : au plus {@code perMinute} requêtes par fenêtre
 * d'une minute. En mémoire, propre à chaque instance du module : c'est un frein contre l'aspiration
 * des corrections, pas un quota exact.
 *
 * Le nombre de clés suivies est borné ({@link #MAX_KEYS}) : les plus anciennes sont oubliées, une
 * rafale d'adresses ne fait pas grossir la mémoire sans fin.
 */
public final class RateLimiter {

	private static final int MAX_KEYS = 10_000;
	private static final long WINDOW_MS = 60_000L;

	private final int perMinute;
	private final Map<String, long[]> windows = new LinkedHashMap<String, long[]>(256, 0.75f, true) {
		@Override
		protected boolean removeEldestEntry(final Map.Entry<String, long[]> eldest) {
			return size() > MAX_KEYS;
		}
	};

	public RateLimiter(final int perMinute) {
		this.perMinute = Math.max(1, perMinute);
	}

	public boolean tryAcquire(final String key) {
		return tryAcquire(key, System.currentTimeMillis());
	}

	/** {@code window[0]} : début de la fenêtre ; {@code window[1]} : requêtes comptées dedans. */
	synchronized boolean tryAcquire(final String key, final long now) {
		final long[] window = windows.computeIfAbsent(key, k -> new long[]{now, 0});
		if (now - window[0] >= WINDOW_MS) {
			window[0] = now;
			window[1] = 0;
		}
		if (window[1] >= perMinute) return false;
		window[1]++;
		return true;
	}
}
