import {
  ActionBar,
  Badge,
  Button,
  Checkbox,
  Card,
  EmptyScreen,
  Heading,
  SearchBar,
  Table,
} from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  excludeCopies,
  getCopiesAsTeacher,
  getSubjectsScheduledAsTeacher,
  remindCopiesAutomatically,
  unscheduleSubject,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { copyStateColorClass, copyStateKey, matchesDueDateRange, matchesTitle } from '../copies';
import { DateRange, DateRangeFilter } from '../features/DateRangeFilter';
import {
  groupCopiesByScheduled,
  isFullyCorrected,
  lastCopyActivity,
  notCorrectedCount,
  recipientsLabel,
  scheduledStateKey,
  submissionCount,
} from '../corrections';
import { SubjectCopy, SubjectScheduled } from '../types';
import { formatDate, formatDateTime } from '../utils';

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
    <CopyList subjectScheduledId={Number(subjectScheduledId)} />
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
    </div>
  );
}

type CopyDialog = { kind: 'exclude' } | { kind: 'unschedule' } | null;

/** Second niveau : les copies d'une distribution. */
function CopyList({ subjectScheduledId }: { subjectScheduledId: number }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<number[]>([]);
  const [dialog, setDialog] = useState<CopyDialog>(null);

  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'teacher'],
    queryFn: getSubjectsScheduledAsTeacher,
  });
  const copiesQuery = useQuery({
    queryKey: ['exercizer', 'copies', 'teacher'],
    queryFn: getCopiesAsTeacher,
  });

  const scheduled = (scheduledQuery.data ?? []).find((s) => s.id === subjectScheduledId);
  const copies = useMemo(
    () =>
      (copiesQuery.data ?? [])
        .filter((copy) => copy.subject_scheduled_id === subjectScheduledId && !copy.is_training_copy)
        .sort((a, b) => (a.owner_username ?? '').localeCompare(b.owner_username ?? '', 'fr')),
    [copiesQuery.data, subjectScheduledId],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'copies', 'teacher'] });
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'scheduled', 'teacher'] });
    setSelected([]);
    setDialog(null);
  };

  const remind = useMutation({
    mutationFn: () => remindCopiesAutomatically(selected, subjectScheduledId),
    onSuccess: refresh,
  });
  const exclude = useMutation({ mutationFn: () => excludeCopies(selected), onSuccess: refresh });
  const unschedule = useMutation({
    mutationFn: () => unscheduleSubject(subjectScheduledId),
    onSuccess: () => {
      refresh();
      navigate('/dashboard/teacher/correction');
    },
  });

  if (scheduledQuery.isLoading || copiesQuery.isLoading) return null;
  if (!scheduled) {
    return (
      <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.empty.corrections')} size={200} />
    );
  }

  const remaining = notCorrectedCount(copies);
  const { submitted, total } = submissionCount(copies);
  const at = t('exercizer.at');

  const toggle = (id: number) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  return (
    <div className="mt-16">
      {/* Retour à la liste : la route porte la distribution ouverte, le bouton n'a donc qu'à
          remonter d'un cran — le retour du navigateur fait la même chose. */}
      <div className="d-flex align-items-center gap-8">
        <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard/teacher/correction')}>
          {t('exercizer.dashboard.instructer.tab2')}
        </Button>
        <Heading level="h2" headingStyle="h4" className="m-0">
          {scheduled.title}
        </Heading>
      </div>

      <div className="d-flex flex-wrap gap-16 justify-content-between align-items-center my-16">
        <div className="d-flex flex-column gap-4">
          <span>
            {t('exercizer.scheduled.start')} {formatDateTime(scheduled.begin_date, at)}
          </span>
          <span>
            {t('exercizer.scheduled.end')} {formatDateTime(scheduled.due_date, at)}
          </span>
          <span>
            <strong>
              {submitted} {t('exercizer.total.made')} {total}
            </strong>
            {remaining > 0 && (
              <>
                {' — '}
                {t('exercizer.numbercopy.notcorrected')} {remaining}
              </>
            )}
          </span>
          {recipientsLabel(scheduled, 10) && (
            <span className="text-muted">
              {t('exercizer.scheduled.subject.to')} : {recipientsLabel(scheduled, 10)}
            </span>
          )}
        </div>
        <Button color="danger" variant="outline" onClick={() => setDialog({ kind: 'unschedule' })}>
          {t('exercizer.unschedule')}
        </Button>
      </div>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th />
            <Table.Th>{t('exercizer.author')}</Table.Th>
            <Table.Th>{t('exercizer.state')}</Table.Th>
            <Table.Th>{t('exercizer.domino.delivered')}</Table.Th>
            <Table.Th>{t('exercizer.copy.final.score')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {copies.map((copy) => {
            const stateKey = copyStateKey(copy);
            return (
              <Table.Tr key={copy.id}>
                <Table.Td>
                  <Checkbox
                    aria-label={copy.owner_username ?? String(copy.id)}
                    checked={selected.includes(copy.id)}
                    onChange={() => toggle(copy.id)}
                  />
                </Table.Td>
                <Table.Td>
                  {copy.submitted_date ? (
                    <Button
                      color="tertiary"
                      variant="ghost"
                      onClick={() =>
                        navigate(`/subject/copy/view/${scheduled.subject_id}/${copy.id}/`)
                      }
                    >
                      {copy.owner_username}
                    </Button>
                  ) : (
                    // Pas de copie rendue : rien à ouvrir. L'IHM AngularJS affichait un lien
                    // inerte ; un simple libellé dit mieux qu'il n'y a rien derrière.
                    <span>{copy.owner_username}</span>
                  )}
                </Table.Td>
                <Table.Td>
                  {stateKey && (
                    <Badge
                      variant={{
                        type: 'content',
                        level: copy.is_corrected ? 'success' : 'info',
                        background: true,
                      }}
                      className={copyStateColorClass(copy) ?? undefined}
                    >
                      {t(stateKey)}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>{formatDateTime(copy.submitted_date, at)}</Table.Td>
                <Table.Td>
                  {copy.is_corrected && copy.final_score !== null && copy.final_score !== undefined
                    ? `${copy.final_score}/${scheduled.max_score ?? 0}`
                    : `-/${scheduled.max_score ?? 0}`}
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>

      {selected.length > 0 && (
        <ActionBar>
          <Button color="primary" variant="filled" onClick={() => remind.mutate()}>
            {t('exercizer.reminder.raise')}
          </Button>
          <Button color="danger" variant="outline" onClick={() => setDialog({ kind: 'exclude' })}>
            {t('exercizer.exclude')}
          </Button>
        </ActionBar>
      )}

      {dialog?.kind === 'exclude' && (
        <ConfirmModal
          title={t('exercizer.exclude')}
          confirmLabel={t('exercizer.exclude')}
          onClose={() => setDialog(null)}
          onConfirm={() => exclude.mutate()}
        >
          <p>{t('exercizer.exclude.confirm')}</p>
          <ul>
            {selected.map((id) => (
              <li key={id}>{copies.find((copy) => copy.id === id)?.owner_username}</li>
            ))}
          </ul>
        </ConfirmModal>
      )}

      {dialog?.kind === 'unschedule' && (
        <ConfirmModal
          title={t('exercizer.unschedule.title')}
          confirmLabel={t('exercizer.unschedule')}
          onClose={() => setDialog(null)}
          onConfirm={() => unschedule.mutate()}
        >
          <p>{t('exercizer.unschedule.confirm')}</p>
        </ConfirmModal>
      )}
    </div>
  );
}

export default TeacherCorrections;
