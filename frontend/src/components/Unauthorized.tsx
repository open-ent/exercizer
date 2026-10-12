import { Button, EmptyScreen } from '@open-ent/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';

/**
 * Écran de refus — l'équivalent des gabarits `401-exercizer` et `400-date-exercizer` : un
 * message, et de quoi revenir au tableau de bord.
 */
export function Unauthorized({ text }: { text: string }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  return (
    <div className="d-flex flex-column align-items-center gap-16 mt-24">
      <EmptyScreen imageSrc={illuExercizer} text={text} size={200} />
      <Button color="primary" variant="filled" onClick={() => navigate('/dashboard')}>
        {t('exercizer.title')}
      </Button>
    </div>
  );
}

export default Unauthorized;
