import { Button, FormControl, Input, Label, TextArea } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomaticCorrection, formatScore } from '../../correction';
import { GRAIN, sanitizeScore } from '../../grains';
import { GrainCopy, GrainScheduled } from '../../types';
import { AnswerReview } from './AnswerReview';
import { GrainCopyDocuments, GrainCopyHeader, GrainCopyStatement } from './GrainCopyHeader';

export interface GrainCopyReviewProps {
  grainCopy: GrainCopy;
  grainCopies: GrainCopy[];
  /** Le grain distribué : il porte les réponses attendues et l'explication. */
  reference: GrainScheduled | undefined;
  correction: AutomaticCorrection | undefined;
  /**
   * `teacher` rend la note et le commentaire MODIFIABLES. Côté élève, tout est en lecture seule —
   * et rien n'est enregistré depuis son écran (cf. `ViewCopy`).
   */
  mode: 'student' | 'teacher';
  onChange?: (grainCopy: GrainCopy) => void;
}

/**
 * Un grain dans une copie rendue : la réponse de l'élève, le verdict de la correction
 * automatique, la note, le commentaire et l'explication.
 *
 * Partagé par les deux écrans de relecture — celui de l'élève et celui de l'enseignant — parce
 * qu'ils montrent la MÊME chose ; seul le droit d'y écrire les sépare.
 */
export function GrainCopyReview({
  grainCopy,
  grainCopies,
  reference,
  correction,
  mode,
  onChange,
}: GrainCopyReviewProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [showCorrection, setShowCorrection] = useState(false);

  const maxScore = grainCopy.grain_copy_data.max_score ?? 0;
  const resolved = correction ?? { calculated_score: 0, answers: {} };
  const editable = mode === 'teacher';

  // Un énoncé n'a ni réponse, ni note, ni commentaire : rien à corriger.
  if (grainCopy.grain_type_id === GRAIN.STATEMENT) {
    return (
      <article className="card p-16" id={`grain-copy-${grainCopy.id}`}>
        <GrainCopyHeader grainCopy={grainCopy} grainCopies={grainCopies} />
        <GrainCopyStatement grainCopy={grainCopy} />
      </article>
    );
  }

  /**
   * Le corrigé n'est proposé à l'ÉLÈVE que si sa note n'est pas déjà maximale : inutile de
   * montrer la bonne réponse à qui l'a trouvée (`displayCorrectAnswerButton`). L'enseignant, lui,
   * doit pouvoir le consulter sur n'importe quelle question pour noter en connaissance de cause.
   */
  const canShowCorrection =
    !!reference &&
    (editable ||
      grainCopy.final_score === null ||
      grainCopy.final_score === undefined ||
      grainCopy.final_score < maxScore);

  return (
    <article className="card p-16" id={`grain-copy-${grainCopy.id}`}>
      <GrainCopyHeader grainCopy={grainCopy} grainCopies={grainCopies} />
      <GrainCopyStatement grainCopy={grainCopy} />
      <GrainCopyDocuments grainCopy={grainCopy} />

      <AnswerReview
        grainTypeId={grainCopy.grain_type_id}
        data={grainCopy.grain_copy_data.custom_copy_data ?? {}}
        correction={resolved}
      />

      {canShowCorrection && (
        <div className="mt-16">
          <Button
            color="tertiary"
            variant="ghost"
            aria-expanded={showCorrection}
            onClick={() => setShowCorrection(!showCorrection)}
          >
            {t(
              showCorrection
                ? 'exercizer.grain.undisplay.correction'
                : 'exercizer.grain.display.correction',
            )}
          </Button>
          {showCorrection && reference && (
            <ExpectedAnswers grainTypeId={grainCopy.grain_type_id} reference={reference} />
          )}
        </div>
      )}

      <footer className="mt-16 pt-16 border-top">
        <div className="grid gap-16">
          <div className="g-col-12 g-col-md-6">
            <FormControl id={`grain-copy-comment-${grainCopy.id}`} isReadOnly={!editable}>
              <Label>{t('exercizer.grain.footer.comment')}</Label>
              <TextArea
                size="md"
                value={grainCopy.comment ?? ''}
                placeholder={t(
                  editable ? 'exercizer.grain.footer.comment.default' : 'exercizer.grain.footer.nocomment',
                )}
                onChange={
                  editable
                    ? (event) => onChange?.({ ...grainCopy, comment: event.target.value })
                    : undefined
                }
              />
            </FormControl>
          </div>
          <div className="g-col-12 g-col-md-6">
            <p className="form-label mb-4">{t('exercizer.grain.footer.result')}</p>
            <p className="mb-8">
              {t('exercizer.auto.score')} :{' '}
              <strong>{formatScore(grainCopy.calculated_score ?? resolved.calculated_score)}</strong>{' '}
              {t('exercizer.on')} {maxScore} {t('exercizer.score')}
            </p>
            {editable ? (
              <FormControl id={`grain-copy-score-${grainCopy.id}`}>
                <Label>{t('exercizer.final.score')}</Label>
                <div className="d-flex align-items-center gap-8">
                  <Input
                    type="text"
                    size="md"
                    inputMode="decimal"
                    className="w-auto"
                    // La note reste une CHAÎNE pendant la saisie : forcer un nombre empêcherait
                    // de taper « 1, » puis « 5 ». Elle est assainie à l'enregistrement.
                    value={String(grainCopy.final_score ?? '')}
                    onChange={(event) =>
                      onChange?.({
                        ...grainCopy,
                        final_score: event.target.value as unknown as number,
                      })
                    }
                  />
                  <span className="text-nowrap">
                    {t('exercizer.on')} {maxScore} {t('exercizer.score')}
                  </span>
                </div>
                {sanitizeScore(grainCopy.final_score) > maxScore && (
                  // Le serveur ne borne rien : une note au-dessus du barème fausserait le total
                  // de la copie sans que personne ne s'en aperçoive.
                  <small className="text-warning">{t('exercizer.grain.score.above.max')}</small>
                )}
              </FormControl>
            ) : (
              <p className="mb-0">
                {t('exercizer.final.score')} : <strong>{formatScore(grainCopy.final_score)}</strong>{' '}
                {t('exercizer.on')} {maxScore} {t('exercizer.score')}
              </p>
            )}
          </div>
        </div>
        {reference?.grain_data.answer_explanation && (
          <p className="mt-16 mb-0">
            <em className="text-muted">{reference.grain_data.answer_explanation}</em>
          </p>
        )}
      </footer>
    </article>
  );
}

/** Le corrigé d'une question : ce qu'il fallait répondre. */
export function ExpectedAnswers({
  grainTypeId,
  reference,
}: {
  grainTypeId: number;
  reference: GrainScheduled;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const data = reference.grain_data.custom_data ?? {};

  const lines: string[] = (() => {
    switch (grainTypeId) {
      case GRAIN.SIMPLE_ANSWER:
        return data.correct_answer ? [data.correct_answer] : [];
      case GRAIN.MULTIPLE_ANSWERS:
        return (data.correct_answer_list ?? []).map((answer) => answer.text ?? '');
      case GRAIN.QCM:
        // Seules les propositions à cocher constituent le corrigé.
        return (data.correct_answer_list ?? [])
          .filter((answer) => answer.isChecked)
          .map((answer) => answer.text ?? '');
      case GRAIN.ASSOCIATION:
        return (data.correct_answer_list ?? []).map(
          (answer) => `${answer.text_left ?? ''} → ${answer.text_right ?? ''}`,
        );
      case GRAIN.ORDER_BY:
        return [...(data.correct_answer_list ?? [])]
          .sort((a, b) => (a.order_by ?? 0) - (b.order_by ?? 0))
          .map((answer) => `${answer.order_by ?? ''}. ${answer.text ?? ''}`);
      default:
        return (data.zones ?? []).map((zone, index) => `${index + 1}. ${zone.answer}`);
    }
  })();

  if (lines.length === 0) return null;

  return (
    <section className="mt-8">
      <p className="form-label mb-4">{t('exercizer.grain.correction')}</p>
      <ul>
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

export default GrainCopyReview;
