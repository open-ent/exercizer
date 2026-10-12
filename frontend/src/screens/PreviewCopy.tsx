import { Alert, Button, EmptyScreen, Heading, LoadingScreen, useEdificeClient } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import { getGrains, getSubjects, listSubjectFiles } from '../api';
import { automaticCorrection, AutomaticCorrection, copyScores } from '../correction';
import { AnswerFields } from '../features/copies/AnswerFields';
import {
  GrainCopyDocuments,
  GrainCopyHeader,
  GrainCopyStatement,
} from '../features/copies/GrainCopyHeader';
import { GrainCopyReview } from '../features/copies/GrainCopyReview';
import { RichTextEditor } from '../features/RichTextEditor';
import {
  byOrder,
  computedMaxScore,
  copyQuestionNumber,
  GRAIN,
  isQuestion,
  isUndecided,
  sanitizeScore,
  statementOf,
} from '../grains';
import { atLeast, subjectRight } from '../rights';
import { initialCopyData } from '../schedule';
import { Grain, GrainCopy, GrainCustomCopyData, GrainScheduled, Subject } from '../types';
import { CopySummary } from './ViewCopy';

/**
 * La copie qu'un élève recevrait pour ce sujet, fabriquée en mémoire — portage de
 * `PerformSubjectCopyController#_preview`.
 *
 * Rien n'est créé en base : les identifiants sont négatifs pour qu'on ne puisse pas les
 * confondre avec ceux d'une vraie copie. Le tirage (étiquettes d'une association, ordre d'une
 * mise en ordre) est celui d'une vraie distribution.
 */
export function previewGrainCopies(grains: Grain[]): GrainCopy[] {
  return byOrder(grains)
    .filter((grain) => !isUndecided(grain.grain_type_id))
    .map((grain, index) => ({
      id: -(index + 1),
      subject_copy_id: 0,
      grain_type_id: grain.grain_type_id,
      grain_scheduled_id: grain.id,
      order_by: grain.order_by,
      grain_copy_data: {
        title: grain.grain_data.title,
        max_score: sanitizeScore(grain.grain_data.max_score),
        statement: grain.grain_data.statement,
        document_list: grain.grain_data.document_list,
        answer_hint: grain.grain_data.answer_hint,
        custom_copy_data:
          grain.grain_type_id === GRAIN.STATEMENT
            ? { statement: statementOf(grain.grain_data) }
            : initialCopyData(grain),
      },
    }));
}

/** Les grains du sujet, vus comme des grains distribués : ils portent les réponses attendues. */
const asReference = (grains: Grain[]): GrainScheduled[] =>
  grains.map((grain) => ({
    id: grain.id,
    subject_scheduled_id: 0,
    grain_type_id: grain.grain_type_id,
    order_by: grain.order_by,
    grain_data: grain.grain_data,
  }));

/** Ce que l'aperçu de la passation transmet à l'aperçu de la correction. */
interface PreviewState {
  grainCopies?: GrainCopy[];
}

function usePreviewSubject() {
  const { subjectId: param } = useParams();
  const subjectId = Number(param);
  const { user } = useEdificeClient();
  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });
  const subject = (subjectsQuery.data ?? []).find((item) => item.id === subjectId);
  const grainsQuery = useQuery({
    queryKey: ['exercizer', 'grains', subjectId],
    queryFn: () => getGrains(subject as Subject),
    enabled: !!subject && subject.type !== 'simple',
  });
  return {
    subject,
    grains: useMemo(() => grainsQuery.data ?? [], [grainsQuery.data]),
    isLoading: subjectsQuery.isLoading || grainsQuery.isLoading,
    // Un sujet partagé en LECTURE se regarde, mais ne s'édite pas : pas de retour à l'éditeur.
    canEdit: !!subject && atLeast(subjectRight(subject, user), 'contrib'),
  };
}

function Missing() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  return (
    <div className="d-flex flex-column align-items-center gap-16 mt-24">
      <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.empty.subjects')} size={200} />
      <Button color="primary" variant="filled" onClick={() => navigate('/dashboard')}>
        {t('exercizer.title')}
      </Button>
    </div>
  );
}

/**
 * Aperçu de la passation — ce que verra l'élève, et l'enseignant peut y répondre pour essayer.
 *
 * C'est aussi l'écran d'un sujet qu'on n'a qu'en lecture : il n'a pas d'autre moyen de le voir.
 * Rien n'est enregistré, et le pilotage en direct n'a pas lieu d'être hors d'une vraie séance.
 */
export function PreviewPerformCopy() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const { subject, grains, isLoading, canEdit } = usePreviewSubject();
  const [grainCopies, setGrainCopies] = useState<GrainCopy[]>([]);
  const [index, setIndex] = useState(0);

  // La copie est tirée une fois les grains connus — pas à chaque rendu, le mélange changerait.
  useEffect(() => {
    if (grains.length > 0) setGrainCopies(previewGrainCopies(grains));
  }, [grains]);

  if (isLoading) return <LoadingScreen position={false} />;
  if (!subject) return <Missing />;

  const current = grainCopies[index];
  const onAnswerChange = (next: GrainCustomCopyData) =>
    setGrainCopies((list) =>
      list.map((item) =>
        item.id === current.id
          ? { ...item, grain_copy_data: { ...item.grain_copy_data, custom_copy_data: next } }
          : item,
      ),
    );

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {subject.title} - {computedMaxScore(grains)} {t('exercizer.score')}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          {canEdit ? (
            <>
              <Button
                color="tertiary"
                variant="ghost"
                onClick={() => navigate(`/subject/edit/${subject.id}/`)}
              >
                {t('exercizer.back.edit')}
              </Button>
              <Button
                color="primary"
                variant="filled"
                disabled={grainCopies.length === 0}
                onClick={() =>
                  navigate(`/subject/copy/view/preview/${subject.id}/`, {
                    state: { grainCopies } satisfies PreviewState,
                  })
                }
              >
                {t('exercizer.preview.correction')}
              </Button>
            </>
          ) : (
            <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard')}>
              {t('exercizer.back.subject')}
            </Button>
          )}
        </div>
      </div>

      {grainCopies.length === 0 || !current ? (
        <Alert type="warning">{t('exercizer.subject.empty')}</Alert>
      ) : (
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
                      onClick={() => setIndex(position)}
                    >
                      {isQuestion(grainCopy.grain_type_id)
                        ? `${copyQuestionNumber(grainCopy, grainCopies)}) ${grainCopy.grain_copy_data.title ?? ''}`
                        : (grainCopy.grain_copy_data.title ?? '')}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <section className="g-col-12 g-col-lg-9">
            <article className="card p-16">
              <GrainCopyHeader grainCopy={current} grainCopies={grainCopies} showHint />
              <GrainCopyStatement grainCopy={current} />
              <GrainCopyDocuments grainCopy={current} />
              <AnswerFields
                grainTypeId={current.grain_type_id}
                data={current.grain_copy_data.custom_copy_data ?? {}}
                onChange={onAnswerChange}
              />
            </article>
            <div className="d-flex justify-content-end gap-16 mt-16 flex-wrap">
              {index > 0 && (
                <Button color="tertiary" variant="ghost" onClick={() => setIndex(index - 1)}>
                  {t('exercizer.previous')}
                </Button>
              )}
              {index < grainCopies.length - 1 && (
                <Button color="primary" variant="filled" onClick={() => setIndex(index + 1)}>
                  {t('exercizer.next')}
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Aperçu de la correction — la copie d'essai telle que l'élève la relirait une fois corrigée,
 * avec le verdict de la correction automatique et le corrigé de chaque question.
 *
 * Les réponses viennent de l'aperçu de la passation, transmises par l'état de navigation ;
 * ouverte directement, la page montre une copie vierge.
 */
export function PreviewViewCopy() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const location = useLocation();
  const { subject, grains, isLoading } = usePreviewSubject();

  const answered = (location.state as PreviewState | null)?.grainCopies;
  const reference = useMemo(() => asReference(grains), [grains]);

  const { grainCopies, corrections } = useMemo(() => {
    const byGrainCopyId = new Map<number, AutomaticCorrection>();
    const list = (answered ?? previewGrainCopies(grains)).map((grainCopy) => {
      const model = reference.find((item) => item.id === grainCopy.grain_scheduled_id);
      const correction = automaticCorrection(
        grainCopy.grain_type_id,
        grainCopy.grain_copy_data.max_score ?? 0,
        model?.grain_data.custom_data,
        grainCopy.grain_copy_data.custom_copy_data,
      );
      byGrainCopyId.set(grainCopy.id, correction);
      // Comme pour une vraie copie, la note d'une question vaut d'abord son score automatique.
      return isQuestion(grainCopy.grain_type_id)
        ? {
            ...grainCopy,
            calculated_score: correction.calculated_score,
            final_score: correction.calculated_score,
          }
        : grainCopy;
    });
    return { grainCopies: list, corrections: byGrainCopyId };
  }, [answered, grains, reference]);

  if (isLoading) return <LoadingScreen position={false} />;
  if (!subject) return <Missing />;

  const scores = copyScores(grainCopies);
  const maxScore = computedMaxScore(grains);

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {t('exercizer.preview.copy')} — {subject.title}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          <Button
            color="tertiary"
            variant="ghost"
            onClick={() => navigate(`/subject/edit/${subject.id}/`)}
          >
            {t('exercizer.back.edit')}
          </Button>
          <Button
            color="tertiary"
            variant="ghost"
            onClick={() => navigate(`/subject/copy/preview/perform/${subject.id}/`)}
          >
            {t('exercizer.back.preview')}
          </Button>
        </div>
      </div>

      {grainCopies.length === 0 ? (
        <Alert type="warning">{t('exercizer.subject.empty')}</Alert>
      ) : (
        <>
          <CopySummary
            copy={{
              id: 0,
              subject_scheduled_id: 0,
              owner: '',
              calculated_score: scores.calculated,
              final_score: scores.final,
            }}
            scheduled={{
              id: 0,
              subject_id: subject.id,
              owner: subject.owner,
              title: subject.title,
              max_score: maxScore,
            }}
            grainCopies={grainCopies}
            corrections={corrections}
          />
          <div className="d-flex flex-column gap-24 mt-24">
            {grainCopies.map((grainCopy) => (
              <GrainCopyReview
                key={grainCopy.id}
                grainCopy={grainCopy}
                grainCopies={grainCopies}
                reference={reference.find((item) => item.id === grainCopy.grain_scheduled_id)}
                correction={corrections.get(grainCopy.id)}
                mode="student"
                alwaysShowCorrection
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Aperçu d'un sujet « simple » : sa consigne et ses corrigés, sans rien de modifiable — ce que
 * voit un enseignant à qui le sujet a été partagé en lecture.
 */
export function PreviewSimpleSubject() {
  const { subjectPreviewId: param } = useParams();
  const subjectId = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });
  const subject = (subjectsQuery.data ?? []).find((item) => item.id === subjectId);
  const filesQuery = useQuery({
    queryKey: ['exercizer', 'subject-files', subjectId],
    queryFn: () => listSubjectFiles(subjectId),
    enabled: !!subject,
  });

  if (subjectsQuery.isLoading) return <LoadingScreen position={false} />;
  if (!subject) return <Missing />;

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {subject.title}
        </Heading>
        <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard')}>
          {t('exercizer.back.subject')}
        </Button>
      </div>
      <section className="card p-16 mb-24">
        <Heading level="h3" headingStyle="h5" className="mb-8">
          {t('exercizer.simple.edit.description')}
        </Heading>
        <RichTextEditor content={subject.description} mode="read" />
      </section>
      {(filesQuery.data ?? []).length > 0 && (
        <section className="card p-16">
          <Heading level="h3" headingStyle="h5" className="mb-8">
            {t('exercizer.corrected.homework')}
          </Heading>
          <ul className="list-unstyled d-flex flex-column gap-8 mb-0">
            {(filesQuery.data ?? []).map((file) => (
              <li key={file.doc_id}>
                <a href={`/workspace/document/${file.doc_id}`} target="_blank" rel="noreferrer">
                  {file.metadata?.filename ?? file.metadata?.name ?? file.doc_id}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default PreviewPerformCopy;
