import { Alert, Button } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import { Grain } from '../../types';

/**
 * Les trois types « à zones » (texte à trous, zones de texte, zones d'images) ne sont pas encore
 * portés : leur édition reposait sur l'éditeur riche d'AngularJS, dans lequel l'enseignant
 * insérait des balises `<fill-zone>`, et sur un placement libre de zones au-dessus d'une image
 * de fond.
 *
 * Le grain reste À SA PLACE dans le sujet et garde son titre, son barème et son énoncé — seul son
 * contenu propre n'est pas modifiable ici, et il n'est JAMAIS réenregistré : aucune donnée ne
 * peut être abîmée par un passage dans la nouvelle interface.
 */
export function ZoneGrainNotice({ grain }: { grain: Grain }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const zones = grain.grain_data.custom_data?.zones?.length ?? 0;

  return (
    <Alert type="warning">
      <div className="d-flex flex-column gap-8">
        <span>{t('exercizer.grain.zone.notmigrated')}</span>
        {zones > 0 && (
          <small className="text-muted">
            {t('exercizer.grain.zone.notmigrated.count', { count: zones })}
          </small>
        )}
        <div>
          <Button
            color="primary"
            variant="outline"
            onClick={() => {
              window.location.href = `/exercizer?ui=angular#/subject/edit/${grain.subject_id}/`;
            }}
          >
            {t('exercizer.switch.notmigrated.action')}
          </Button>
        </div>
      </div>
    </Alert>
  );
}

export default ZoneGrainNotice;
