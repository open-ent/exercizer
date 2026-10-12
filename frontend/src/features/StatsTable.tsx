import { Badge, Button, Checkbox, Modal, Table } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getGrainCopiesByCopies, getGrainsScheduled, getGrainTypes } from '../api';
import { nextSort, sortBy, SortState } from '../corrections';
import { sanitizeScore } from '../grains';
import {
  buildStats,
  CsvLabels,
  displayScore,
  downloadCsv,
  fullCsv,
  scoreLevel,
  ScoreLevel,
  simpleCsv,
} from '../stats';
import { SubjectCopy, SubjectScheduled } from '../types';
import { SortHeader } from './SortHeader';

/** Colonnes de questions montrées à la fois — au-delà, on fait défiler par pages de six. */
const PAGE = 6;

const LEVEL: Record<ScoreLevel, 'success' | 'warning' | 'danger' | 'info'> = {
  full: 'success',
  partial: 'warning',
  none: 'danger',
  empty: 'info',
};

type Field = 'owner_username' | 'calculated_score' | 'final_score' | `q${number}`;

/**
 * Charge ce dont les statistiques ont besoin et en tire la matrice — partagé entre le tableau
 * et l'export, pour que les deux disent la même chose.
 */
export function useDistributionStats(scheduled: SubjectScheduled, copies: SubjectCopy[]) {
  const submittedIds = useMemo(
    () => copies.filter((copy) => copy.submitted_date).map((copy) => copy.id),
    [copies],
  );
  const referenceQuery = useQuery({
    queryKey: ['exercizer', 'grains-scheduled', scheduled.id],
    queryFn: () => getGrainsScheduled(scheduled.id),
    staleTime: Infinity,
  });
  const grainCopiesQuery = useQuery({
    queryKey: ['exercizer', 'grain-copies-by-copies', scheduled.id, submittedIds],
    queryFn: () => getGrainCopiesByCopies(submittedIds),
  });
  const stats = useMemo(
    () =>
      buildStats(copies, grainCopiesQuery.data ?? new Map(), referenceQuery.data ?? []),
    [copies, grainCopiesQuery.data, referenceQuery.data],
  );
  return {
    stats,
    grainCopies: grainCopiesQuery.data ?? new Map(),
    isLoading: referenceQuery.isLoading || grainCopiesQuery.isLoading,
  };
}

/**
 * La matrice « élève × question » d'une distribution — portage de la directive `stats`.
 *
 * L'ancienne IHM juxtaposait DEUX tableaux dont elle synchronisait le défilement à la main. Un
 * seul tableau suffit : les trois premières colonnes restent, et les questions défilent par
 * pages de six.
 */
export function StatsTable({
  scheduled,
  copies,
  filter = '',
}: {
  scheduled: SubjectScheduled;
  copies: SubjectCopy[];
  /** Restreint les lignes aux élèves dont le nom contient ce texte. */
  filter?: string;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { stats, isLoading } = useDistributionStats(scheduled, copies);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<SortState<Field>>({
    field: 'owner_username',
    direction: 'asc',
  });

  const { questions } = stats;
  const visible = questions.slice(offset, offset + PAGE);
  const max = scheduled.max_score ?? 0;

  const rows = useMemo(() => {
    const text = filter.trim().toLowerCase();
    const filtered = copies.filter((copy) =>
      text ? (copy.owner_username ?? '').toLowerCase().includes(text) : true,
    );
    return sortBy(
      filtered,
      (copy) => {
        if (sort.field === 'owner_username') return copy.owner_username;
        if (sort.field === 'calculated_score') return copy.calculated_score;
        if (sort.field === 'final_score') return copy.final_score;
        return stats.matrix.get(copy.id)?.get(Number(sort.field.slice(1)))?.score;
      },
      sort.direction,
    );
  }, [copies, filter, sort, stats]);

  if (isLoading) return null;

  const onSort = (field: Field) => setSort((current) => nextSort(current, field));

  return (
    <>
      <p className="small text-muted text-end mb-8">*{t('exercizer.schedule.stats.score')}</p>
      {questions.length > PAGE && (
        <div className="d-flex justify-content-end gap-8 mb-8">
          <Button
            size="sm"
            color="tertiary"
            variant="ghost"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE))}
          >
            {t('exercizer.stats.previous.questions')}
          </Button>
          <Button
            size="sm"
            color="tertiary"
            variant="ghost"
            disabled={offset + PAGE >= questions.length}
            onClick={() => setOffset(Math.min(questions.length - PAGE, offset + PAGE))}
          >
            {t('exercizer.stats.next.questions')}
          </Button>
        </div>
      )}
      <div className="table-responsive">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <SortHeader field="owner_username" sort={sort} onSort={onSort}>
                {t('exercizer.students')}
              </SortHeader>
              <SortHeader field="calculated_score" sort={sort} onSort={onSort}>
                {t('exercizer.auto.score2')}
              </SortHeader>
              <SortHeader field="final_score" sort={sort} onSort={onSort}>
                {t('exercizer.final.score')}
              </SortHeader>
              {visible.map((grain, index) => (
                <SortHeader key={grain.id} field={`q${grain.id}`} sort={sort} onSort={onSort}>
                  <span title={`${t('exercizer.question')} : ${grain.grain_data.title ?? ''}`}>
                    Q{offset + index + 1}
                  </span>
                </SortHeader>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((copy) => (
              <Table.Tr key={copy.id}>
                <Table.Td>{copy.owner_username}</Table.Td>
                <Table.Td>
                  {displayScore(copy.calculated_score)} / {max}
                </Table.Td>
                <Table.Td>
                  {displayScore(copy.final_score)} / {max}
                </Table.Td>
                {visible.map((grain) => {
                  const cell = stats.matrix.get(copy.id)?.get(grain.id);
                  const grainMax = sanitizeScore(grain.grain_data.max_score);
                  return (
                    <Table.Td key={grain.id}>
                      <Badge
                        variant={{
                          type: 'content',
                          level: LEVEL[scoreLevel(cell, grainMax)],
                          background: true,
                        }}
                      >
                        <span
                          title={
                            cell?.changed
                              ? `${t('exercizer.auto.score')} : ${displayScore(cell.calculated)} / ${grainMax}`
                              : undefined
                          }
                        >
                          {displayScore(cell?.score)} / {grainMax}
                          {cell?.changed ? '*' : ''}
                        </span>
                      </Badge>
                    </Table.Td>
                  );
                })}
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td>
                <strong>{t('exercizer.schedule.stats.average')}</strong>
              </Table.Td>
              <Table.Td>
                <strong>
                  {displayScore(stats.auto)} / {max}
                </strong>
              </Table.Td>
              <Table.Td>
                <strong>
                  {displayScore(stats.final)} / {max}
                </strong>
              </Table.Td>
              {visible.map((grain) => (
                <Table.Td key={grain.id}>
                  <strong>
                    {displayScore(stats.averages.get(grain.id))} /{' '}
                    {sanitizeScore(grain.grain_data.max_score)}
                  </strong>
                </Table.Td>
              ))}
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </div>
    </>
  );
}

/**
 * Choix de l'export — les scores, ou les réponses complètes. Le fichier est construit dans le
 * navigateur à partir des mêmes données que le tableau.
 */
export function ExportStatsDialog({
  scheduled,
  copies,
  onClose,
}: {
  scheduled: SubjectScheduled;
  copies: SubjectCopy[];
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [mode, setMode] = useState<'simple' | 'full'>('simple');
  const { stats, grainCopies, isLoading } = useDistributionStats(scheduled, copies);
  const typesQuery = useQuery({
    queryKey: ['exercizer', 'grain-types'],
    queryFn: getGrainTypes,
    staleTime: Infinity,
  });

  const run = () => {
    const labels: CsvLabels = {
      subjectTitle: t('exercizer.subject.title'),
      subjectType: t('exercizer.export.subject.type'),
      studentName: t('exercizer.export.student.name'),
      autoScore: t('exercizer.auto.score'),
      finalScore: t('exercizer.final.score'),
      comment: t('exercizer.export.subject.comment'),
      average: t('exercizer.schedule.stats.average'),
      interactive: t('exercizer.interactive'),
      questionType: t('exercizer.question.type'),
      noAnswer: t('exercizer.grain.noanswer'),
      grainTypeName: (grainTypeId) =>
        t((typesQuery.data ?? []).find((type) => type.id === grainTypeId)?.public_name ?? ''),
    };
    const csv =
      mode === 'simple'
        ? simpleCsv(scheduled, copies, stats, labels)
        : fullCsv(copies, grainCopies, stats, labels);
    downloadCsv(csv, `${scheduled.title}.csv`);
    onClose();
  };

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>{t('exercizer.export.lightbox.title')}</Modal.Header>
      <Modal.Body>
        <p>{t('exercizer.export.lightbox.question')}</p>
        <div className="d-flex flex-column gap-8">
          {/* Les deux libellés portent un `<em>` : ils viennent de l'i18n du module, pas d'une
              saisie d'usager. */}
          {(['simple', 'full'] as const).map((choice) => (
            <div key={choice} className="d-flex align-items-start gap-8">
              <Checkbox
                aria-label={t(`exercizer.export.lightbox.choice${choice === 'simple' ? 1 : 2}`).replace(/<[^>]*>/g, '')}
                checked={mode === choice}
                onChange={() => setMode(choice)}
              />
              <span
                dangerouslySetInnerHTML={{
                  __html: t(`exercizer.export.lightbox.choice${choice === 'simple' ? 1 : 2}`),
                }}
              />
            </div>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button color="primary" variant="filled" disabled={isLoading} onClick={run}>
          {t('exercizer.export.action')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default StatsTable;
