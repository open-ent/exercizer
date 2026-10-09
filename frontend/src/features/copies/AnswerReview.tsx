import { useTranslation } from 'react-i18next';

import { AutomaticCorrection } from '../../correction';
import { GRAIN } from '../../grains';
import { GrainAnswer, GrainCustomCopyData } from '../../types';

/**
 * L'affichage des réponses d'une copie CORRIGÉE — portage des directives `view*`.
 *
 * Chaque réponse porte son verdict : juste, fausse, ou sans objet (une proposition de QCM qu'il
 * fallait laisser décochée). L'ancienne IHM posait des classes `input-response-correct` /
 * `input-response-incorrect` ; on les garde comme crochet, et on ajoute un libellé TEXTUEL —
 * la couleur seule ne dit rien à qui ne la distingue pas.
 */
export interface AnswerReviewProps {
  grainTypeId: number;
  data: GrainCustomCopyData;
  correction: AutomaticCorrection;
}

export function AnswerReview({ grainTypeId, data, correction }: AnswerReviewProps) {
  switch (grainTypeId) {
    case GRAIN.SIMPLE_ANSWER:
      return (
        <SingleAnswer value={data.filled_answer} verdict={correction.answers[0]} />
      );
    case GRAIN.OPEN_ANSWER:
      // Pas de correction automatique : on rend simplement ce que l'élève a écrit.
      return <OpenAnswer value={data.filled_answer} />;
    case GRAIN.MULTIPLE_ANSWERS:
      return <AnswerList answers={data.filled_answer_list ?? []} correction={correction} />;
    case GRAIN.QCM:
      return <QcmAnswers answers={data.filled_answer_list ?? []} correction={correction} />;
    case GRAIN.ASSOCIATION:
      return <AssociationAnswers answers={data.filled_answer_list ?? []} correction={correction} />;
    case GRAIN.ORDER_BY:
      return <OrderAnswers answers={data.filled_answer_list ?? []} correction={correction} />;
    case GRAIN.TEXT_TO_FILL:
    case GRAIN.AREA_SELECT:
    case GRAIN.AREA_SELECT_IMAGE:
      return <ZoneAnswers data={data} correction={correction} />;
    default:
      return null;
  }
}

/** Le marqueur d'une réponse : sa couleur, et le mot qui va avec. */
function Verdict({ verdict }: { verdict: boolean | undefined }) {
  const { t } = useTranslation(['exercizer', 'common']);
  if (verdict === undefined) return null;
  return (
    <span className={verdict ? 'text-success' : 'text-danger'}>
      {verdict ? t('exercizer.grain.answer.correct') : t('exercizer.grain.answer.incorrect')}
    </span>
  );
}

/** Une réponse, ou la mention qu'il n'y en a pas eu. */
function AnswerText({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation(['exercizer', 'common']);
  if (!value) return <em className="text-muted">{t('exercizer.grain.noanswer')}</em>;
  return <span>{value}</span>;
}

function reviewClass(verdict: boolean | undefined): string | undefined {
  if (verdict === undefined) return undefined;
  return verdict ? 'input-response-correct' : 'input-response-incorrect';
}

function SingleAnswer({
  value,
  verdict,
}: {
  value: string | null | undefined;
  verdict: boolean | undefined;
}) {
  return (
    <div className={`d-flex align-items-center gap-8 ${reviewClass(verdict) ?? ''}`}>
      <AnswerText value={value} />
      <Verdict verdict={verdict} />
    </div>
  );
}

/** Réponse ouverte : du HTML écrit par l'élève. */
function OpenAnswer({ value }: { value: string | null | undefined }) {
  const { t } = useTranslation(['exercizer', 'common']);
  if (!value) return <em className="text-muted">{t('exercizer.grain.noanswer')}</em>;
  // Le contenu vient de l'éditeur du socle, qui assainit ce qu'il produit ; c'est aussi ainsi que
  // l'ancienne IHM l'affichait (`bind-html`).
  return <div dangerouslySetInnerHTML={{ __html: value }} />;
}

function AnswerList({
  answers,
  correction,
}: {
  answers: GrainAnswer[];
  correction: AutomaticCorrection;
}) {
  return (
    <ul className="list-unstyled d-flex flex-column gap-4">
      {answers.map((answer, index) => (
        <li key={index}>
          <SingleAnswer value={answer.text} verdict={correction.answers[index]} />
        </li>
      ))}
    </ul>
  );
}

/**
 * QCM : on montre les cases telles que l'élève les a laissées, et le verdict de celles qui
 * départageaient. Une case qu'il fallait laisser décochée et qui l'est n'a pas de verdict.
 */
function QcmAnswers({
  answers,
  correction,
}: {
  answers: GrainAnswer[];
  correction: AutomaticCorrection;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <ul className="list-unstyled d-flex flex-column gap-4">
      {answers.map((answer, index) => {
        const verdict = correction.answers[index];
        return (
          <li key={index} className="d-flex align-items-center gap-8">
            <input
              type="checkbox"
              checked={answer.isChecked === true}
              disabled
              aria-label={answer.text || t('exercizer.grain.noanswer')}
            />
            <span className={reviewClass(answer.isChecked ? verdict : undefined)}>
              <AnswerText value={answer.text} />
            </span>
            {/* Le verdict ne concerne que les cases cochées : signaler « faux » sur une case
                laissée vide ne dirait rien à l'élève. */}
            {answer.isChecked && <Verdict verdict={verdict} />}
          </li>
        );
      })}
    </ul>
  );
}

function AssociationAnswers({
  answers,
  correction,
}: {
  answers: GrainAnswer[];
  correction: AutomaticCorrection;
}) {
  return (
    <ul className="list-unstyled d-flex flex-column gap-4">
      {answers.map((answer, index) => (
        <li key={index} className="d-flex align-items-center gap-8 flex-wrap">
          <AnswerText value={answer.text_left} />
          <span aria-hidden="true">→</span>
          <span className={reviewClass(correction.answers[index])}>
            <AnswerText value={answer.text_right} />
          </span>
          <Verdict verdict={correction.answers[index]} />
        </li>
      ))}
    </ul>
  );
}

/** Mise en ordre : les verdicts sont indexés par RANG, pas par position. */
function OrderAnswers({
  answers,
  correction,
}: {
  answers: GrainAnswer[];
  correction: AutomaticCorrection;
}) {
  const ordered = [...answers].sort((a, b) => (a.order_by ?? 0) - (b.order_by ?? 0));
  return (
    <ol className="list-unstyled d-flex flex-column gap-4">
      {ordered.map((answer, index) => (
        <li key={index} className="d-flex align-items-center gap-8">
          <span className="fw-bold px-8" aria-hidden="true">
            {answer.order_by ?? index + 1}
          </span>
          <span className={reviewClass(correction.answers[answer.order_by ?? 0])}>
            <AnswerText value={answer.text} />
          </span>
          <Verdict verdict={correction.answers[answer.order_by ?? 0]} />
        </li>
      ))}
    </ol>
  );
}

/** Grains « à zones » : la réponse de chaque zone, dans l'ordre. */
function ZoneAnswers({
  data,
  correction,
}: {
  data: GrainCustomCopyData;
  correction: AutomaticCorrection;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const zones = data.zones ?? [];
  if (zones.length === 0) {
    return <em className="text-muted">{t('exercizer.grain.noanswer')}</em>;
  }
  return (
    <ol className="list-unstyled d-flex flex-column gap-4">
      {zones.map((zone, index) => (
        <li key={index} className="d-flex align-items-center gap-8">
          <span className="fw-bold px-8" aria-hidden="true">
            {index + 1}
          </span>
          <span className={reviewClass(correction.answers[index])}>
            <AnswerText value={zone.answer} />
          </span>
          <Verdict verdict={correction.answers[index]} />
        </li>
      ))}
    </ol>
  );
}

export default AnswerReview;
