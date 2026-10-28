import {
  Badge,
  Button,
  Checkbox,
  Card,
  EmptyScreen,
  Heading,
  SearchBar,
  SegmentedControl,
  Table,
} from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import { getCopiesAsTeacher, getSubjectsScheduledAsTeacher } from '../api';
import { RecipientsDialog } from '../components/RecipientsDialog';
import { matchesDueDateRange, matchesTitle } from '../copies';
import { DateRange, DateRangeFilter } from '../features/DateRangeFilter';
import { LoadError } from '../features/LoadError';
import {
  groupCopiesByScheduled,
  isFullyCorrected,
  lastCopyActivity,
  recipientsLabel,
  scheduledStateKey,
  submissionCount,
} from '../corrections';
import { SubjectScheduled } from '../types';
import { formatDate, formatDateTime } from '../utils';
import { CorrectionCopies } from './CorrectionCopies';

/** Vignettes ou tableau — la préférence est mémorisée d'une visite à l'autre. */
type DisplayMode = 'domino' | 'array';
const DISPLAY_KEY = 'exercizer.teacher.correction.displayList';

function storedDisplay(): DisplayMode {
  try {
    return window.localStorage.getItem(DISPLAY_KEY) === 'domino' ? 'domino' : 'array';
  } catch {
    return 'array';
  }
}

/** Filtre d'état des distributions : corrigées, non corrigées, ou les deux. */
type StateFilter = 'corrected' | 'notCorrected';

/**
 * « Mes corrections ».
 *
 * Deux niveaux, comme dans l'IHM AngularJS : la liste des sujets distribués, puis les copies de
 * celui qu'on a ouvert. Le second niveau est une ROUTE (`/dashboard/teacher/correction/:id`) et
 * non un état local : un lien vers une correction doit rester partageable, et le retour du
 * navigateur doit ramener à la liste.
 */
export function TeacherCorrections() {
  const { subjectScheduledId } = useParams();
  return subjectScheduledId ? (
    // La clé remonte l'écran quand on passe d'une distribution à l'autre : sélection, tri et
    // fenêtres ouvertes ne doivent pas suivre.
    <CorrectionCopies key={subjectScheduledId} subjectScheduledId={Number(subjectScheduledId)} />
  ) : (
    <ScheduledList />
  );
}

/** Premier niveau : les sujets distribués, avec leur avancement. */
function ScheduledList() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DateRange>({ begin: null, end: null });
  const [states, setStates] = useState<StateFilter[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [display, setDisplayState] = useState<DisplayMode>(storedDisplay);
  const [recipients, setRecipients] = useState<SubjectScheduled | null>(null);

  const setDisplay = (mode: DisplayMode) => {
    setDisplayState(mode);
    try {
      window.localStorage.setItem(DISPLAY_KEY, mode);
    } catch {
      // Stockage indisponible : la préférence vaut pour la session.
    }
  };

  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'teacher'],
    queryFn: getSubjectsScheduledAsTeacher,
  });
  const copiesQuery = useQuery({
    queryKey: ['exercizer', 'copies', 'teacher'],
    queryFn: getCopiesAsTeacher,
  });

  const copiesByScheduled = useMemo(
    () => groupCopiesByScheduled(copiesQuery.data ?? []),
    [copiesQuery.data],
  );

  /** Les groupes destinataires rencontrés, pour le filtre de la colonne de gauche. */
  const allGroups = useMemo(() => {
    const names = new Set<string>();
    for (const scheduled of scheduledQuery.data ?? []) {
      for (const group of scheduled.scheduled_at?.groupList ?? []) names.add(group.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [scheduledQuery.data]);

  const visible = useMemo(() => {
    return (scheduledQuery.data ?? [])
      .filter((scheduled) => {
        if (!matchesTitle(scheduled, search)) return false;
        if (!matchesDueDateRange(scheduled, range.begin, range.end)) return false;
        if (groups.length > 0) {
          const names = (scheduled.scheduled_at?.groupList ?? []).map((group) => group.name);
          if (!names.some((name) => groups.includes(name))) return false;
        }
        if (states.length > 0) {
          const corrected = isFullyCorrected(scheduled, copiesByScheduled.get(scheduled.id) ?? []);
          if (corrected && !states.includes('corrected')) return false;
          if (!corrected && !states.includes('notCorrected')) return false;
        }
        return true;
      })
      // Les distributions les plus récemment dues d'abord : c'est là que la correction attend.
      .sort((a, b) => new Date(b.due_date ?? 0).getTime() - new Date(a.due_date ?? 0).getTime());
  }, [scheduledQuery.data, search, range, groups, states, copiesByScheduled]);

  const toggleState = (state: StateFilter) =>
    setStates((current) =>
      current.includes(state) ? current.filter((s) => s !== state) : [...current, state],
    );

  if (scheduledQuery.isLoading || copiesQuery.isLoading) return null;
  if (scheduledQuery.isError || copiesQuery.isError) {
    return (
      <LoadError
        onRetry={() => {
          void scheduledQuery.refetch();
          void copiesQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="grid gap-24 mt-16">
      <aside className="g-col-12 g-col-lg-3">
        <Heading level="h2" headingStyle="h4" className="mb-8">
          {t('exercizer.group.filter')}
        </Heading>
        <div className="d-flex flex-column gap-4">
          {allGroups.map((group) => (
            <Checkbox
              key={group}
              label={group}
              checked={groups.includes(group)}
              onChange={() =>
                setGroups((current) =>
                  current.includes(group)
                    ? current.filter((g) => g !== group)
                    : [...current, group],
                )
              }
            />
          ))}
        </div>
      </aside>

      <section className="g-col-12 g-col-lg-9">
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-16 mb-16">
          <div className="d-flex gap-8">
            {(['corrected', 'notCorrected'] as const).map((state) => (
              <Button
                key={state}
                type="button"
                size="sm"
                color="secondary"
                variant={states.includes(state) ? 'filled' : 'outline'}
                aria-pressed={states.includes(state)}
                onClick={() => toggleState(state)}
              >
                {t(state === 'corrected' ? 'exercizer.all.corrected' : 'exercizer.all.not.corrected')}
              </Button>
            ))}
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
          <SegmentedControl
            options={[
              { label: t('exercizer.display.cards'), value: 'domino' },
              { label: t('exercizer.display.list'), value: 'array' },
            ]}
            value={display}
            onChange={(value) => setDisplay(value as DisplayMode)}
          />
        </div>

        <Heading level="h2" headingStyle="h4" className="mb-8">
          {t('exercizer.last.scheduled.subject')}
        </Heading>
        <SearchBar
          isVariant
          size="md"
          clearable
          placeholder={t('exercizer.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {visible.length === 0 ? (
          <EmptyScreen
            className="mt-16"
            imageSrc={illuExercizer}
            text={t(search ? 'exercizer.correction.search.empty' : 'exercizer.empty.corrections')}
            size={200}
          />
        ) : display === 'array' ? (
          <div className="table-responsive mt-16">
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('exercizer.subject.title')}</Table.Th>
                  <Table.Th>{t('exercizer.state')}</Table.Th>
                  <Table.Th>{t('exercizer.scheduled.subject.modified')}</Table.Th>
                  <Table.Th>{t('exercizer.scheduled.subject.end')}</Table.Th>
                  <Table.Th>{t('exercizer.scheduled.subject.to')}</Table.Th>
                  <Table.Th>{t('exercizer.scheduled.subject.count.made')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map((scheduled) => {
                  const copies = copiesByScheduled.get(scheduled.id) ?? [];
                  const { submitted, total } = submissionCount(copies);
                  const corrected = isFullyCorrected(scheduled, copies);
                  return (
                    <Table.Tr key={scheduled.id}>
                      <Table.Td>
                        <Button
                          color="tertiary"
                          variant="ghost"
                          onClick={() => navigate(`/dashboard/teacher/correction/${scheduled.id}`)}
                        >
                          {scheduled.title}
                        </Button>
                        <small className="text-muted d-block">
                          {scheduled.type === 'simple'
                            ? t('exercizer.simple.subject')
                            : t('exercizer.interactive.subject')}
                        </small>
                      </Table.Td>
                      <Table.Td>
                        <span className={corrected ? 'text-success' : 'text-warning'}>
                          {t(scheduledStateKey(scheduled, copies))}
                        </span>
                      </Table.Td>
                      <Table.Td>{formatDate(scheduled.modified)}</Table.Td>
                      <Table.Td>{formatDate(scheduled.due_date)}</Table.Td>
                      <Table.Td>
                        {recipientsLabel(scheduled, 1) && (
                          <Button
                            size="sm"
                            color="tertiary"
                            variant="ghost"
                            onClick={() => setRecipients(scheduled)}
                          >
                            {recipientsLabel(scheduled, 1)}
                          </Button>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {submitted} {t('exercizer.total.made')} {total}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </div>
        ) : (
          <div className="mt-16">
            {visible.map((scheduled) => {
              const copies = copiesByScheduled.get(scheduled.id) ?? [];
              const { submitted, total } = submissionCount(copies);
              const corrected = isFullyCorrected(scheduled, copies);
              const activity = lastCopyActivity(copies);
              return (
                <Card
                  key={scheduled.id}
                  className="mb-16"
                  isSelectable={false}
                  isClickable
                  onClick={() => navigate(`/dashboard/teacher/correction/${scheduled.id}`)}
                >
                  <Card.Body>
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
                        {t('exercizer.domino.due')}{' '}
                        {formatDateTime(scheduled.due_date, t('exercizer.at'))}
                      </Card.Text>
                      <Card.Text>
                        <strong>
                          {submitted} {t('exercizer.total.made')} {total}
                        </strong>
                      </Card.Text>
                    </div>
                    <div className="d-flex flex-column align-items-end gap-8 px-16">
                      <Badge
                        variant={{
                          type: 'content',
                          level: corrected ? 'success' : 'warning',
                          background: true,
                        }}
                      >
                        {t(scheduledStateKey(scheduled, copies))}
                      </Badge>
                      {recipientsLabel(scheduled) && (
                        <small className="text-muted">{recipientsLabel(scheduled)}</small>
                      )}
                    </div>
                  </Card.Body>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {recipients && (
        <RecipientsDialog scheduled={recipients} onClose={() => setRecipients(null)} />
      )}
    </div>
  );
}


export default TeacherCorrections;
