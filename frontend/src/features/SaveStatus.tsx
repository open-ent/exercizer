import { IconCheck } from '@open-ent/react/icons';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Témoin d'enregistrement : « Enregistrement… », « Enregistré à 10:42 », ou — quand un envoi a échoué — un message
 * d'alerte avec « Réessayer ». Un échec n'est plus présenté comme un enregistrement réussi.
 *
 * L'heure est celle du dernier envoi TERMINÉ vu par l'écran : avant le premier, rien n'est encore parti, on dit
 * seulement que les modifications s'enregistrent d'elles-mêmes.
 */
export function SaveStatus({ pending, failed, onRetry, className }: { pending: boolean; failed: boolean; onRetry: () => Promise<void>; className?: string }) {
  const { t, i18n } = useTranslation(['exercizer', 'common']);
  const [retrying, setRetrying] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const wasPending = useRef(pending);

  useEffect(() => {
    if (wasPending.current && !pending && !failed) setSavedAt(new Date());
    wasPending.current = pending;
  }, [pending, failed]);

  if (failed) {
    return (
      <span className={`text-danger ${className ?? ''}`} role="alert" data-save-failed>
        {t('exercizer.subject.save.failed')}{' '}
        <button
          type="button"
          className="btn btn-link p-0 align-baseline"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await onRetry();
            } catch {
              /* l'état `failed` reste vrai : le message reste affiché */
            } finally {
              setRetrying(false);
            }
          }}
        >
          {t('exercizer.subject.save.retry')}
        </button>
      </span>
    );
  }
  if (pending) {
    return (
      <span className={`small text-gray-700 ${className ?? ''}`} role="status" data-save-state="pending">
        {t('exercizer.subject.navigation.saving')}
      </span>
    );
  }
  const time = savedAt?.toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  return (
    <span
      className={`small d-inline-flex align-items-center gap-4 text-success ${className ?? ''}`}
      role="status"
      data-save-state="saved"
    >
      <IconCheck style={{ width: 16, height: 16 }} aria-hidden="true" />
      {time
        ? t('exercizer.subject.saved.at', { time, defaultValue: 'Enregistré à [[time]]' })
        : t('exercizer.subject.saved.auto', { defaultValue: 'Enregistrement automatique' })}
    </span>
  );
}

export default SaveStatus;
