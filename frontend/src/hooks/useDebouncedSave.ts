import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Enregistrement différé d'objets identifiés par une clé.
 *
 * L'édition d'un sujet se fait AU FIL DE LA FRAPPE : il n'y a pas de bouton « Enregistrer », et
 * c'est déjà ainsi que fonctionnait l'IHM AngularJS (un flux rxjs par grain, `debounceTime(2000)`).
 * On reprend cette intention sans rxjs : une minuterie par clé, remise à zéro à chaque frappe.
 *
 * Deux garanties qui comptent :
 *  - un enregistrement par clé : taper dans deux grains n'en fait pas perdre un ;
 *  - rien n'est perdu au démontage, ce que faisait l'ancienne IHM en interrogeant l'usager au
 *    moment de quitter la page. Ici, les minuteries en attente sont déclenchées tout de suite.
 *
 * Un enregistrement qui ÉCHOUE (session expirée, 5xx, réseau) n'est jamais présenté comme réussi : la valeur est
 * gardée, `failed` passe à vrai, `retry` la renvoie, et fermer l'onglet avec des modifications non enregistrées
 * demande confirmation. `flush` relance l'erreur : « Rendre » ne part pas sur des réponses non enregistrées.
 */
export function useDebouncedSave<T>(
  save: (value: T) => Promise<unknown>,
  delayMs = 1500,
): {
  /** Programme l'enregistrement de `value` sous la clé `key`. */
  schedule: (key: string | number, value: T) => void;
  /** Déclenche tout de suite ce qui est en attente (avant une navigation, par exemple). */
  flush: () => Promise<void>;
  /** Y a-t-il une modification pas encore partie ? */
  pending: boolean;
  /** Un enregistrement a échoué et n'a pas été rejoué avec succès. */
  failed: boolean;
  /** Renvoie ce qui a échoué ; relance l'erreur si ça échoue encore. */
  retry: () => Promise<void>;
} {
  const timers = useRef(new Map<string | number, number>());
  const values = useRef(new Map<string | number, T>());
  const [pending, setPending] = useState(false);
  // Valeurs dont l'enregistrement a échoué, gardées pour `retry`.
  const failures = useRef(new Map<string | number, T>());
  const [failed, setFailed] = useState(false);
  // `save` change à chaque rendu (c'est une closure sur l'état) : on le lit via un ref pour que
  // les minuteries déjà programmées appellent toujours la version courante.
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async (key: string | number) => {
    const value = values.current.get(key);
    values.current.delete(key);
    timers.current.delete(key);
    setPending(timers.current.size > 0);
    if (value === undefined) return;
    try {
      await saveRef.current(value);
      failures.current.delete(key);
      setFailed(failures.current.size > 0);
    } catch (error) {
      // Une saisie plus récente sur la même clé l'emporte : on ne rejoue pas une valeur périmée.
      if (!values.current.has(key)) failures.current.set(key, value);
      setFailed(failures.current.size > 0);
      throw error;
    }
  }, []);

  const schedule = useCallback(
    (key: string | number, value: T) => {
      values.current.set(key, value);
      const existing = timers.current.get(key);
      if (existing !== undefined) window.clearTimeout(existing);
      timers.current.set(
        key,
        window.setTimeout(() => {
          // L'échec est porté par `failed` ; ici il n'y a personne pour attraper l'erreur.
          run(key).catch(() => undefined);
        }, delayMs),
      );
      setPending(true);
    },
    [delayMs, run],
  );

  const flush = useCallback(async () => {
    const keys = [...timers.current.keys()];
    for (const key of keys) {
      const timer = timers.current.get(key);
      if (timer !== undefined) window.clearTimeout(timer);
    }
    await Promise.all(keys.map((key) => run(key)));
  }, [run]);

  const retry = useCallback(async () => {
    const entries = [...failures.current.entries()];
    for (const [key, value] of entries) if (!values.current.has(key)) values.current.set(key, value);
    await Promise.all(entries.map(([key]) => run(key)));
  }, [run]);

  // Fermer l'onglet avec des modifications non enregistrées (en attente ou échouées) : le navigateur demande confirmation.
  useEffect(() => {
    if (!pending && !failed) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, failed]);

  // Au démontage, on ne peut plus attendre : ce qui est en vol part immédiatement. Sans cela,
  // quitter l'écran dans les deux secondes qui suivent une frappe la perdrait silencieusement.
  useEffect(() => {
    const timersAtMount = timers.current;
    const valuesAtMount = values.current;
    return () => {
      for (const [key, timer] of timersAtMount) {
        window.clearTimeout(timer);
        const value = valuesAtMount.get(key);
        if (value !== undefined) saveRef.current(value).catch(() => undefined);
      }
      timersAtMount.clear();
      valuesAtMount.clear();
    };
  }, []);

  return { schedule, flush, pending, failed, retry };
}

export default useDebouncedSave;
