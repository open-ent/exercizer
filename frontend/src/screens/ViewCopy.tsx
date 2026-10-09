import {
  Alert,
  Button,
  EmptyScreen,
  FormControl,
  Heading,
  Label,
  LoadingScreen,
  TextArea,
} from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  getCopiesAsStudent,
  getGrainCopies,
  getGrainsScheduled,
  getSubjectsScheduledAsStudent,
} from '../api';
import { canViewAsStudent } from '../copies';
import {
  automaticCorrection,
  AutomaticCorrection,
  formatScore,
  totalCalculatedScore,
} from '../correction';
import { AnswerReview } from '../features/copies/AnswerReview';
import {
  GrainCopyDocuments,
  GrainCopyHeader,
  GrainCopyStatement,
} from '../features/copies/GrainCopyHeader';
import { GRAIN } from '../grains';
import { GrainCopy, GrainScheduled, SubjectCopy, SubjectScheduled } from '../types';
import { formatDateTime } from '../utils';

/**
 * Consultation par l'élève de sa copie corrigée — portage de `ViewSubjectCopyController` côté
 * apprenant et de `subject-view-copy-grain-copy-list`.
 *
 * Tous les grains à la suite, avec pour chacun ce que l'élève a répondu, le verdict de la
 * correction automatique, la note, le commentaire de l'enseignant et son explication. En tête,
 * le résumé : score automatique, score final, commentaire général.
 *
 * ⚠ La correction automatique est calculée ICI, par le client (`correction.ts`) — c'est ainsi que
 * fonctionne le module — mais **rien n'est enregistré depuis cet écran**. Deux raisons, et la
 * seconde suffirait :
 *  - l'IHM AngularJS ne persiste depuis la consultation que lorsque c'est l'ENSEIGNANT qui
 *    regarde (`ViewSubjectCopyController`, branche `isTeacher`) ; côté élève, elle se contente de
 *    recalculer à l'affichage ;
 *  - le serveur refuse de toute façon toute écriture sur une copie rendue
 *    (`exercizer.pilotage.copy.submitted`, 400). Laisser un navigateur d'élève écrire des notes
 *    serait d'ailleurs une bien mauvaise idée.
 *
 * C'est aussi le seul écran qui a le droit de charger les grains DISTRIBUÉS : ils portent les
 * réponses attendues, et la copie est déjà rendue.
 */
export function ViewCopy() {
  const { subjectCopyId: param } = useParams();
  const subjectCopyId = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  const copiesQuery = useQuery({ queryKey: ['exercizer', 'copies'], queryFn: getCopiesAsStudent });
  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'student'],
    queryFn: getSubjectsScheduledAsStudent,
  });

  const copy = (copiesQuery.data ?? []).find((item) => item.id === subjectCopyId);
  const scheduled = (scheduledQuery.data ?? []).find(
    (item) => item.id === copy?.subject_scheduled_id,
  );

  const grainsQuery = useQuery({
    queryKey: ['exercizer', 'grain-copies', subjectCopyId],
    queryFn: () => getGrainCopies(copy!),
    enabled: !!copy,
  });

  const referenceQuery = useQuery({
    queryKey: ['exercizer', 'grains-scheduled', copy?.subject_scheduled_id],
    queryFn: () => getGrainsScheduled(copy!.subject_scheduled_id),
    enabled: !!copy,
    staleTime: Infinity,
  });

  const grainCopies = useMemo(() => grainsQuery.data ?? [], [grainsQuery.data]);
  const reference = useMemo(() => referenceQuery.data ?? [], [referenceQuery.data]);

  /** La correction automatique de chaque grain, calculée une fois les deux listes connues. */
  const corrections = useMemo(() => {
    const byGrainCopyId = new Map<number, AutomaticCorrection>();
    for (const grainCopy of grainCopies) {
      const model = reference.find((item) => item.id === grainCopy.grain_scheduled_id);
      byGrainCopyId.set(
        grainCopy.id,
        automaticCorrection(
          grainCopy.grain_type_id,
          grainCopy.grain_copy_data.max_score ?? 0,
          model?.grain_data.custom_data,
          grainCopy.grain_copy_data.custom_copy_data,
        ),
      );
    }
    return byGrainCopyId;
  }, [grainCopies, reference]);

  if (copiesQuery.isLoading || scheduledQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }

  if (!copy || !scheduled || !canViewAsStudent(scheduled, copy)) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen
          imageSrc={illuExercizer}
          text={t('exercizer.copy.not.corrected.yet')}
          size={200}
        />
        <Button color="primary" variant="filled" onClick={() => navigate('/dashboard/student')}>
          {t('exercizer.dashboard.learner.tab1')}
        </Button>
      </div>
    );
  }

  if (grainsQuery.isLoading || referenceQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }
  if (grainCopies.length === 0) {
    return <Alert type="warning">{t('exercizer.subject.empty')}</Alert>;
  }

  return (
    <div className="mt-16">
      <CopySummary copy={copy} scheduled={scheduled} corrections={corrections} grainCopies={grainCopies} />

      <div className="d-flex flex-column gap-24 mt-24">
        {grainCopies.map((grainCopy) => (
          <GrainCopyReview
            key={grainCopy.id}
            grainCopy={grainCopy}
            grainCopies={grainCopies}
            reference={reference.find((item) => item.id === grainCopy.grain_scheduled_id)}
            correction={corrections.get(grainCopy.id)}
          />
        ))}
      </div>

      <div className="d-flex justify-content-end mt-24">
        <Button color="primary" variant="outline" onClick={() => navigate('/dashboard/student')}>
          {t('exercizer.dashboard.learner.tab1')}
        </Button>
      </div>
    </div>
  );
}

/** Le résumé de la copie : scores et commentaire général. */
function CopySummary({
  copy,
  scheduled,
  grainCopies,
  corrections,
}: {
  copy: SubjectCopy;
  scheduled: SubjectScheduled;
  grainCopies: GrainCopy[];
  corrections: Map<number, AutomaticCorrection>;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const automatic =
    typeof copy.calculated_score === 'number'
      ? copy.calculated_score
      : totalCalculatedScore(
          grainCopies.map((grainCopy) => corrections.get(grainCopy.id)?.calculated_score ?? 0),
        );

  return (
    <section className="card p-16">
      <Heading level="h2" headingStyle="h4" className="mb-8">
        {t('exercizer.summary')}
      </Heading>
      <p className="mb-4">{scheduled.title}</p>
      <p className="mb-4">
        {t('exercizer.auto.score')} : <strong>{formatScore(automatic)}</strong>{' '}
        {t('exercizer.on')} {scheduled.max_score ?? 0} {t('exercizer.score')}
      </p>
      {/* Une copie d'entraînement n'a pas de note finale : l'enseignant ne la corrige pas. */}
      {!copy.is_training_copy && (
        <p className="mb-4">
          {t('exercizer.final.score')} : <strong>{formatScore(copy.final_score)}</strong>{' '}
          {t('exercizer.on')} {scheduled.max_score ?? 0} {t('exercizer.score')}
        </p>
      )}
      {copy.submitted_date && (
        <p className="text-muted mb-8">
          <small>
            {t('exercizer.domino.delivered')}{' '}
            {formatDateTime(copy.submitted_date, t('exercizer.at'))}
          </small>
        </p>
      )}
      {/* `TextArea` du socle ne prend pas `readOnly` : il le lit dans le contexte du
          `FormControl` (`isReadOnly`), qui lui donne aussi son `id`. */}
      <FormControl id="copy-summary-comment" isReadOnly>
        <Label>{t('exercizer.summary.comment')}</Label>
        <TextArea
          size="md"
          value={copy.comment ?? ''}
          placeholder={t('exercizer.summary.nocomment')}
        />
      </FormControl>
    </section>
  );
}

/** Un grain, tel que l'élève le relit : sa réponse, le verdict, la note et les mots du professeur. */
function GrainCopyReview({
  grainCopy,
  grainCopies,
  reference,
  correction,
}: {
  grainCopy: GrainCopy;
  grainCopies: GrainCopy[];
  reference: GrainScheduled | undefined;
  correction: AutomaticCorrection | undefined;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [showCorrection, setShowCorrection] = useState(false);

  const maxScore = grainCopy.grain_copy_data.max_score ?? 0;
  const resolved = correction ?? { calculated_score: 0, answers: {} };

  if (grainCopy.grain_type_id === GRAIN.STATEMENT) {
    return (
      <article className="card p-16" id={`grain-copy-${grainCopy.id}`}>
        <GrainCopyHeader grainCopy={grainCopy} grainCopies={grainCopies} />
        <GrainCopyStatement grainCopy={grainCopy} />
      </article>
    );
  }

  /**
   * Le corrigé n'est proposé que si la note n'est pas déjà maximale : inutile de montrer la bonne
   * réponse à qui l'a trouvée. C'est la règle de `displayCorrectAnswerButton`.
   */
  const canShowCorrection =
    !!reference &&
    (grainCopy.final_score === null ||
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
            <FormControl id={`grain-copy-comment-${grainCopy.id}`} isReadOnly>
              <Label>{t('exercizer.grain.footer.comment')}</Label>
              <TextArea
                size="md"
                value={grainCopy.comment ?? ''}
                placeholder={t('exercizer.grain.footer.nocomment')}
              />
            </FormControl>
          </div>
          <div className="g-col-12 g-col-md-6">
            <p className="form-label mb-4">{t('exercizer.grain.footer.result')}</p>
            <p className="mb-4">
              {t('exercizer.auto.score')} :{' '}
              <strong>{formatScore(grainCopy.calculated_score ?? resolved.calculated_score)}</strong>{' '}
              {t('exercizer.on')} {maxScore} {t('exercizer.score')}
            </p>
            <p className="mb-0">
              {t('exercizer.final.score')} : <strong>{formatScore(grainCopy.final_score)}</strong>{' '}
              {t('exercizer.on')} {maxScore} {t('exercizer.score')}
            </p>
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
function ExpectedAnswers({
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

export default ViewCopy;
