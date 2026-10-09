import { Alert, Button, EmptyScreen, Heading, LoadingScreen } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  canStillSubmit,
  getCopiesAsStudent,
  getGrainCopies,
  getSubjectsScheduledAsStudent,
  setCurrentGrain,
  submitCopy,
  updateGrainCopy,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { canPerformAsStudent } from '../copies';
import { AnswerFields } from '../features/copies/AnswerFields';
import {
  GrainCopyDocuments,
  GrainCopyHeader,
  GrainCopyStatement,
} from '../features/copies/GrainCopyHeader';
import { copyQuestionNumber, GRAIN, isEditableHere, isQuestion } from '../grains';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { GrainCopy, GrainCustomCopyData, SubjectCopy } from '../types';
import { formatDateTime } from '../utils';

/**
 * Passation d'une copie par l'élève — portage de `PerformSubjectCopyController` et de
 * `perform-subject-copy.html`.
 *
 * Un grain à la fois, avec la liste des grains à gauche pour s'y repérer. Chaque réponse part
 * d'elle-même peu après la saisie : il n'y a pas d'enregistrement à demander, seulement un
 * rendu — qui, lui, est définitif ou non selon le sujet.
 *
 * ⚠ Cet écran ne charge **jamais** les grains distribués (`/grains-scheduled`) : ils portent les
 * réponses attendues, et les demander ici les mettrait dans le navigateur de l'élève. Seule la
 * consultation d'une copie corrigée y a droit. L'ancienne IHM observe la même règle.
 */
export function PerformCopy() {
  const { subjectCopyId: param } = useParams();
  const subjectCopyId = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  /**
   * Le serveur dit si la copie est encore modifiable : il répond non dès que l'enseignant a
   * commencé à la corriger. On le demande à l'ouverture, et de nouveau avant de rendre.
   */
  const submittableQuery = useQuery({
    queryKey: ['exercizer', 'can-submit', subjectCopyId],
    queryFn: () => canStillSubmit(subjectCopyId),
    enabled: !!copy,
  });

  const grainCopies = useMemo(() => grainsQuery.data ?? [], [grainsQuery.data]);

  const setGrainCopies = useCallback(
    (next: GrainCopy[]) =>
      queryClient.setQueryData(['exercizer', 'grain-copies', subjectCopyId], next),
    [queryClient, subjectCopyId],
  );

  const { schedule, flush, pending } = useDebouncedSave(
    useCallback((grainCopy: GrainCopy) => updateGrainCopy(grainCopy), []),
    // Plus court que pour l'édition d'un sujet : une réponse d'élève ne doit pas rester en
    // suspens, un onglet fermé entre-temps la perdrait.
    700,
  );

  /** Reprend là où l'élève s'était arrêté, une seule fois, quand la liste est connue. */
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored || grainCopies.length === 0 || !copy?.current_grain_id) return;
    const position = grainCopies.findIndex((item) => item.id === copy.current_grain_id);
    if (position >= 0) setIndex(position);
    setRestored(true);
  }, [restored, grainCopies, copy?.current_grain_id]);

  const current = grainCopies[index];

  /** Mémorise la position courante côté serveur, sans bloquer la navigation. */
  const rememberPosition = (grainCopy: GrainCopy | undefined) => {
    if (!grainCopy) return;
    void setCurrentGrain(subjectCopyId, grainCopy.id).catch(() => undefined);
  };

  const onAnswerChange = (next: GrainCustomCopyData) => {
    if (!current) return;
    const updated: GrainCopy = {
      ...current,
      grain_copy_data: { ...current.grain_copy_data, custom_copy_data: next },
    };
    setGrainCopies(grainCopies.map((item) => (item.id === updated.id ? updated : item)));
    schedule(updated.id, updated);
  };

  const submit = useMutation({
    mutationFn: async () => {
      await flush();
      // Dernière vérification : l'enseignant a pu ouvrir la correction pendant la passation.
      const stillOpen = await canStillSubmit(subjectCopyId);
      if (stillOpen !== true) throw new Error('corrected');
      return submitCopy(copy as SubjectCopy);
    },
    onSuccess: (submitted) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'copies'] });
      setConfirming(false);
      // Une copie d'entraînement mène à son score ; une copie notée, au tableau de bord.
      navigate(
        submitted?.is_training_copy
          ? `/subject/copy/view/final-score/${subjectCopyId}`
          : '/dashboard/student',
      );
    },
    onError: (err) => {
      setConfirming(false);
      setError(err instanceof Error && err.message === 'corrected'
        ? t('exercizer.check.corrected')
        : t('exercizer.error'));
    },
  });

  if (copiesQuery.isLoading || scheduledQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }

  // Une copie qu'on n'a pas le droit d'ouvrir ne doit pas s'afficher à moitié : on renvoie au
  // tableau de bord, comme le faisait l'ancienne IHM.
  if (!copy || !scheduled || !canPerformAsStudent(scheduled, copy)) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.check.corrected')} size={200} />
        <Button color="primary" variant="filled" onClick={() => navigate('/dashboard/student')}>
          {t('exercizer.dashboard.learner.tab1')}
        </Button>
      </div>
    );
  }

  if (grainsQuery.isLoading) return <LoadingScreen position={false} />;

  if (grainCopies.length === 0) {
    return <Alert type="warning">{t('exercizer.subject.empty')}</Alert>;
  }

  const canSubmit = submittableQuery.data === true;
  const answered = grainCopies.filter(
    (grainCopy) => isQuestion(grainCopy.grain_type_id) && hasAnswer(grainCopy),
  ).length;
  const questions = grainCopies.filter((grainCopy) => isQuestion(grainCopy.grain_type_id)).length;

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <div>
          <Heading level="h2" headingStyle="h4" className="m-0">
            {scheduled.title}
          </Heading>
          <small className="text-muted">
            {t('exercizer.domino.todelivered')}{' '}
            {formatDateTime(scheduled.due_date, t('exercizer.at'))}
          </small>
        </div>
        <div className="d-flex align-items-center gap-16">
          <span className="text-muted" role="status">
            {pending ? t('exercizer.subject.navigation.saving') : t('exercizer.subject.saved')}
          </span>
          <span className="text-muted">
            {answered}/{questions} {t('exercizer.copy.answered')}
          </span>
        </div>
      </div>

      {!canSubmit && !copy.is_training_copy && (
        <Alert type="info" className="mb-16">
          {t('exercizer.check.corrected')}
        </Alert>
      )}
      {error && (
        <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
          {error}
        </Alert>
      )}

      <div className="grid gap-24">
        <aside className="g-col-12 g-col-lg-3">
          <nav aria-label={t('exercizer.rank')}>
            <ol className="list-unstyled d-flex flex-column gap-4">
              {grainCopies.map((grainCopy, position) => (
                <li key={grainCopy.id}>
                  <button
                    type="button"
                    className={`btn btn-sm w-100 text-start ${
                      position === index ? 'btn-filled btn-secondary' : 'btn-ghost btn-tertiary'
                    }`}
                    aria-current={position === index ? 'step' : undefined}
                    onClick={() => {
                      setIndex(position);
                      rememberPosition(grainCopy);
                    }}
                  >
                    {isQuestion(grainCopy.grain_type_id)
                      ? `${copyQuestionNumber(grainCopy, grainCopies)}) ${grainCopy.grain_copy_data.title ?? ''}`
                      : (grainCopy.grain_copy_data.title ?? '')}
                    {isQuestion(grainCopy.grain_type_id) && hasAnswer(grainCopy) && (
                      <span className="text-success ms-4" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <section className="g-col-12 g-col-lg-9">
          {current && (
            <article className="card p-16">
              <GrainCopyHeader grainCopy={current} grainCopies={grainCopies} showHint />
              <GrainCopyStatement grainCopy={current} />
              <GrainCopyDocuments grainCopy={current} />

              {isEditableHere(current.grain_type_id) ? (
                <AnswerFields
                  grainTypeId={current.grain_type_id}
                  data={current.grain_copy_data.custom_copy_data ?? {}}
                  onChange={onAnswerChange}
                  readOnly={!canSubmit && !copy.is_training_copy}
                />
              ) : (
                // Grain « à zones » : il reste à porter. On ne montre pas un champ qui ne
                // s'enregistrerait pas — mieux vaut renvoyer l'élève là où il peut répondre.
                <Alert type="warning">
                  <div className="d-flex flex-column gap-8">
                    <span>{t('exercizer.grain.zone.notmigrated.perform')}</span>
                    <div>
                      <Button
                        color="primary"
                        variant="outline"
                        onClick={() => {
                          window.location.href = `/exercizer?ui=angular#/subject/copy/perform/${subjectCopyId}/`;
                        }}
                      >
                        {t('exercizer.switch.notmigrated.action')}
                      </Button>
                    </div>
                  </div>
                </Alert>
              )}
            </article>
          )}

          <div className="d-flex justify-content-end gap-16 mt-16 flex-wrap">
            {index > 0 && (
              <Button
                color="tertiary"
                variant="ghost"
                onClick={() => {
                  const position = index - 1;
                  setIndex(position);
                  rememberPosition(grainCopies[position]);
                }}
              >
                {t('exercizer.previous')}
              </Button>
            )}
            {index < grainCopies.length - 1 ? (
              <Button
                color="primary"
                variant="filled"
                onClick={() => {
                  const position = index + 1;
                  setIndex(position);
                  rememberPosition(grainCopies[position]);
                }}
              >
                {t('exercizer.next')}
              </Button>
            ) : copy.is_training_copy ? (
              <Button
                color="primary"
                variant="filled"
                isLoading={submit.isPending}
                onClick={() => submit.mutate()}
              >
                {t('exercizer.copy.see.final.score')}
              </Button>
            ) : (
              <Button
                color="primary"
                variant="filled"
                disabled={!canSubmit}
                onClick={() => setConfirming(true)}
              >
                {t('exercizer.make.copy')}
              </Button>
            )}
          </div>
        </section>
      </div>

      {confirming && (
        <ConfirmModal
          title={t('exercizer.make.copy')}
          confirmLabel={t('exercizer.make.copy')}
          isLoading={submit.isPending}
          onClose={() => setConfirming(false)}
          onConfirm={() => submit.mutate()}
        >
          <p>
            {t('exercizer.make.copy.confirm')} <em>{scheduled.title}</em> {t('exercizer.copy.to')}{' '}
            <strong>{scheduled.owner_username}</strong> ?
          </p>
          <Alert type="info" className="my-8">
            {t('exercizer.make.copy.info')}
          </Alert>
          {/* Le rendu est définitif ou non : c'est ce que l'élève doit savoir avant de cliquer. */}
          <Alert type="warning">
            {t(
              scheduled.is_one_shot_submit
                ? 'exercizer.one.submit'
                : 'exercizer.several.submit',
            )}
          </Alert>
        </ConfirmModal>
      )}
    </div>
  );
}

/** Le grain a-t-il reçu une réponse ? Sert au décompte et à la pastille de la liste. */
function hasAnswer(grainCopy: GrainCopy): boolean {
  const data = grainCopy.grain_copy_data.custom_copy_data;
  if (!data) return false;
  switch (grainCopy.grain_type_id) {
    case GRAIN.SIMPLE_ANSWER:
    case GRAIN.OPEN_ANSWER:
      return !!data.filled_answer && data.filled_answer.trim() !== '' && data.filled_answer !== '<p></p>';
    case GRAIN.QCM:
      return (data.filled_answer_list ?? []).some((answer) => answer.isChecked);
    case GRAIN.MULTIPLE_ANSWERS:
      return (data.filled_answer_list ?? []).some((answer) => !!answer.text);
    case GRAIN.ASSOCIATION:
      return (data.filled_answer_list ?? []).some((answer) => !!answer.text_right);
    case GRAIN.ORDER_BY:
      // Une mise en ordre a toujours une réponse : l'ordre initial en est une. On la considère
      // répondue dès que l'élève a touché la copie — faute de mieux, dès qu'elle existe.
      return (data.filled_answer_list ?? []).length > 0;
    default:
      return (data.zones ?? []).some((zone) => !!zone.answer);
  }
}

export default PerformCopy;
