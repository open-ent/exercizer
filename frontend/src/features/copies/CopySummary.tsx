import { Alert, Heading } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import type { CopySummary as Summary } from '../../summary';
import { formatDateTime } from '../../utils';

/**
 * Récapitulatif de début de copie (parité `perform-summary` de l'ancienne IHM) : avertissement de rendu, date d'ouverture à
 * venir, échéance, ordre aléatoire, durée estimée et consigne générale — ou la seule mention d'entraînement.
 */
export function CopySummary({ summary }: { summary: Summary }) {
  const { t } = useTranslation('exercizer');
  return (
    <article className="card p-16 mb-16" data-copy-summary>
      <Heading level="h3" headingStyle="h5" className="mb-16">
        {t('exercizer.summary')}
      </Heading>

      {summary.mode === 'training' ? (
        <p data-summary-training>{t('exercizer.summary.training')}</p>
      ) : (
        <>
          <div data-summary-submit={summary.mode}>
            <Alert type="warning" className="mb-16">
              {t(summary.mode === 'one-shot' ? 'exercizer.one.submit' : 'exercizer.several.submit')}
            </Alert>
          </div>
          {summary.futureStart && (
            <p data-summary-future>
              <strong>
                {t('exercizer.future.info')} {formatDateTime(summary.futureStart, t('exercizer.at'))}
              </strong>
            </p>
          )}
          <p data-summary-due>
            {t('exercizer.summary.date')}{' '}
            <strong>
              {summary.dueDate ? formatDateTime(summary.dueDate, t('exercizer.at')) : t('exercizer.summary.nodate')}
            </strong>
          </p>
          {summary.randomOrder && (
            // Libellé du serveur contenant une mise en gras : contenu statique de la traduction, pas une saisie.
            <p data-summary-random dangerouslySetInnerHTML={{ __html: t('exercizer.summary.random') }} />
          )}
          {summary.durationMinutes !== null && (
            <p data-summary-duration>
              {t('exercizer.summary.make')} : <strong>{summary.durationMinutes} {t('exercizer.minute')}</strong>
            </p>
          )}
          {summary.description && <p className="mt-16" data-summary-description>{summary.description}</p>}
        </>
      )}
    </article>
  );
}
