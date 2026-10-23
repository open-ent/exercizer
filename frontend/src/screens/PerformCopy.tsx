import { Alert, Button, EmptyScreen, Heading, LoadingScreen } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  canStillSubmit,
  getCopiesAsStudent,
  getCopySections,
  getGrainCopies,
  getGrainsScheduled,
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
import { CopySummary } from '../features/copies/CopySummary';
import { LargePerform } from '../features/copies/LargePerform';
import { PilotageBanner, usePilotage } from '../features/PilotageBanner';
import { SaveStatus } from '../features/SaveStatus';
import { LoadError } from '../features/LoadError';
import { copyQuestionNumber, GRAIN, isQuestion } from '../grains';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { groupCopiesBySection, sectionProgress } from '../sections';
import { copySummary, startsOnSummary } from '../summary';
import { GrainCopy, GrainCustomCopyData, ScheduledSection, SubjectCopy } from '../types';
import { formatDateTime } from '../utils';

/**
 * Passation d'une copie par l'élève — portage de `PerformSubjectCopyController` et de
 * `perform-subject-copy.html`.
 *
 * Un grain à la fois, avec la liste des grains à gauche pour s'y repérer. Chaque réponse part
 * d'elle-même peu après la saisie : il n'y a pas d'enregistrement à demander, seulement un
 * rendu — qui, lui, est définitif ou non selon le sujet.
 *
 * Sujet à sections (sql/039) : la liste de gauche est groupée par section, avec l'avancement de
 * chacune, et la distribution peut demander « une section par page » (`display_mode`) — la page
 * montre alors la consigne de la section et toutes ses questions. Une PAGE est donc une liste de
 * grains : un seul en mode question, toute la section en mode section.
 *
 * ⚠ Cet écran ne charge **jamais** les grains distribués (`/grains-scheduled`) : ils portent les
 * réponses attendues, et les demander ici les mettrait dans le navigateur de l'élève. Seule la
 * consultation d'une copie corrigée y a droit. L'ancienne IHM observe la même règle.
 * Exception : le GRAND FORMAT en entraînement (`LargePerform`), où l'élève vérifie chaque réponse
 * aussitôt donnée. Le serveur les lui sert déjà — une distribution d'entraînement a son échéance
 * au 1er janvier 1970 — et c'est la nature même d'un entraînement, non noté.
 */
export function PerformCopy() {
  const { subjectCopyId: param } = useParams();
  const subjectCopyId = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /** Rang de la page affichée (cf. `pages`). */
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

  // Pilotage en direct : pause, prolongation, remise d'office et messages de l'enseignant.
  const pilotage = usePilotage(scheduled, copy);

  // Grand format (sql/043) : toujours une question à l'écran, même si la distribution demandait
  // une section par page — c'est tout l'objet du mode. En entraînement, chaque réponse se vérifie.
  const large = !!scheduled?.large_display;
  const instantCheck = large && (!!scheduled?.is_training_mode || !!copy?.is_training_copy);

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

  const sectionsQuery = useQuery({
    queryKey: ['exercizer', 'copy-sections', subjectCopyId],
    queryFn: () => getCopySections(copy!),
    enabled: !!copy,
  });

  const referenceQuery = useQuery({
    queryKey: ['exercizer', 'grains-scheduled', copy?.subject_scheduled_id],
    queryFn: () => getGrainsScheduled(copy!.subject_scheduled_id),
    enabled: !!copy && instantCheck,
    staleTime: Infinity,
  });

  const grainCopies = useMemo(() => grainsQuery.data ?? [], [grainsQuery.data]);
  const sections = useMemo(() => sectionsQuery.data ?? [], [sectionsQuery.data]);
  const groups = useMemo(() => groupCopiesBySection(grainCopies, sections), [grainCopies, sections]);
  const bySection = !large && scheduled?.display_mode === 'section' && sections.length > 0;
  const pages = useMemo(
    () =>
      bySection
        ? groups.map((group) => group.grains)
        : groups.flatMap((group) => group.grains.map((grainCopy) => [grainCopy])),
    [bySection, groups],
  );
  const sectionOf = (grainCopy: GrainCopy): ScheduledSection | null =>
    groups.find((group) => group.grains.some((item) => item.id === grainCopy.id))?.section ?? null;
  const pageOf = (grainCopy: GrainCopy) =>
    pages.findIndex((page) => page.some((item) => item.id === grainCopy.id));

  const setGrainCopies = useCallback(
    (next: GrainCopy[]) =>
      queryClient.setQueryData(['exercizer', 'grain-copies', subjectCopyId], next),
    [queryClient, subjectCopyId],
  );

  const { schedule, flush, pending, failed, retry } = useDebouncedSave(
    useCallback((grainCopy: GrainCopy) => updateGrainCopy(grainCopy), []),
    // Plus court que pour l'édition d'un sujet : une réponse d'élève ne doit pas rester en
    // suspens, un onglet fermé entre-temps la perdrait.
    700,
  );

  /** Reprend là où l'élève s'était arrêté, une seule fois, quand la liste est connue. */
  const [restored, setRestored] = useState(false);
  /** Récapitulatif affiché à la place des questions : à l'ouverture d'une copie neuve, ou à la demande (« Résumé »). */
  const [onSummary, setOnSummary] = useState<boolean | null>(null);
  useEffect(() => {
    // Les sections font partie du découpage en pages : on attend de les connaître.
    if (restored || pages.length === 0 || sectionsQuery.isLoading || !copy) return;
    if (startsOnSummary(copy)) setOnSummary(true);
    else {
      const position = pages.findIndex((page) => page.some((item) => item.id === copy.current_grain_id));
      if (position >= 0) setIndex(position);
      setOnSummary(false);
    }
    setRestored(true);
  }, [restored, pages, sectionsQuery.isLoading, copy]);

  const page = pages[index] ?? [];

  /** Mémorise la position courante côté serveur (le 1er grain de la page), sans bloquer. */
  const goTo = (position: number) => {
    setOnSummary(false);
    setIndex(position);
    const first = pages[position]?.[0];
    if (!first) return;
    void setCurrentGrain(subjectCopyId, first.id).catch(() => undefined);
  };

  const onAnswerChange = (grainCopy: GrainCopy, next: GrainCustomCopyData) => {
    // Séance en pause ou copie remise d'office : on n'envoie même pas la requête, le serveur la
    // refuserait.
    if (pilotage.readOnly || grainCopy.unreadable) return;
    const updated: GrainCopy = {
      ...grainCopy,
      grain_copy_data: { ...grainCopy.grain_copy_data, custom_copy_data: next },
    };
    setGrainCopies(grainCopies.map((item) => (item.id === updated.id ? updated : item)));
    schedule(updated.id, updated);
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (pilotage.readOnly) throw new Error('pilotage');
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
      const reason = err instanceof Error ? err.message : '';
      setError(
        t(
          reason === 'corrected'
            ? 'exercizer.check.corrected'
            : reason === 'pilotage'
              ? 'exercizer.pilotage.copy.submitted'
              : 'exercizer.error',
        ),
      );
    },
  });

  if (copiesQuery.isLoading || scheduledQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }

  // Lecture en échec : une erreur n'est pas « copie corrigée » ni « sujet vide ».
  if (copiesQuery.isError || scheduledQuery.isError) {
    return (
      <LoadError
        onRetry={() => {
          void copiesQuery.refetch();
          void scheduledQuery.refetch();
        }}
      />
    );
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

  if (grainsQuery.isLoading || sectionsQuery.isLoading) return <LoadingScreen position={false} />;
  if (grainsQuery.isError || sectionsQuery.isError) {
    return (
      <LoadError
        onRetry={() => {
          void grainsQuery.refetch();
          void sectionsQuery.refetch();
        }}
      />
    );
  }

  if (grainCopies.length === 0) {
    return <Alert type="warning">{t('exercizer.subject.empty')}</Alert>;
  }

  const canSubmit = submittableQuery.data === true;
  const answered = grainCopies.filter(
    (grainCopy) => isQuestion(grainCopy.grain_type_id) && hasAnswer(grainCopy),
  ).length;
  const questions = grainCopies.filter((grainCopy) => isQuestion(grainCopy.grain_type_id)).length;

  // En mode question, l'intertitre rappelle la section ; sa consigne n'accompagne que la première
  // question de la section. En mode section, elle ouvre toujours la page.
  const pageSection = page[0] ? sectionOf(page[0]) : null;
  const firstOfSection = groups.find((group) => group.section === pageSection)?.grains[0];
  const showSectionDescription =
    !!pageSection?.description && (bySection || firstOfSection?.id === page[0]?.id);

  const buttonSize = large ? 'lg' : 'md';
  /** « Continuer plus tard » : les réponses en attente sont enregistrées avant de quitter ; si l'enregistrement échoue, on reste. */
  const later = async () => {
    try {
      await flush();
    } catch {
      setError(t('exercizer.error'));
      return;
    }
    navigate(copy.is_training_copy ? '/dashboard/student?tab=training' : '/dashboard/student');
  };
  const summary = copySummary(scheduled, copy);
  const showingSummary = onSummary === true;
  const startButton = (
    <Button size={buttonSize} color="primary" variant="filled" onClick={() => goTo(0)} data-start-copy>
      {t('exercizer.summary.start', { defaultValue: 'Commencer' })}
    </Button>
  );
  const banners = (
    <>
      <PilotageBanner pilotage={pilotage} />

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
    </>
  );
  const actions = (
    <>
      {index > 0 && (
        <Button size={buttonSize} color="tertiary" variant="ghost" onClick={() => goTo(index - 1)}>
          {t(bySection ? 'exercizer.section.previous' : 'exercizer.previous')}
        </Button>
      )}
      {index < pages.length - 1 ? (
        <Button size={buttonSize} color="primary" variant="filled" onClick={() => goTo(index + 1)}>
          {t(bySection ? 'exercizer.section.next' : 'exercizer.next')}
        </Button>
      ) : copy.is_training_copy ? (
        <Button
          size={buttonSize}
          color="primary"
          variant="filled"
          isLoading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          {t('exercizer.copy.see.final.score')}
        </Button>
      ) : (
        <Button
          size={buttonSize}
          color="primary"
          variant="filled"
          disabled={!canSubmit || pilotage.readOnly}
          onClick={() => setConfirming(true)}
        >
          {t('exercizer.make.copy')}
        </Button>
      )}
    </>
  );
  const confirmModal = (
    <>
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
    </>
  );

  if (large && showingSummary) {
    return (
      <div className="mt-16">
        <Heading level="h2" headingStyle="h4" className="mb-16">
          {scheduled.title}
        </Heading>
        {banners}
        <CopySummary summary={summary} />
        <div className="d-flex justify-content-end mt-16">{startButton}</div>
        {confirmModal}
      </div>
    );
  }

  if (large) {
    return (
      <>
        <LargePerform
          title={scheduled.title}
          grainCopies={pages.map((item) => item[0])}
          index={index}
          onGoTo={goTo}
          hasAnswer={hasAnswer}
          onAnswerChange={onAnswerChange}
          readOnly={(!canSubmit && !copy.is_training_copy) || pilotage.readOnly}
          reference={instantCheck ? referenceQuery.data : undefined}
          banners={banners}
          actions={actions}
        />
        {confirmModal}
      </>
    );
  }

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <div>
          <Heading level="h2" headingStyle="h4" className="m-0">
            {scheduled.title}
            {typeof scheduled.max_score === 'number' && (
              <small className="text-muted fw-normal" data-max-score>
                {' '}
                — {scheduled.max_score} {t('exercizer.score')}
              </small>
            )}
          </Heading>
          <small className="text-muted">
            {t('exercizer.domino.todelivered')}{' '}
            {formatDateTime(scheduled.due_date, t('exercizer.at'))}
          </small>
        </div>
        <div className="d-flex align-items-center gap-16">
          <SaveStatus pending={pending} failed={failed} onRetry={retry} />
          <span className="text-muted">
            {answered}/{questions} {t('exercizer.copy.answered')}
          </span>
          <Button color="tertiary" variant="outline" onClick={() => void later()} data-later>
            {t('exercizer.make.later')}
          </Button>
          {canSubmit && !copy.is_training_copy && (
            <Button color="primary" variant="outline" disabled={pilotage.readOnly} onClick={() => setConfirming(true)} data-submit-now>
              {t('exercizer.make.copy')}
            </Button>
          )}
        </div>
      </div>

      {banners}

      <div className="grid gap-24">
        <aside className="g-col-12 g-col-lg-3">
          <nav aria-label={t('exercizer.rank')} className="d-flex flex-column gap-16">
            <button
              type="button"
              data-nav-summary
              className={`btn btn-sm w-100 text-start ${showingSummary ? 'btn-filled btn-secondary' : 'btn-ghost btn-tertiary'}`}
              aria-current={showingSummary ? 'step' : undefined}
              onClick={() => setOnSummary(true)}
            >
              {t('exercizer.summary')}
            </button>
            {groups.map((group) => {
              const progress = sectionProgress(group.grains, hasAnswer);
              return (
                <div key={group.section?.id ?? 'ungrouped'}>
                  {group.section && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-tertiary btn-sm w-100 text-start fw-bold d-flex justify-content-between gap-8"
                      onClick={() => goTo(pageOf(group.grains[0]))}
                    >
                      <span className="text-truncate">{group.section.title}</span>
                      {progress.total > 0 && (
                        <small
                          className={progress.answered === progress.total ? 'text-success' : 'text-muted'}
                          aria-label={`${progress.answered}/${progress.total} ${t('exercizer.copy.answered')}`}
                        >
                          {progress.answered}/{progress.total}
                        </small>
                      )}
                    </button>
                  )}
                  <ol className={`list-unstyled d-flex flex-column gap-4 ${group.section ? 'ps-16' : ''}`}>
                    {group.grains.map((grainCopy) => {
                      const position = pageOf(grainCopy);
                      const isCurrent = page.some((item) => item.id === grainCopy.id);
                      return (
                        <li key={grainCopy.id}>
                          <button
                            type="button"
                            className={`btn btn-sm w-100 text-start ${
                              isCurrent && !bySection ? 'btn-filled btn-secondary' : 'btn-ghost btn-tertiary'
                            }`}
                            aria-current={isCurrent ? 'step' : undefined}
                            onClick={() => {
                              goTo(position);
                              if (bySection) scrollToGrainCopy(grainCopy);
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
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </nav>
        </aside>

        <section className="g-col-12 g-col-lg-9">
          {showingSummary ? (
            <>
              <CopySummary summary={summary} />
              <div className="d-flex justify-content-end mt-16">{startButton}</div>
            </>
          ) : (
            <>
          {pageSection && (
            <header className="mb-16">
              <Heading level="h3" headingStyle="h5" className="mb-8">
                {pageSection.title}
              </Heading>
              {showSectionDescription && (
                <div dangerouslySetInnerHTML={{ __html: pageSection.description ?? '' }} />
              )}
            </header>
          )}

          {page.map((grainCopy) => (
            <article key={grainCopy.id} id={`grain-copy-${grainCopy.id}`} className="card p-16 mb-16">
              {grainCopy.unreadable && (
                <div data-unreadable>
                  <Alert type="danger" className="mb-16">
                  {t('exercizer.grain.unreadable', { defaultValue: "Cette question est illisible : vos réponses n'y seront pas enregistrées. Prévenez votre enseignant." })}
                </Alert>
                </div>
              )}
              <GrainCopyHeader grainCopy={grainCopy} grainCopies={grainCopies} showHint />
              <GrainCopyStatement grainCopy={grainCopy} />
              <GrainCopyDocuments grainCopy={grainCopy} />

              <AnswerFields
                grainTypeId={grainCopy.grain_type_id}
                data={grainCopy.grain_copy_data.custom_copy_data ?? {}}
                onChange={(next) => onAnswerChange(grainCopy, next)}
                readOnly={(!canSubmit && !copy.is_training_copy) || pilotage.readOnly || !!grainCopy.unreadable}
              />
            </article>
          ))}

          <div className="d-flex justify-content-end gap-16 mt-16 flex-wrap">
            {actions}
          </div>
            </>
          )}
        </section>
      </div>

      {confirmModal}
    </div>
  );
}

/** En mode section, mène à une question de la page affichée. */
function scrollToGrainCopy(grainCopy: GrainCopy) {
  window.setTimeout(
    () =>
      document
        .getElementById(`grain-copy-${grainCopy.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    50,
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
