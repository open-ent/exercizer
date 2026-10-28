import { Alert, Button } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

/**
 * Lecture en échec : message d'erreur et « Réessayer ». Sans lui, une panne du serveur (session expirée, 5xx, réseau)
 * s'affichait comme « aucun sujet », « aucune copie » ou « sujet vide » — l'usager croyait ses données perdues.
 */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <div className="d-flex flex-column gap-12 mt-16" data-load-error>
      <Alert type="danger">{t('exercizer.load.error')}</Alert>
      <div>
        <Button color="primary" variant="outline" onClick={onRetry}>
          {t('exercizer.subject.save.retry')}
        </Button>
      </div>
    </div>
  );
}

export default LoadError;
