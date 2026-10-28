import {
  Alert,
  Button,
  Checkbox,
  EmptyScreen,
  FormControl,
  Heading,
  Input,
  Label,
  LoadingScreen,
  Modal,
  SearchBar,
  Table,
  TextArea,
} from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  addSubjectSequenceItem,
  createSubjectSequence,
  getSequenceShareTargets,
  getSubjectSequenceItems,
  getSubjectSequences,
  getSubjectSequenceSchedules,
  getSubjects,
  removeSubjectSequenceItems,
  removeSubjectSequences,
  scheduleSubjectSequence,
  updateSubjectSequence,
  updateSubjectSequenceItem,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { RecipientPicker } from '../features/RecipientPicker';
import { SaveStatus } from '../features/SaveStatus';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import {
  areDatesValid,
  buildScheduledAt,
  hasRecipients,
  normaliseTime,
  PickedGroup,
  PickedUser,
  toScheduleDate,
} from '../schedule';
import { SubjectSequence, SubjectSequenceItem } from '../types';
import { formatDate, formatDateTime } from '../utils';
import { DateTimeField } from './ScheduleDialog';

const SEQUENCES = ['exercizer', 'sequences'] as const;

/**
 * « Parcours » : la liste des parcours de l'enseignant — portage de
 * `SubjectSequenceListController`.
 *
 * Un parcours est une suite ordonnée de sujets existants, distribuée en un bloc. Pas de dossiers,
 * de partage ni de duplication : un titre, une description, et des sujets.
 */
export function SubjectSequenceList() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [toRemove, setToRemove] = useState<SubjectSequence | null>(null);
  const [tracked, setTracked] = useState<SubjectSequence | null>(null);

  const query = useQuery({ queryKey: SEQUENCES, queryFn: getSubjectSequences });
  const sequences = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => new Date(b.modified ?? 0).getTime() - new Date(a.modified ?? 0).getTime(),
      ),
    [query.data],
  );

  const remove = useMutation({
    mutationFn: (sequence: SubjectSequence) => removeSubjectSequences([sequence.id]),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SEQUENCES });
      setToRemove(null);
    },
  });

  if (query.isLoading) return <LoadingScreen position={false} />;

  const edit = (sequence: SubjectSequence) => navigate(`/subject-sequence/edit/${sequence.id}/`);

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {t('exercizer.sequence.dashboard.title')}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          <Button color="tertiary" variant="ghost" onClick={() => navigate('/dashboard/teacher')}>
            {t('exercizer.back.subject')}
          </Button>
          <Button color="primary" variant="filled" onClick={() => setCreating(true)}>
            {t('exercizer.sequence.create')}
          </Button>
        </div>
      </div>

      {sequences.length === 0 ? (
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.sequence.emptyscreen')} size={200} />
      ) : (
        <div className="table-responsive">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('exercizer.sequence.title')}</Table.Th>
                <Table.Th>{t('exercizer.scheduled.subject.modified')}</Table.Th>
                <Table.Th className="text-end">{t('exercizer.grain.action')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {sequences.map((sequence) => (
                <Table.Tr key={sequence.id}>
                  <Table.Td>
                    <Button color="tertiary" variant="ghost" onClick={() => edit(sequence)}>
                      {sequence.title}
                    </Button>
                  </Table.Td>
                  <Table.Td>{formatDateTime(sequence.modified, '')}</Table.Td>
                  <Table.Td>
                    <div className="d-flex flex-wrap justify-content-end gap-4">
                      {/* Seul chemin vers le suivi d'une distribution passée du parcours. */}
                      <Button
                        size="sm"
                        color="tertiary"
                        variant="ghost"
                        onClick={() => setTracked(sequence)}
                      >
                        {t('exercizer.sequence.scheduled.list')}
                      </Button>
                      <Button size="sm" color="tertiary" variant="ghost" onClick={() => edit(sequence)}>
                        {t('exercizer.edit')}
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        variant="ghost"
                        onClick={() => setToRemove(sequence)}
                      >
                        {t('exercizer.remove')}
                      </Button>
                    </div>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {creating && (
        <CreateSequenceDialog
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            void queryClient.invalidateQueries({ queryKey: SEQUENCES });
            edit(created);
          }}
        />
      )}

      {toRemove && (
        <ConfirmModal
          title={t('exercizer.sequence.remove.title')}
          isLoading={remove.isPending}
          onClose={() => setToRemove(null)}
          onConfirm={() => remove.mutate(toRemove)}
        >
          <p>{t('exercizer.sequence.remove.confirm')}</p>
        </ConfirmModal>
      )}

      {tracked && <SchedulesDialog sequence={tracked} onClose={() => setTracked(null)} />}
    </div>
  );
}

function CreateSequenceDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (sequence: SubjectSequence) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createSubjectSequence({ title: title.trim(), description }),
    onSuccess: onCreated,
    onError: () => setError(t('exercizer.error')),
  });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>{t('exercizer.sequence.create')}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}
        <FormControl id={`${id}-title`} className="mb-16" isRequired>
          <Label>{t('exercizer.sequence.title')}</Label>
          <Input
            type="text"
            size="md"
            maxLength={255}
            value={title}
            placeholder={t('exercizer.sequence.title.placeholder')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FormControl>
        <FormControl id={`${id}-description`}>
          <Label>{t('exercizer.sequence.description')}</Label>
          <TextArea
            size="md"
            value={description}
            placeholder={t('exercizer.sequence.description.placeholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormControl>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          disabled={!title.trim()}
          isLoading={create.isPending}
          onClick={() => create.mutate()}
        >
          {t('exercizer.validate')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/** Les distributions passées d'un parcours, chacune menant à son écran de suivi. */
function SchedulesDialog({ sequence, onClose }: { sequence: SubjectSequence; onClose: () => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const id = useId();
  const query = useQuery({
    queryKey: ['exercizer', 'sequence-schedules', sequence.id],
    queryFn: () => getSubjectSequenceSchedules(sequence.id),
  });
  const list = query.data ?? [];

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md" scrollable>
      <Modal.Header onModalClose={onClose}>
        {t('exercizer.sequence.scheduled.list')} - {sequence.title}
      </Modal.Header>
      <Modal.Body>
        {query.isLoading ? (
          <p role="status">{t('exercizer.loading')}</p>
        ) : list.length === 0 ? (
          <p className="mb-0">{t('exercizer.sequence.scheduled.emptyscreen')}</p>
        ) : (
          <ul className="list-unstyled d-flex flex-column gap-8 mb-0">
            {list.map((scheduled) => (
              <li key={scheduled.id}>
                <Button
                  color="tertiary"
                  variant="ghost"
                  onClick={() => navigate(`/subject-sequence-scheduled/${scheduled.id}/`)}
                >
                  {scheduled.title} — {formatDate(scheduled.begin_date)} →{' '}
                  {formatDate(scheduled.due_date)}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/**
 * Édition d'un parcours — portage d'`EditSubjectSequenceController` : son titre, sa description,
 * et la suite ordonnée de ses sujets.
 *
 * Comme l'éditeur de sujet, pas de bouton « Enregistrer » : le titre et la description partent
 * d'eux-mêmes peu après la frappe, l'ajout, le retrait et le déplacement d'un sujet aussitôt.
 */
export function SubjectSequenceEditor() {
  const { subjectSequenceId: param } = useParams();
  const sequenceId = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [toRemove, setToRemove] = useState<SubjectSequenceItem | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  const sequencesQuery = useQuery({ queryKey: SEQUENCES, queryFn: getSubjectSequences });
  const sequence = (sequencesQuery.data ?? []).find((item) => item.id === sequenceId);

  const itemsKey = ['exercizer', 'sequence-items', sequenceId];
  const itemsQuery = useQuery({
    queryKey: itemsKey,
    queryFn: () => getSubjectSequenceItems(sequenceId),
  });
  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });

  const items = useMemo(
    () => [...(itemsQuery.data ?? [])].sort((a, b) => (a.order_by || 0) - (b.order_by || 0)),
    [itemsQuery.data],
  );

  // Les champs suivent le parcours une seule fois : les resynchroniser à chaque réponse du
  // serveur écraserait la frappe en cours.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!sequence || hydrated) return;
    setTitle(sequence.title ?? '');
    setDescription(sequence.description ?? '');
    setHydrated(true);
  }, [sequence, hydrated]);

  const fail = () => setMessage({ type: 'danger', text: t('exercizer.error') });

  const { schedule, flush, pending, failed, retry } = useDebouncedSave(
    async (next: { title: string; description: string }) => {
      // Un parcours sans titre n'est pas enregistré : on attend qu'il en ait un.
      if (!sequence || !next.title.trim()) return;
      await updateSubjectSequence({ ...sequence, ...next });
    },
  );
  const change = (patch: { title?: string; description?: string }) => {
    const next = { title: patch.title ?? title, description: patch.description ?? description };
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.description !== undefined) setDescription(patch.description);
    schedule(sequenceId, next);
  };

  const refreshItems = () => queryClient.invalidateQueries({ queryKey: itemsKey });

  const add = useMutation({
    mutationFn: (subjectId: number) =>
      addSubjectSequenceItem(
        sequenceId,
        subjectId,
        items.reduce((max, item) => Math.max(max, item.order_by || 0), 0) + 1,
      ),
    onSuccess: () => {
      setSearch('');
      void refreshItems();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (item: SubjectSequenceItem) => removeSubjectSequenceItems(sequenceId, [item.id]),
    onSuccess: () => {
      setToRemove(null);
      void refreshItems();
    },
    onError: fail,
  });
  /** Monter ou descendre un sujet échange son rang avec celui de son voisin. */
  const swap = useMutation({
    mutationFn: ([a, b]: [SubjectSequenceItem, SubjectSequenceItem]) =>
      Promise.all([
        updateSubjectSequenceItem(sequenceId, { ...a, order_by: b.order_by }),
        updateSubjectSequenceItem(sequenceId, { ...b, order_by: a.order_by }),
      ]),
    onSuccess: () => void refreshItems(),
    onError: fail,
  });

  /** Les sujets qu'on peut encore ajouter : ceux qui ne sont pas déjà dans le parcours. */
  const candidates = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return [];
    const already = new Set(items.map((item) => item.subject_id));
    return (subjectsQuery.data ?? [])
      .filter((subject) => !already.has(subject.id))
      .filter((subject) => (subject.title ?? '').toLowerCase().includes(text))
      .slice(0, 10);
  }, [search, items, subjectsQuery.data]);

  if (sequencesQuery.isLoading || itemsQuery.isLoading) return <LoadingScreen position={false} />;
  if (!sequence) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.sequence.emptyscreen')} size={200} />
        <Button color="primary" variant="filled" onClick={() => navigate('/subject-sequence/list')}>
          {t('exercizer.sequence.dashboard.title')}
        </Button>
      </div>
    );
  }

  const leave = async () => {
    await flush();
    void queryClient.invalidateQueries({ queryKey: SEQUENCES });
    navigate('/subject-sequence/list');
  };

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0 text-truncate">
          {title || t('exercizer.sequence.dashboard.title')}
        </Heading>
        <div className="d-flex flex-wrap align-items-center gap-8">
          <SaveStatus pending={pending} failed={failed} onRetry={retry} />
          <Button color="tertiary" variant="ghost" onClick={leave}>
            {t('exercizer.back.subject')}
          </Button>
          <Button
            color="primary"
            variant="filled"
            disabled={items.length === 0}
            onClick={async () => {
              await flush();
              setScheduling(true);
            }}
          >
            {t('exercizer.schedule')}
          </Button>
        </div>
      </div>

      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)} className="mb-16">
          {message.text}
        </Alert>
      )}

      <FormControl id="sequence-title" className="mb-16">
        <Label>{t('exercizer.sequence.title')}</Label>
        <Input
          type="text"
          size="md"
          maxLength={255}
          value={title}
          onChange={(event) => change({ title: event.target.value })}
        />
      </FormControl>
      <FormControl id="sequence-description" className="mb-24">
        <Label>{t('exercizer.sequence.description')}</Label>
        <TextArea
          size="md"
          value={description}
          onChange={(event) => change({ description: event.target.value })}
        />
      </FormControl>

      <section className="mb-24">
        <Heading level="h3" headingStyle="h5" className="mb-8">
          {t('exercizer.sequence.add.subject')}
        </Heading>
        <SearchBar
          isVariant
          size="md"
          clearable
          placeholder={t('exercizer.subject.search.placeholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {candidates.length > 0 && (
          <ul className="list-unstyled d-flex flex-column gap-4 mt-8 mb-0">
            {candidates.map((subject) => (
              <li key={subject.id}>
                <Button
                  color="tertiary"
                  variant="ghost"
                  disabled={add.isPending}
                  onClick={() => add.mutate(subject.id)}
                >
                  {subject.title}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {items.length === 0 ? (
        <EmptyScreen
          imageSrc={illuExercizer}
          text={t('exercizer.sequence.items.emptyscreen')}
          size={200}
        />
      ) : (
        <div className="table-responsive">
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>#</Table.Th>
                <Table.Th>{t('exercizer.sequence.item.subject')}</Table.Th>
                <Table.Th>{t('exercizer.score')}</Table.Th>
                <Table.Th className="text-end">{t('exercizer.grain.action')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item, index) => (
                <Table.Tr key={item.id}>
                  <Table.Td>{index + 1}</Table.Td>
                  <Table.Td>{item.subject_title}</Table.Td>
                  <Table.Td>{item.subject_max_score}</Table.Td>
                  <Table.Td>
                    <div className="d-flex flex-wrap justify-content-end gap-4">
                      <Button
                        size="sm"
                        color="tertiary"
                        variant="ghost"
                        disabled={index === 0 || swap.isPending}
                        onClick={() => swap.mutate([item, items[index - 1]])}
                      >
                        {t('exercizer.sequence.item.moveUp')}
                      </Button>
                      <Button
                        size="sm"
                        color="tertiary"
                        variant="ghost"
                        disabled={index === items.length - 1 || swap.isPending}
                        onClick={() => swap.mutate([item, items[index + 1]])}
                      >
                        {t('exercizer.sequence.item.moveDown')}
                      </Button>
                      <Button
                        size="sm"
                        color="danger"
                        variant="ghost"
                        onClick={() => setToRemove(item)}
                      >
                        {t('exercizer.remove')}
                      </Button>
                    </div>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}

      {toRemove && (
        <ConfirmModal
          title={t('exercizer.sequence.item.remove.title')}
          isLoading={remove.isPending}
          onClose={() => setToRemove(null)}
          onConfirm={() => remove.mutate(toRemove)}
        >
          <p>{t('exercizer.sequence.item.remove.confirm')}</p>
        </ConfirmModal>
      )}

      {scheduling && (
        <ScheduleSequenceDialog
          sequence={{ ...sequence, title }}
          onClose={() => setScheduling(false)}
          onScheduled={() => navigate('/subject-sequence/list')}
        />
      )}
    </div>
  );
}

type Step = 'recipients' | 'options' | 'confirm';
const STEPS: Step[] = ['recipients', 'options', 'confirm'];
const STEP_LABELS: Record<Step, string> = {
  recipients: 'exercizer.scheduled.subject.to',
  options: 'exercizer.scheduled.subject.option',
  confirm: 'exercizer.validate',
};

/**
 * Affectation d'un parcours — portage de la directive `subjectSequenceSchedule`.
 *
 * La fenêtre de distribution d'un sujet, sans son étape « type » : un parcours n'a pas de mode
 * entraînement, et ce sont ses sujets qui portent chacun le leur (simple ou interactif).
 */
function ScheduleSequenceDialog({
  sequence,
  onClose,
  onScheduled,
}: {
  sequence: SubjectSequence;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [step, setStep] = useState<Step>('recipients');
  const [groups, setGroups] = useState<PickedGroup[]>([]);
  const [users, setUsers] = useState<PickedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState(() => {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    return {
      beginDate: new Date(),
      beginTime: '00:00',
      dueDate: due,
      dueTime: '23:59',
      allowStudentsToUpdateCopy: false,
      randomDisplay: false,
      estimatedDuration: '',
    };
  });

  const source = useMemo(
    () => ({
      key: 'sequence',
      fetch: (search?: string) => getSequenceShareTargets(sequence.id, search),
    }),
    [sequence.id],
  );

  const scheduledAt = useMemo(() => buildScheduledAt(groups, users), [groups, users]);
  const recipientsOk = hasRecipients(scheduledAt);
  const datesOk = areDatesValid(options);

  const submit = useMutation({
    mutationFn: () =>
      scheduleSubjectSequence(sequence.id, {
        beginDate: toScheduleDate(options.beginDate, options.beginTime),
        dueDate: toScheduleDate(options.dueDate, normaliseTime(options.dueTime, true)),
        estimatedDuration: options.estimatedDuration,
        isOneShotSubmit: !options.allowStudentsToUpdateCopy,
        randomDisplay: options.randomDisplay,
        scheduledAt,
      }),
    onSuccess: onScheduled,
    onError: () => setError(t('exercizer.error')),
  });

  const patch = (next: Partial<typeof options>) =>
    setOptions((current) => ({ ...current, ...next }));

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg">
      <Modal.Header onModalClose={onClose}>{t('exercizer.sequence.schedule.title')}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
            {error}
          </Alert>
        )}

        <nav className="d-flex flex-wrap gap-8 mb-16" aria-label={t('exercizer.validate')}>
          {STEPS.map((item) => (
            <Button
              key={item}
              size="sm"
              color="secondary"
              variant={step === item ? 'filled' : 'outline'}
              aria-current={step === item ? 'step' : undefined}
              onClick={() => setStep(item)}
            >
              {t(STEP_LABELS[item])}
            </Button>
          ))}
        </nav>

        {step === 'recipients' && (
          <RecipientPicker
            subjectId={sequence.id}
            source={source}
            groups={groups}
            users={users}
            onChange={(next) => {
              setGroups(next.groups);
              setUsers(next.users);
            }}
          />
        )}

        {step === 'options' && (
          <div className="d-flex flex-column gap-16">
            <DateTimeField
              id={`${id}-begin`}
              label={t('exercizer.scheduled.subject.start')}
              date={options.beginDate}
              time={options.beginTime}
              onChange={(beginDate, beginTime) => patch({ beginDate, beginTime })}
            />
            <DateTimeField
              id={`${id}-due`}
              label={t('exercizer.scheduled.subject.end')}
              date={options.dueDate}
              time={options.dueTime}
              onChange={(dueDate, dueTime) => patch({ dueDate, dueTime })}
            />
            <Checkbox
              label={t('exercizer.scheduled.subject.improve')}
              checked={options.allowStudentsToUpdateCopy}
              onChange={(event) => patch({ allowStudentsToUpdateCopy: event.target.checked })}
            />
            <Checkbox
              label={t('exercizer.scheduled.subject.random.display')}
              checked={options.randomDisplay}
              onChange={(event) => patch({ randomDisplay: event.target.checked })}
            />
            <FormControl id={`${id}-duration`}>
              <Label>{t('exercizer.scheduled.subject.delay')}</Label>
              <div className="d-flex align-items-center gap-8">
                <Input
                  type="text"
                  size="md"
                  inputMode="numeric"
                  className="w-auto"
                  value={options.estimatedDuration}
                  onChange={(event) => patch({ estimatedDuration: event.target.value })}
                />
                <span>{t('exercizer.minute')}</span>
              </div>
            </FormControl>
            {!datesOk && <Alert type="warning">{t('exercizer.scheduled.date.error')}</Alert>}
          </div>
        )}

        {step === 'confirm' && (
          <div className="d-flex flex-column gap-8">
            <p className="mb-0">
              {t('exercizer.scheduled.subject.start')} :{' '}
              {formatDate(options.beginDate.toISOString())} {normaliseTime(options.beginTime)} —{' '}
              {t('exercizer.scheduled.subject.end')} : {formatDate(options.dueDate.toISOString())}{' '}
              {normaliseTime(options.dueTime, true)}
            </p>
            <p className="mb-0">
              {t('exercizer.scheduled.subject.to')} :{' '}
              <strong>
                {[
                  ...scheduledAt.groupList.map((group) => group.name),
                  ...scheduledAt.userList.map((user) => user.name),
                ].join(', ')}
              </strong>
            </p>
            {!recipientsOk && (
              <Alert type="warning">{t('exercizer.scheduled.subject.search')}</Alert>
            )}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        {step !== 'confirm' ? (
          <Button
            color="primary"
            variant="filled"
            disabled={
              (step === 'recipients' && !recipientsOk) || (step === 'options' && !datesOk)
            }
            onClick={() => setStep(STEPS[STEPS.indexOf(step) + 1])}
          >
            {t('exercizer.next')}
          </Button>
        ) : (
          <Button
            color="primary"
            variant="filled"
            disabled={!recipientsOk || !datesOk}
            isLoading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {t('exercizer.schedule')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default SubjectSequenceList;
