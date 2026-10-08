import { Button, EmptyScreen } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';

/**
 * Écran de relais pour les parties du module qui ne sont pas encore portées : édition d'un sujet,
 * passation et consultation d'une copie, parcours, archives, pilotage, impression.
 *
 * Il renvoie vers l'IHM AngularJS **en conservant le chemin demandé**, les deux interfaces
 * partageant leurs routes : `#/subject/edit/42/` ouvre bien le sujet 42 de l'autre côté. La
 * dérogation `?ui=angular` n'est PAS mémorisée — l'usager reste sur la nouvelle interface au
 * prochain passage par le tableau de bord.
 *
 * Le départ demande un CLIC, et ne se déclenche pas tout seul : une redirection automatique
 * n'aurait laissé qu'un éclair à l'écran, trop court pour être lu, et l'usager aurait changé
 * d'interface sans comprendre pourquoi. Un clic de plus sur un chemin rare (lien profond vers un
 * écran non porté) vaut mieux qu'un changement d'habillage inexpliqué.
 *
 * Cet écran disparaîtra avec la dernière route portée.
 */
export function NotMigrated() {
  const { t } = useTranslation(['exercizer', 'common']);
  const location = useLocation();
  const target = `/exercizer?ui=angular#${location.pathname}${location.search}`;

  return (
    <div className="d-flex flex-column align-items-center gap-16 mt-24">
      <EmptyScreen
        imageSrc={illuExercizer}
        title={t('exercizer.switch.notmigrated.title')}
        text={t('exercizer.switch.notmigrated.text')}
        size={200}
      />
      <Button color="primary" variant="filled" onClick={() => (window.location.href = target)}>
        {t('exercizer.switch.notmigrated.action')}
      </Button>
    </div>
  );
}

export default NotMigrated;
