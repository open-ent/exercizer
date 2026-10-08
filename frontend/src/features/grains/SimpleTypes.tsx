import { Alert, FormControl, Input } from '@open-ent/react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { GrainCustomData } from '../../types';

/**
 * Réponse simple (type 4) : une seule réponse attendue, corrigée automatiquement.
 *
 * L'avertissement sur les accents n'est pas décoratif : la correction automatique compare les
 * chaînes en ignorant casse, espaces et accents (`CompareStringHelper`), et l'enseignant doit le
 * savoir avant de rédiger sa réponse.
 */
export function SimpleAnswerEditor({
  customData,
  onChange,
}: {
  customData: GrainCustomData;
  onChange: (next: GrainCustomData) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  return (
    <div>
      <Alert type="info" className="mb-16">
        {t('exercizer.grain.accent.warning')}
      </Alert>
      {/* `FormControl` obligatoire : l'`Input` du socle y lit son `id` et lève une erreur hors
          de lui. */}
      <FormControl id={id}>
        <Input
          type="text"
          size="md"
          aria-label={t('exercizer.grain.answer.info')}
          placeholder={t('exercizer.grain.answer.info')}
          value={customData.correct_answer ?? ''}
          onChange={(event) => onChange({ ...customData, correct_answer: event.target.value })}
        />
      </FormControl>
    </div>
  );
}

/**
 * Réponse ouverte (type 5) : rien à régler. L'élève rédige, l'enseignant corrige à la main.
 * L'IHM AngularJS n'affichait ici qu'un gabarit vide ; l'avertissement, lui, était posé par
 * l'écran parent. On le garde avec son grain, où il se lit.
 */
export function OpenAnswerEditor() {
  const { t } = useTranslation(['exercizer', 'common']);
  return <Alert type="info">{t('exercizer.grain.openanswer.info')}</Alert>;
}
