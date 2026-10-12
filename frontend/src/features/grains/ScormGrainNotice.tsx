import { Alert } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import { Grain } from '../../types';

/**
 * Côté édition, un module SCORM ne se retouche pas : c'est un paquet déposé, dont le contenu a
 * été fabriqué par un outil auteur tiers. On le remplace, on ne l'édite pas.
 *
 * Le grain garde en revanche son titre, son énoncé et son barème, qui sont bien à l'enseignant,
 * et la note de l'élève est celle que le module remonte par l'API SCORM.
 */
export function ScormGrainNotice({ grain }: { grain: Grain }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const customData = grain.grain_data.custom_data;

  return (
    <Alert type="info">
      <div className="d-flex flex-column gap-8">
        <span>{t('exercizer.grain.scorm.deposited')}</span>
        {customData?.scormVersion && (
          <small className="text-muted">
            {t('exercizer.grain.scorm.version', { version: customData.scormVersion })}
          </small>
        )}
      </div>
    </Alert>
  );
}

export default ScormGrainNotice;
