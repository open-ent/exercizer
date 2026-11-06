import { Alert, FormControl, Input, Label } from '@open-ent/react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { GrainCustomData } from '../../types';
import { RichTextEditor } from '../RichTextEditor';

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
 * Réponse ouverte (type 5) : l'élève rédige, l'enseignant corrige à la main.
 *
 * Deux contenus facultatifs, en texte riche :
 *  - la réponse de DÉPART, recopiée dans la copie de chaque élève à la distribution : un schéma
 *    draw.io à compléter, une image à annoter, un texte à reprendre ;
 *  - le CORRIGÉ, qui reste dans le grain et n'apparaît qu'avec le corrigé d'une copie rendue.
 *
 * L'élève reçoit le fichier draw.io ENTIER d'un schéma de départ (toutes ses pages, ses calques
 * masqués) : la solution n'y a pas sa place, d'où le corrigé séparé et l'avertissement.
 */
export function OpenAnswerEditor({
  customData,
  onChange,
}: {
  customData: GrainCustomData;
  onChange: (next: GrainCustomData) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const startingId = useId();
  const modelId = useId();
  return (
    <div className="d-flex flex-column gap-16">
      <Alert type="info">{t('exercizer.grain.openanswer.info')}</Alert>
      <FormControl id={startingId}>
        <Label>{t('exercizer.grain.openanswer.starting')}</Label>
        <p className="small text-muted mb-8">{t('exercizer.grain.openanswer.starting.help')}</p>
        <RichTextEditor
          id={startingId}
          content={customData.starting_answer}
          placeholder={t('exercizer.grain.openanswer.starting.placeholder')}
          onChange={(starting_answer) => onChange({ ...customData, starting_answer })}
        />
      </FormControl>
      <FormControl id={modelId}>
        <Label>{t('exercizer.grain.openanswer.model')}</Label>
        <p className="small text-muted mb-8">{t('exercizer.grain.openanswer.model.help')}</p>
        <RichTextEditor
          id={modelId}
          content={customData.model_answer}
          placeholder={t('exercizer.grain.openanswer.model.placeholder')}
          onChange={(model_answer) => onChange({ ...customData, model_answer })}
        />
      </FormControl>
    </div>
  );
}
