import {
  ActionBar,
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyScreen,
  Heading,
  LoadingScreen,
  SearchBar,
  Table,
} from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  archiveExportCsvUrl,
  getArchivedCopies,
  getArchivedSubjectsScheduled,
  getGrainCopies,
  getGrainsScheduled,
  simpleCopiesZipUrl,
} from '../api';
import { RecipientsDialog } from '../components/RecipientsDialog';
import { matchesDueDateRange, matchesTitle } from '../copies';
import { automaticCorrection, AutomaticCorrection } from '../correction';
import {
  lastCopyActivity,
  nextSort,
  recipientsLabel,
  sortBy,
  SortState,
  submittedLate,
} from '../corrections';
import { GrainCopyReview } from '../features/copies/GrainCopyReview';
import { DateRange, DateRangeFilter } from '../features/DateRangeFilter';
import { SortHeader } from '../features/SortHeader';
import { ExportStatsDialog, StatsTable } from '../features/StatsTable';
import { displayScore } from '../stats';
import { SubjectCopy, SubjectScheduled } from '../types';
import { formatDate, formatDateTime } from '../utils';
import { CopySummary } from './ViewCopy';

const monthsFromNow = (months: number): Date => {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
};

/** Les distributions archivées de l'enseignant — une requête, partagée par les trois niveaux. */
const useArchivedScheduled = () =>
  useQuery({
    queryKey: ['exercizer', 'archive', 'scheduled'],
    queryFn: getArchivedSubjectsScheduled,
  });

/**
 * Les copies de TOUTES les distributions archivées, en un appel — c'est ce que faisait
 * `ArchivesService`, et la liste en a besoin pour afficher la dernière activité de chacune.
 */
const useArchivedCopies = (scheduled: SubjectScheduled[] | undefined) => {
  const ids = useMemo(() => (scheduled ?? []).map((item) => item.id), [scheduled]);
  return useQuery({
    queryKey: ['exercizer', 'archive', 'copies', ids],
    queryFn: () => getArchivedCopies(ids),
    enabled: ids.length > 0,
  });
};

/**
 * Archives des programmations — portage de `TeacherDashboardArchiveController`, des directives
 * `dashboardArchives` et `dashboardArchivesCopyList`, et d'`ArchiveViewSubjectCopyController`.
 *
 * Trois niveaux, chacun sur sa ROUTE : les distributions archivées, les copies de l'une d'elles,
 * puis une copie. L'ancienne IHM gardait la copie ouverte dans un service en mémoire : recharger
 * la page ramenait à la liste. Ici la copie est retrouvée par son identifiant, et le lien tient.
 *
 * Une archive se CONSULTE : rien n'y est modifiable, ni les dates, ni les notes.
 */
export function Archives() {
  const { subjectScheduledId, subjectCopyId } = useParams();
  if (subjectScheduledId && subjectCopyId) {
    return (
      <ArchivedCopy
        subjectScheduledId={Number(subjectScheduledId)}
        subjectCopyId={Number(subjectCopyId)}
      />
    );
  }
  if (subjectScheduledId) {
    return (
      <ArchivedCopies key={subjectScheduledId} subjectScheduledId={Number(subjectScheduledId)} />
    );
  }
  return <ArchivedList />;
}

/** Fil d'Ariane des trois niveaux. */
function Trail({ scheduled, owner }: { scheduled?: SubjectScheduled; owner?: string }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  return (
    <div className="d-flex flex-wrap align-items-center gap-8 mb-16">
      <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard/teacher')}>
        {t('exercizer.title')}
      </Button>
      <span aria-hidden="true">/</span>
      <Button
        color="tertiary"
        variant="ghost"
        onClick={() => navigate('/dashboard/teacher/archive')}
      >
        {t('exercizer.archive')}
      </Button>
      {scheduled && (
        <>
          <span aria-hidden="true">/</span>
          {owner ? (
            <Button
              color="tertiary"
              variant="ghost"
              onClick={() => navigate(`/dashboard/teacher/archive/${scheduled.id}`)}
            >
              {scheduled.title}
            </Button>
          ) : (
            <Heading level="h2" headingStyle="h5" className="m-0">
              {scheduled.title}
            </Heading>
          )}
        </>
      )}
      {owner && (
        <>
          <span aria-hidden="true">/</span>
          <Heading level="h2" headingStyle="h5" className="m-0">
            {owner}
          </Heading>
        </>
      )}
    </div>
  );
}

/** Premier niveau : les distributions archivées. */
function ArchivedList() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  // Trois mois de part et d'autre d'aujourd'hui : la fenêtre par défaut de l'ancienne IHM.
  const [range, setRange] = useState<DateRange>({
    begin: monthsFromNow(-3),
    end: monthsFromNow(3),
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [recipients, setRecipients] = useState<SubjectScheduled | null>(null);

  const scheduledQuery = useArchivedScheduled();
  const copiesQuery = useArchivedCopies(scheduledQuery.data);

  const copiesByScheduled = useMemo(() => {
    const map = new Map<number, SubjectCopy[]>();
    for (const copy of copiesQuery.data ?? []) {
      const list = map.get(copy.subject_scheduled_id);
      if (list) list.push(copy);
      else map.set(copy.subject_scheduled_id, [copy]);
    }
    return map;
  }, [copiesQuery.data]);

  const visible = useMemo(
    () =>
      (scheduledQuery.data ?? [])
        .filter(
          (scheduled) =>
            matchesTitle(scheduled, search) &&
            matchesDueDateRange(scheduled, range.begin, range.end),
        )
        .sort((a, b) => new Date(b.due_date ?? 0).getTime() - new Date(a.due_date ?? 0).getTime()),
    [scheduledQuery.data, search, range],
  );

  if (scheduledQuery.isLoading) return <LoadingScreen position={false} />;

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  const at = t('exercizer.at');

  return (
    <div className="mt-16">
      <Trail />

      <div className="d-flex flex-wrap align-items-end justify-content-between gap-16 mb-16">
        <div className="flex-fill" style={{ maxWidth: 420 }}>
          <SearchBar
            isVariant
            size="md"
            clearable
            placeholder={t('exercizer.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {visible.length === 0 ? (
        <EmptyScreen
          imageSrc={illuExercizer}
          text={t(search ? 'exercizer.correction.search.empty' : 'exercizer.archive.empty')}
          size={200}
        />
      ) : (
        visible.map((scheduled) => {
          const activity = lastCopyActivity(copiesByScheduled.get(scheduled.id) ?? []);
          const corrected = scheduled.corrected_date != null;
          return (
            <Card
              key={scheduled.id}
              className="mb-16"
              isSelectable={false}
              isSelected={selected.includes(scheduled.id)}
              isClickable
              onClick={() => navigate(`/dashboard/teacher/archive/${scheduled.id}`)}
            >
              <Card.Body>
                {/* L'export CSV ne porte que sur les sujets interactifs : un sujet « simple »
                    n'a pas de score à exporter. */}
                {scheduled.type !== 'simple' && (
                  <div className="position-relative z-2" onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={scheduled.title}
                      checked={selected.includes(scheduled.id)}
                      onChange={() => toggle(scheduled.id)}
                    />
                  </div>
                )}
                <Card.Image imageSrc={scheduled.picture || illuExercizer} variant="small" />
                <div className="d-flex flex-column gap-4 flex-fill">
                  <Card.Title>{scheduled.title}</Card.Title>
                  <Card.Text className="text-muted">
                    {scheduled.type === 'simple'
                      ? t('exercizer.simple.subject')
                      : t('exercizer.interactive.subject')}
                  </Card.Text>
                  {activity && (
                    <Card.Text className="text-muted">
                      {t('exercizer.domino.modified')} {formatDate(activity)}
                    </Card.Text>
                  )}
                  <Card.Text>
                    {t('exercizer.domino.due')} {formatDateTime(scheduled.due_date, at)}
                  </Card.Text>
                  <Card.Text>
                    <strong>
                      {scheduled.corrected_copy ?? 0} {t('exercizer.total.made')}{' '}
                      {scheduled.total_copy ?? 0} {t('exercizer.total.made2')}
                    </strong>
                  </Card.Text>
                  <Card.Text className={corrected ? 'text-success' : 'text-warning'}>
                    {t(corrected ? 'exercizer.domino.corrected' : 'exercizer.domino.notcorrected')}
                  </Card.Text>
                </div>
                {recipientsLabel(scheduled, 1) && (
                  <div className="position-relative z-2 px-16" onClick={(event) => event.stopPropagation()}>
                    <Button
                      size="sm"
                      color="tertiary"
                      variant="ghost"
                      onClick={() => setRecipients(scheduled)}
                    >
                      {recipientsLabel(scheduled, 1)}
                    </Button>
                  </div>
                )}
              </Card.Body>
            </Card>
          );
        })
      )}

      {selected.length > 0 && (
        <ActionBar>
          <Button
            color="primary"
            variant="filled"
            onClick={() => {
              window.location.href = archiveExportCsvUrl(selected);
            }}
          >
            {t('exercizer.export')}
          </Button>
        </ActionBar>
      )}

      {recipients && (
        <RecipientsDialog scheduled={recipients} onClose={() => setRecipients(null)} />
      )}
    </div>
  );
}

type Field = 'owner_username' | 'submitted_date' | 'calculated_score' | 'final_score' | 'homework' | 'corrected';

/** Deuxième niveau : les copies d'une distribution archivée. */
function ArchivedCopies({ subjectScheduledId }: { subjectScheduledId: number }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  const [showStats, setShowStats] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<Field>>({
    field: 'owner_username',
    direction: 'asc',
  });

  const scheduledQuery = useArchivedScheduled();
  const copiesQuery = useArchivedCopies(scheduledQuery.data);

  const scheduled = (scheduledQuery.data ?? []).find((item) => item.id === subjectScheduledId);
  const copies = useMemo(
    () =>
      (copiesQuery.data ?? []).filter((copy) => copy.subject_scheduled_id === subjectScheduledId),
    [copiesQuery.data, subjectScheduledId],
  );

  const rows = useMemo(
    () =>
      sortBy(
        copies,
        (copy) => {
          switch (sort.field) {
            case 'submitted_date':
              return copy.submitted_date ? new Date(copy.submitted_date).getTime() : null;
            case 'calculated_score':
              return copy.calculated_score;
            case 'final_score':
              return copy.final_score;
            case 'homework':
              return copy.homework_metadata?.filename;
            case 'corrected':
              return copy.corrected_metadata?.filename;
            default:
              return copy.owner_username;
          }
        },
        sort.direction,
      ),
    [copies, sort],
  );

  if (scheduledQuery.isLoading || copiesQuery.isLoading) return <LoadingScreen position={false} />;
  if (!scheduled) {
    return (
      <div className="mt-16">
        <Trail />
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.archive.empty')} size={200} />
      </div>
    );
  }

  const isSimple = scheduled.type === 'simple';
  const at = t('exercizer.at');
  const submitted = copies.filter((copy) => copy.submitted_date).length;
  const onSort = (field: Field) => setSort((current) => nextSort(current, field));
  const submittedIds = copies.filter((copy) => copy.submitted_date).map((copy) => copy.id);
  const allSelected = submittedIds.length > 0 && submittedIds.every((id) => selected.includes(id));

  const submittedCell = (copy: SubjectCopy) => {
    if (!copy.submitted_date) return <span className="text-muted">—</span>;
    return submittedLate(scheduled, copy) ? (
      <span className="text-danger">
        {t('exercizer.lag')} {formatDateTime(copy.submitted_date, at)}
      </span>
    ) : (
      <span className="text-success">{formatDateTime(copy.submitted_date, at)}</span>
    );
  };

  return (
    <div className="mt-16">
      <Trail scheduled={scheduled} />

      {warning && (
        <Alert type="warning" isDismissible onClose={() => setWarning(null)} className="mb-16">
          {warning}
        </Alert>
      )}

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <div className="d-flex flex-column gap-4">
          <strong>{recipientsLabel(scheduled, 10)}</strong>
          <span>
            {t('exercizer.started')} {formatDate(scheduled.begin_date)}, {t('exercizer.ended')}{' '}
            {formatDate(scheduled.due_date)}
          </span>
          <span>
            {submitted} {t('exercizer.total.made')} {copies.length} {t('exercizer.total.made2')}
          </span>
          {isSimple && scheduled.corrected_metadata?.filename && (
            <span>
              {t('exercizer.corrected.homework')} : {scheduled.corrected_metadata.filename}
            </span>
          )}
        </div>
        {!isSimple && (
          <div className="d-flex gap-8">
            {showStats ? (
              <>
                <Button color="tertiary" variant="ghost" onClick={() => setShowStats(false)}>
                  {t('exercizer.back')}
                </Button>
                <Button color="primary" variant="outline" onClick={() => setExporting(true)}>
                  {t('exercizer.export.action')}
                </Button>
              </>
            ) : (
              <Button color="primary" variant="outline" onClick={() => setShowStats(true)}>
                {t('exercizer.schedule.stats.more')}
              </Button>
            )}
          </div>
        )}
      </div>

      {showStats && !isSimple ? (
        <StatsTable scheduled={scheduled} copies={copies} />
      ) : (
        <div className="table-responsive">
          <Table>
            <Table.Thead>
              <Table.Tr>
                {isSimple && (
                  <Table.Th>
                    <Checkbox
                      aria-label={t('exercizer.select.all')}
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : submittedIds)}
                    />
                  </Table.Th>
                )}
                <SortHeader field="owner_username" sort={sort} onSort={onSort}>
                  {t(isSimple ? 'exercizer.homework.from' : 'exercizer.copy.from')}
                </SortHeader>
                <SortHeader field="submitted_date" sort={sort} onSort={onSort}>
                  {t('exercizer.submitted.date')}
                </SortHeader>
                {isSimple ? (
                  <>
                    <SortHeader field="homework" sort={sort} onSort={onSort}>
                      {t('exercizer.file')}
                    </SortHeader>
                    <SortHeader field="corrected" sort={sort} onSort={onSort}>
                      {t('exercizer.simple.individual.corrected')}
                    </SortHeader>
                  </>
                ) : (
                  <>
                    <SortHeader field="calculated_score" sort={sort} onSort={onSort}>
                      {t('exercizer.auto.score')}
                    </SortHeader>
                    <SortHeader field="final_score" sort={sort} onSort={onSort}>
                      {t('exercizer.final.score')}
                    </SortHeader>
                  </>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((copy) => (
                <Table.Tr key={copy.id}>
                  {isSimple && (
                    <Table.Td>
                      <Checkbox
                        aria-label={copy.owner_username ?? String(copy.id)}
                        checked={selected.includes(copy.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(copy.id)
                              ? current.filter((id) => id !== copy.id)
                              : [...current, copy.id],
                          )
                        }
                      />
                    </Table.Td>
                  )}
                  <Table.Td>
                    {!isSimple && copy.submitted_date ? (
                      <Button
                        color="tertiary"
                        variant="ghost"
                        onClick={() =>
                          navigate(`/dashboard/teacher/archive/${scheduled.id}/${copy.id}`)
                        }
                      >
                        {copy.owner_username}
                      </Button>
                    ) : (
                      <span>{copy.owner_username}</span>
                    )}
                  </Table.Td>
                  <Table.Td>{submittedCell(copy)}</Table.Td>
                  {isSimple ? (
                    <>
                      <Table.Td>
                        {copy.submitted_date && (
                          <a
                            href={simpleCopiesZipUrl([copy.id])}
                            title={t('exercizer.file.download')}
                          >
                            {copy.homework_metadata?.filename ?? t('exercizer.file.download')}
                          </a>
                        )}
                      </Table.Td>
                      <Table.Td>{copy.corrected_metadata?.filename}</Table.Td>
                    </>
                  ) : (
                    <>
                      <Table.Td>
                        {displayScore(copy.calculated_score)} / {scheduled.max_score ?? 0}
                      </Table.Td>
                      <Table.Td>
                        {displayScore(copy.final_score)} / {scheduled.max_score ?? 0}
                      </Table.Td>
                    </>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {isSimple && selected.length > 0 && (
        <ActionBar>
          <Button
            color="primary"
            variant="filled"
            onClick={() => {
              const ids = selected.filter((id) => submittedIds.includes(id));
              if (ids.length === 0) {
                setWarning(t('exercizer.service.check.download.copy'));
                return;
              }
              window.location.href = simpleCopiesZipUrl(ids);
            }}
          >
            {t('exercizer.downloads')}
          </Button>
        </ActionBar>
      )}

      {exporting && (
        <ExportStatsDialog
          scheduled={scheduled}
          copies={copies}
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  );
}

/** Troisième niveau : une copie archivée, en lecture seule. */
function ArchivedCopy({
  subjectScheduledId,
  subjectCopyId,
}: {
  subjectScheduledId: number;
  subjectCopyId: number;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  const scheduledQuery = useArchivedScheduled();
  const copiesQuery = useArchivedCopies(scheduledQuery.data);

  const scheduled = (scheduledQuery.data ?? []).find((item) => item.id === subjectScheduledId);
  const copy = (copiesQuery.data ?? []).find((item) => item.id === subjectCopyId);

  const grainsQuery = useQuery({
    queryKey: ['exercizer', 'grain-copies', subjectCopyId],
    queryFn: () => getGrainCopies(copy!),
    enabled: !!copy,
  });
  const referenceQuery = useQuery({
    queryKey: ['exercizer', 'grains-scheduled', subjectScheduledId],
    queryFn: () => getGrainsScheduled(subjectScheduledId),
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

  if (scheduledQuery.isLoading || copiesQuery.isLoading) return <LoadingScreen position={false} />;
  if (!scheduled || !copy) {
    return (
      <div className="mt-16">
        <Trail scheduled={scheduled} />
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.archive.empty')} size={200} />
      </div>
    );
  }
  if (grainsQuery.isLoading || referenceQuery.isLoading) return <LoadingScreen position={false} />;

  return (
    <div className="mt-16">
      <Trail scheduled={scheduled} owner={copy.owner_username ?? ''} />

      <CopySummary
        copy={copy}
        scheduled={scheduled}
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
            // Lecture seule : une archive ne se note plus. Le corrigé, lui, reste consultable.
            mode="student"
            alwaysShowCorrection
          />
        ))}
      </div>

      <div className="d-flex justify-content-end mt-24">
        <Button
          color="primary"
          variant="outline"
          onClick={() => navigate(`/dashboard/teacher/archive/${scheduled.id}`)}
        >
          {t('exercizer.back')}
        </Button>
      </div>
    </div>
  );
}

export default Archives;
