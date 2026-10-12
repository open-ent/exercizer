import {
  Badge,
  Button,
  Card,
  EmptyScreen,
  Heading,
  LoadingScreen,
  Table,
  useEdificeClient,
} from '@open-ent/react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  getCopiesAsStudent,
  getSubjectSequenceProgress,
  getSubjectSequenceScheduled,
  getSubjectsScheduledAsStudent,
  sequenceExportCsvUrl,
} from '../api';
import { canPerformAsStudent, canViewAsStudent, copyStateColorClass, copyStateKey } from '../copies';
import { displayScore } from '../stats';
import { SubjectCopy, SubjectScheduled } from '../types';

/** Un sujet du parcours est « fait » dès qu'il est rendu, corrigé ou non. */
const isDone = (copy: SubjectCopy | undefined): boolean =>
  !!copy && (!!copy.submitted_date || !!copy.is_corrected);

/** La part des sujets faits, en pourcentage entier. */
export function sequenceProgress(scheduledIds: number[], copies: SubjectCopy[]): number {
  if (scheduledIds.length === 0) return 0;
  const done = scheduledIds.filter((id) =>
    isDone(copies.find((copy) => copy.subject_scheduled_id === id)),
  ).length;
  return Math.round((done / scheduledIds.length) * 100);
}

function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      className="progress flex-fill"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar bg-success" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Un parcours distribué — portage de `SubjectSequenceScheduledController`.
 *
 * Le même écran sert à deux publics :
 *  - l'ÉLÈVE y navigue dans les sujets du parcours, chacun s'ouvrant par les écrans de passation
 *    et de consultation ordinaires — rien n'est dupliqué ;
 *  - l'ENSEIGNANT propriétaire y suit l'avancement de sa classe et l'exporte.
 *
 * La liste ordonnée vient des distributions déjà connues de l'élève, filtrées par parcours, et
 * non des « enfants » renvoyés avec l'en-tête : ces derniers ne portent ni l'option « un seul
 * envoi » ni le type du sujet, dont dépend ce que l'élève peut ouvrir.
 */
export function SubjectSequenceScheduledScreen() {
  const { subjectSequenceScheduledId: param } = useParams();
  const id = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const { user } = useEdificeClient();

  const detailQuery = useQuery({
    queryKey: ['exercizer', 'sequence-scheduled', id],
    queryFn: () => getSubjectSequenceScheduled(id),
  });
  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'student'],
    queryFn: getSubjectsScheduledAsStudent,
  });
  const copiesQuery = useQuery({ queryKey: ['exercizer', 'copies'], queryFn: getCopiesAsStudent });

  const header = detailQuery.data?.header;
  const isOwner = !!header && !!user?.userId && header.owner === user.userId;

  // Le suivi de la classe est réservé au propriétaire : un élève n'a pas à voir ses camarades.
  const progressQuery = useQuery({
    queryKey: ['exercizer', 'sequence-progress', id],
    queryFn: () => getSubjectSequenceProgress(id),
    enabled: isOwner,
  });

  const items = useMemo(
    () =>
      (scheduledQuery.data ?? [])
        .filter((scheduled) => Number(scheduled.subject_sequence_scheduled_id) === id)
        .sort((a, b) => (a.sequence_order_by || 0) - (b.sequence_order_by || 0)),
    [scheduledQuery.data, id],
  );
  const copies = copiesQuery.data ?? [];
  const copyOf = (scheduled: SubjectScheduled) =>
    copies.find((copy) => copy.subject_scheduled_id === scheduled.id);

  if (detailQuery.isLoading || scheduledQuery.isLoading || copiesQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }
  if (!header) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.error')} size={200} />
        <Button color="primary" variant="filled" onClick={() => navigate('/dashboard')}>
          {t('exercizer.title')}
        </Button>
      </div>
    );
  }

  /** Où mène un sujet du parcours, ou `null` s'il n'est pas ouvrable pour l'instant. */
  const target = (scheduled: SubjectScheduled): string | null => {
    const copy = copyOf(scheduled);
    if (!copy) return null;
    if (scheduled.type === 'simple') return `/subject/copy/perform/simple/${copy.id}/`;
    if (canPerformAsStudent(scheduled, copy)) return `/subject/copy/perform/${copy.id}/`;
    if (canViewAsStudent(scheduled, copy)) return `/subject/copy/view/${copy.id}/`;
    return null;
  };

  const percent = sequenceProgress(
    items.map((item) => item.id),
    copies,
  );
  const done = items.filter((item) => isDone(copyOf(item))).length;
  const children = [...(detailQuery.data?.children ?? [])].sort(
    (a, b) => (a.sequenceOrderBy || 0) - (b.sequenceOrderBy || 0),
  );

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {header.title}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          {isOwner && (
            <Button
              color="primary"
              variant="outline"
              onClick={() => window.open(sequenceExportCsvUrl(id), '_blank')}
            >
              {t('exercizer.sequence.export.csv')}
            </Button>
          )}
          {/* `/dashboard` générique : la route décide de la vue selon le droit de création. */}
          <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard')}>
            {t('exercizer.back.subject')}
          </Button>
        </div>
      </div>

      {header.description && <p className="mb-16">{header.description}</p>}

      {items.length > 0 && (
        <section className="mb-24">
          <div className="d-flex align-items-center gap-16">
            <ProgressBar percent={percent} label={t('exercizer.sequence.scheduled.progress')} />
            <strong>{percent}%</strong>
          </div>
          <p className="mt-4 mb-0">
            {t('exercizer.sequence.scheduled.progress')} {done} / {items.length}
          </p>
        </section>
      )}

      {isOwner && progressQuery.data && (
        <section className="mb-24">
          <Heading level="h3" headingStyle="h5" className="mb-16">
            {t('exercizer.sequence.tracking.title')}
          </Heading>
          <div className="table-responsive">
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('exercizer.sequence.tracking.student')}</Table.Th>
                  <Table.Th>{t('exercizer.sequence.tracking.submitted')}</Table.Th>
                  <Table.Th>{t('exercizer.sequence.tracking.corrected')}</Table.Th>
                  <Table.Th>{t('exercizer.sequence.tracking.rate')}</Table.Th>
                  <Table.Th>{t('exercizer.sequence.tracking.score')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {progressQuery.data.students.map((student) => (
                  <Table.Tr key={student.studentId}>
                    <Table.Td>{student.studentName}</Table.Td>
                    <Table.Td>
                      {student.submittedItems} / {student.totalItems}
                    </Table.Td>
                    <Table.Td>
                      {student.correctedItems} / {student.totalItems}
                    </Table.Td>
                    <Table.Td>{Math.round(student.completionRate * 100)}%</Table.Td>
                    <Table.Td>
                      {student.averageScore ? displayScore(student.averageScore) : '-'}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        </section>
      )}

      {items.length > 0 ? (
        <ol className="list-unstyled d-flex flex-column gap-8 mb-0">
          {items.map((item, index) => {
            const copy = copyOf(item);
            const stateKey = copy ? copyStateKey(copy) : null;
            const to = target(item);
            return (
              <li key={item.id}>
                <Card
                  isSelectable={false}
                  isClickable={!!to}
                  onClick={to ? () => navigate(to) : undefined}
                >
                  <Card.Body>
                    <Badge
                      variant={{ type: 'content', level: 'info', background: true }}
                      className={(copy && copyStateColorClass(copy)) ?? undefined}
                    >
                      {index + 1}
                    </Badge>
                    <div className="d-flex flex-column gap-4 flex-fill">
                      <Card.Title>{item.title}</Card.Title>
                      {stateKey && <Card.Text className="text-muted">{t(stateKey)}</Card.Text>}
                    </div>
                  </Card.Body>
                </Card>
              </li>
            );
          })}
        </ol>
      ) : (
        // L'enseignant n'a pas de copie : il voit la composition du parcours, sans rien à ouvrir.
        <ol className="d-flex flex-column gap-4 mb-0">
          {children.map((child) => (
            <li key={child.id}>{child.title}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Bandeau « Parcours » du tableau de bord de l'élève — portage de
 * `studentDashboardSubjectSequenceBanner`. N'affiche rien tant que l'élève n'a aucun parcours.
 */
export function SubjectSequenceBanner({
  scheduled,
  copies,
}: {
  scheduled: SubjectScheduled[];
  copies: SubjectCopy[];
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  /** parcours distribué → ses sujets distribués. */
  const bySequence = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const item of scheduled) {
      const sequenceId = Number(item.subject_sequence_scheduled_id);
      if (!sequenceId) continue;
      map.set(sequenceId, [...(map.get(sequenceId) ?? []), item.id]);
    }
    return map;
  }, [scheduled]);
  const ids = useMemo(() => [...bySequence.keys()], [bySequence]);

  // Seul le TITRE du parcours manque aux distributions de l'élève : une requête par parcours.
  const details = useQueries({
    queries: ids.map((sequenceId) => ({
      queryKey: ['exercizer', 'sequence-scheduled', sequenceId],
      queryFn: () => getSubjectSequenceScheduled(sequenceId),
      staleTime: 60_000,
    })),
  });

  const sequences = ids
    .map((sequenceId, index) => ({
      id: sequenceId,
      title: details[index]?.data?.header.title,
      percent: sequenceProgress(bySequence.get(sequenceId) ?? [], copies),
    }))
    .filter((sequence) => sequence.title);
  if (sequences.length === 0) return null;

  return (
    <section className="mb-24">
      <Heading level="h2" headingStyle="h4" className="mb-16">
        {t('exercizer.sequence.dashboard.title')}
      </Heading>
      <div className="grid gap-16">
        {sequences.map((sequence) => (
          <Card
            key={sequence.id}
            className="g-col-12 g-col-md-6 g-col-xl-4"
            isSelectable={false}
            isClickable
            onClick={() => navigate(`/subject-sequence-scheduled/${sequence.id}/`)}
          >
            <Card.Body>
              <div className="d-flex flex-column gap-8 flex-fill">
                <Card.Title>{sequence.title}</Card.Title>
                <div className="d-flex align-items-center gap-8">
                  <ProgressBar
                    percent={sequence.percent}
                    label={t('exercizer.sequence.scheduled.progress')}
                  />
                  <small>{sequence.percent}%</small>
                </div>
              </div>
            </Card.Body>
          </Card>
        ))}
      </div>
    </section>
  );
}

export default SubjectSequenceScheduledScreen;
