import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Témoin d'enregistrement : « Enregistrement… », « Modifications enregistrées », ou — quand un envoi a échoué — un message
 * d'alerte avec « Réessayer ». Un échec n'est plus présenté comme un enregistrement réussi.
 */
export function SaveStatus({ pending, failed, onRetry, className }: { pending: boolean; failed: boolean; onRetry: () => Promise<void>; className?: string }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [retrying, setRetrying] = useState(false);
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
  return (
    <span className={`text-muted ${className ?? ''}`} role="status" data-save-state={pending ? 'pending' : 'saved'}>
      {pending ? t('exercizer.subject.navigation.saving') : t('exercizer.subject.saved')}
    </span>
  );
}

export default SaveStatus;
