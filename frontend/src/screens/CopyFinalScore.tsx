import { Button, EmptyScreen, Heading, LoadingScreen, Table } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  getCopiesAsStudent,
  getGrainCopies,
  getGrainsScheduled,
  getSubjectsScheduledAsStudent,
} from '../api';
import { automaticCorrection, formatScore, totalCalculatedScore } from '../correction';
import { copyQuestionNumber, isQuestion } from '../grains';

/**
 * Score d'une copie d'ENTRAÎNEMENT — portage de `SubjectCopyFinalScoreController`.
 *
 * Une copie d'entraînement n'est pas corrigée par l'enseignant : l'élève la fait pour lui-même,
 * et ce qu'il veut savoir en la rendant, c'est son score. D'où cet écran, plus court que la
 * consultation d'une copie notée : question par question, le score automatique, et le total.
 *
 * L'ancienne IHM n'y donnait accès que pour une copie d'entraînement rendue et non reprise ;
 * on garde la même condition, sans quoi l'écran afficherait un score qui ne veut rien dire.
 */
export function CopyFinalScore() {
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

  const grainCopies = grainsQuery.data ?? [];
  const reference = referenceQuery.data ?? [];

  const rows = useMemo(
    () =>
      grainCopies
        .filter((grainCopy) => isQuestion(grainCopy.grain_type_id))
        .map((grainCopy) => {
          const model = reference.find((item) => item.id === grainCopy.grain_scheduled_id);
          const correction = automaticCorrection(
            grainCopy.grain_type_id,
            grainCopy.grain_copy_data.max_score ?? 0,
            model?.grain_data.custom_data,
            grainCopy.grain_copy_data.custom_copy_data,
          );
          return {
            id: grainCopy.id,
            number: copyQuestionNumber(grainCopy, grainCopies),
            title: grainCopy.grain_copy_data.title ?? '',
            maxScore: grainCopy.grain_copy_data.max_score ?? 0,
            // Le score enregistré prime : il a pu être calculé lors d'une consultation antérieure.
            score: grainCopy.calculated_score ?? correction.calculated_score,
          };
        }),
    [grainCopies, reference],
  );

  if (copiesQuery.isLoading || scheduledQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }

  // Même condition que l'ancienne IHM : copie d'entraînement, rendue, et pas reprise depuis.
  const readable =
    !!copy && !!scheduled && copy.is_training_copy && !copy.has_been_started && !!copy.submitted_date;

  if (!readable) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen
          imageSrc={illuExercizer}
          text={t('exercizer.copy.no.score.yet')}
          size={200}
        />
        <Button
          color="primary"
          variant="filled"
          onClick={() => navigate('/dashboard/student?tab=training')}
        >
          {t('exercizer.dashboard.learner.tab3')}
        </Button>
      </div>
    );
  }

  if (grainsQuery.isLoading || referenceQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }

  const total = totalCalculatedScore(rows.map((row) => row.score));

  return (
    <div className="mt-16">
      <Heading level="h2" headingStyle="h4" className="mb-8">
        {t('exercizer.copy.final.score')}
      </Heading>
      <p className="mb-16">{scheduled.title}</p>

      <p className="fs-5 mb-24">
        <strong>{formatScore(total)}</strong> {t('exercizer.on')} {scheduled.max_score ?? 0}{' '}
        {t('exercizer.score')}
      </p>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('exercizer.subject.title')}</Table.Th>
            <Table.Th>{t('exercizer.auto.score')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.id}>
              <Table.Td>
                {row.number}) {row.title}
              </Table.Td>
              <Table.Td>
                {formatScore(row.score)} {t('exercizer.on')} {row.maxScore}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <div className="d-flex justify-content-end gap-16 mt-24">
        <Button
          color="primary"
          variant="outline"
          onClick={() => navigate('/dashboard/student?tab=training')}
        >
          {t('exercizer.dashboard.learner.tab3')}
        </Button>
      </div>
    </div>
  );
}

export default CopyFinalScore;
