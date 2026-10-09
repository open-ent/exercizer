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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  correctCopy,
  correctGrainCopy,
  getCopiesAsTeacher,
  getGrainCopies,
  getGrainsScheduled,
  getSubjectsScheduledAsTeacher,
} from '../api';
import { canCorrectAsTeacher, copyState } from '../copies';
import {
  automaticCorrection,
  AutomaticCorrection,
  copyScores,
  formatScore,
} from '../correction';
import { GrainCopyReview } from '../features/copies/GrainCopyReview';
import { isQuestion, sanitizeScore } from '../grains';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { GrainCopy, SubjectCopy } from '../types';

/**
 * Correction d'une copie par l'enseignant — portage de `ViewSubjectCopyController` côté
 * enseignant et de `subject-view-copy-teacher-actions`.
 *
 * Même présentation que la relecture de l'élève (le composant est partagé), mais la note et le
 * commentaire de chaque question sont modifiables, ainsi que le commentaire général. « Corriger »
 * clôt la correction et ramène à la liste des copies.
 *
 * ⚠ Sur une copie rendue, la SEULE route d'écriture acceptée est `PUT /grain-copy/correct` :
 * celle de l'élève (`PUT /grain-copy`) est refusée dès le rendu. C'est donc par elle que passe
 * aussi l'enregistrement du score automatique que le client vient de calculer.
 *
 * ⚠ La note finale d'une question non saisie VAUT son score automatique
 * (`correction.ts#copyScores`) : une copie s'ouvre déjà notée, et corriger consiste à amender.
 */
/** Les deux scores d'une copie, dans la forme que le serveur attend. */
const scoresOf = (grainCopies: GrainCopy[]) => {
  const { calculated, final } = copyScores(grainCopies);
  return { calculated_score: calculated, final_score: final };
};

export function CorrectCopy() {
  const { subjectCopyId: param } = useParams();
  const subjectCopyId = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const copiesQuery = useQuery({
    queryKey: ['exercizer', 'copies', 'teacher'],
    queryFn: getCopiesAsTeacher,
  });
  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'teacher'],
    queryFn: getSubjectsScheduledAsTeacher,
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

  const setGrainCopies = useCallback(
    (next: GrainCopy[]) =>
      queryClient.setQueryData(['exercizer', 'grain-copies', subjectCopyId], next),
    [queryClient, subjectCopyId],
  );

  /** Enregistrement d'une question : note assainie juste avant l'envoi. */
  const saveGrain = useCallback(
    (grainCopy: GrainCopy) =>
      correctGrainCopy({
        ...grainCopy,
        final_score: sanitizeScore(grainCopy.final_score),
      }),
    [],
  );

  const { schedule, flush, pending } = useDebouncedSave(saveGrain);

  /**
   * À l'ouverture, les questions qui n'ont encore ni score automatique ni note finale reçoivent
   * les deux — c'est ce que l'ancienne IHM faisait au fil de l'affichage de chaque question.
   * Une seule fois par copie : sans ce garde-fou, chaque rendu relancerait les écritures.
   */
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current) return;
    if (grainCopies.length === 0 || reference.length === 0) return;
    initialised.current = true;

    const updated: GrainCopy[] = [];
    for (const grainCopy of grainCopies) {
      if (!isQuestion(grainCopy.grain_type_id)) continue;
      const automatic = corrections.get(grainCopy.id)?.calculated_score ?? 0;
      const needsScore =
        grainCopy.calculated_score === null || grainCopy.calculated_score === undefined;
      const needsFinal = grainCopy.final_score === null || grainCopy.final_score === undefined;
      if (!needsScore && !needsFinal) continue;
      updated.push({
        ...grainCopy,
        calculated_score: needsScore ? automatic : grainCopy.calculated_score,
        final_score: needsFinal ? automatic : grainCopy.final_score,
      });
    }
    if (updated.length === 0) return;

    const byId = new Map(updated.map((grainCopy) => [grainCopy.id, grainCopy]));
    const next = grainCopies.map((grainCopy) => byId.get(grainCopy.id) ?? grainCopy);
    setGrainCopies(next);
    Promise.all(updated.map((grainCopy) => saveGrain(grainCopy)))
      // La copie suit : elle s'ouvre déjà notée, et la liste de correction doit le montrer.
      .then(() => (copy ? correctCopy({ ...copy, ...scoresOf(next) }) : undefined))
      .catch(() => setError(t('exercizer.error')));
    // `saveGrain` et `setGrainCopies` sont stables ; le drapeau garantit l'unicité.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grainCopies, reference, corrections]);

  const scores = useMemo(() => copyScores(grainCopies), [grainCopies]);

  const copySave = useDebouncedSave(useCallback((next: SubjectCopy) => correctCopy(next), []));

  /**
   * Reporte sur la COPIE les scores de ses questions.
   *
   * L'ancienne IHM réenregistrait la copie après chaque note de question
   * (`E_UPDATE_SUBJECT_COPY_NO_DEBOUNCE`) : sans cela, la liste de correction continuerait
   * d'afficher l'ancienne note, et l'élève ne verrait jamais la sienne changer.
   *
   * Les scores sont calculés à partir de la liste PASSÉE EN ARGUMENT, et non de celle du rendu :
   * deux notes saisies coup sur coup partiraient sinon avec le même total.
   */
  const syncCopyScores = useCallback(
    (grains: GrainCopy[], base: SubjectCopy) => {
      const next = copyScores(grains);
      copySave.schedule(base.id, {
        ...base,
        calculated_score: next.calculated,
        final_score: next.final,
      });
    },
    [copySave],
  );

  const onGrainChange = (grainCopy: GrainCopy) => {
    const next = grainCopies.map((item) => (item.id === grainCopy.id ? grainCopy : item));
    setGrainCopies(next);
    schedule(grainCopy.id, grainCopy);
    syncCopyScores(next, copy as SubjectCopy);
  };

  /** « Corriger » : on chasse ce qui est en attente, puis on clôt la correction. */
  const finish = useMutation({
    mutationFn: async () => {
      await flush();
      await copySave.flush();
      return correctCopy({
        ...(copy as SubjectCopy),
        ...scoresOf(grainCopies),
        is_correction_on_going: true,
        is_corrected: true,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'copies', 'teacher'] });
      navigate(`/dashboard/teacher/correction/${scheduled?.id ?? ''}`);
    },
    onError: () => setError(t('exercizer.error')),
  });

  /**
   * Les copies corrigeables de cette distribution, dans l'ordre des noms — celui de la liste de
   * correction. Elles donnent les boutons « copie précédente / suivante » et le décompte de ce
   * qui reste.
   */
  const siblings = useMemo(() => {
    if (!scheduled) return [];
    return (copiesQuery.data ?? [])
      .filter(
        (item) =>
          item.subject_scheduled_id === scheduled.id &&
          !item.is_training_copy &&
          canCorrectAsTeacher(scheduled, item),
      )
      .sort((a, b) => (a.owner_username ?? '').localeCompare(b.owner_username ?? '', 'fr'));
  }, [copiesQuery.data, scheduled]);

  const position = siblings.findIndex((item) => item.id === subjectCopyId);
  const remaining = siblings.filter((item) => copyState(item) !== 'is_corrected').length;

  const goTo = async (other: SubjectCopy) => {
    // On n'abandonne pas une note en cours de frappe en changeant de copie.
    await flush();
    await copySave.flush();
    navigate(`/subject/copy/view/${scheduled?.subject_id}/${other.id}/`);
  };

  if (copiesQuery.isLoading || scheduledQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }

  // Une copie non rendue n'est pas corrigeable : l'ancienne IHM ne la proposait pas non plus.
  if (!copy || !scheduled || !canCorrectAsTeacher(scheduled, copy)) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.empty.corrections')} size={200} />
        <Button
          color="primary"
          variant="filled"
          onClick={() => navigate('/dashboard/teacher/correction')}
        >
          {t('exercizer.dashboard.instructer.tab2')}
        </Button>
      </div>
    );
  }

  if (grainsQuery.isLoading || referenceQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }

  const saving = pending || copySave.pending;

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <div>
          <Heading level="h2" headingStyle="h4" className="m-0">
            {t('exercizer.copy.from')} {copy.owner_username}
          </Heading>
          <small className="text-muted">
            {scheduled.title} — {t('exercizer.copies.yet.to.correct.plain', { count: remaining })}
          </small>
        </div>
        <div className="d-flex align-items-center gap-8 flex-wrap">
          <span className="text-muted" role="status">
            {saving ? t('exercizer.subject.navigation.saving') : t('exercizer.subject.saved')}
          </span>
          <Button
            color="tertiary"
            variant="ghost"
            disabled={position <= 0}
            onClick={() => goTo(siblings[position - 1])}
          >
            {t('exercizer.previous.copy')}
          </Button>
          <Button
            color="tertiary"
            variant="ghost"
            disabled={position < 0 || position >= siblings.length - 1}
            onClick={() => goTo(siblings[position + 1])}
          >
            {t('exercizer.next.copy')}
          </Button>
          <Button
            color="tertiary"
            variant="ghost"
            onClick={async () => {
              await flush();
              await copySave.flush();
              navigate(`/dashboard/teacher/correction/${scheduled.id}`);
            }}
          >
            {t(copy.is_corrected ? 'exercizer.back.corrected' : 'exercizer.back')}
          </Button>
          {!copy.is_corrected && (
            <Button
              color="primary"
              variant="filled"
              isLoading={finish.isPending}
              onClick={() => finish.mutate()}
            >
              {t('exercizer.copy.make.corrected')}
            </Button>
          )}
        </div>
      </div>

      {copy.is_corrected && (
        <Alert type="success" className="mb-16">
          {t('exercizer.copy.corrected.done')}
        </Alert>
      )}
      {/* Les notes ne sont visibles de l'élève qu'après la date de rendu : le dire évite de
          croire que la correction est publiée dès qu'elle est saisie. */}
      <Alert type="info" className="mb-16">
        {t('exercizer.correction.warning')}
      </Alert>
      {error && (
        <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
          {error}
        </Alert>
      )}

      <section className="card p-16">
        <Heading level="h3" headingStyle="h4" className="mb-8">
          {t('exercizer.summary')}
        </Heading>
        <p className="mb-4">
          {t('exercizer.auto.score')} : <strong>{formatScore(scores.calculated)}</strong>{' '}
          {t('exercizer.on')} {scheduled.max_score ?? 0} {t('exercizer.score')}
        </p>
        <p className="mb-8">
          {t('exercizer.final.score')} : <strong>{formatScore(scores.final)}</strong>{' '}
          {t('exercizer.on')} {scheduled.max_score ?? 0} {t('exercizer.score')}
        </p>
        <FormControl id="correct-copy-comment">
          <Label>{t('exercizer.summary.comment')}</Label>
          <TextArea
            size="md"
            value={copy.comment ?? ''}
            placeholder={t('exercizer.summary.comment.info')}
            onChange={(event) => {
              const next = { ...copy, comment: event.target.value, ...scoresOf(grainCopies) };
              queryClient.setQueryData(
                ['exercizer', 'copies', 'teacher'],
                (previous: SubjectCopy[] = []) =>
                  previous.map((item) => (item.id === next.id ? next : item)),
              );
              copySave.schedule(next.id, next);
            }}
          />
        </FormControl>
      </section>

      <div className="d-flex flex-column gap-24 mt-24">
        {grainCopies.map((grainCopy) => (
          <GrainCopyReview
            key={grainCopy.id}
            grainCopy={grainCopy}
            grainCopies={grainCopies}
            reference={reference.find((item) => item.id === grainCopy.grain_scheduled_id)}
            correction={corrections.get(grainCopy.id)}
            mode="teacher"
            onChange={onGrainChange}
          />
        ))}
      </div>
    </div>
  );
}

export default CorrectCopy;
