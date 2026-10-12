import {
  Alert,
  Button,
  EmptyScreen,
  FormControl,
  Heading,
  Input,
  Label,
  LoadingScreen,
  Modal,
  Table,
  TextArea,
} from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  excludeCopies,
  extendPilotageTime,
  forcePilotageSubmit,
  getPilotageState,
  getSubjectsScheduledAsTeacher,
  pausePilotage,
  resumePilotage,
  sendPilotageMessage,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { ReminderDialog } from '../components/ReminderDialog';
import {
  canActOn,
  connectPilotage,
  PilotageStudent,
  POLL_INTERVAL_MS,
  teacherRemaining,
} from '../pilotage';
import { SubjectCopy } from '../types';

type Dialog =
  | { kind: 'extend'; student?: PilotageStudent }
  | { kind: 'message'; student?: PilotageStudent }
  | { kind: 'force'; student: PilotageStudent }
  | { kind: 'reminder'; student: PilotageStudent }
  | { kind: 'exclude'; student: PilotageStudent }
  | null;

/**
 * Pilotage en direct d'une séance — portage de `teacherDashboardPilotage`.
 *
 * L'état affiché est TOUJOURS celui que le serveur consolide (`GET …/pilotage`) : le canal
 * WebSocket ne sert qu'à savoir QUAND le redemander. Sans canal (proxy, pare-feu), l'écran sonde
 * toutes les vingt secondes — et le dit, pour que l'enseignant sache que ce qu'il voit peut avoir
 * quelques secondes de retard.
 */
export function Pilotage() {
  const { subjectScheduledId: param } = useParams();
  const id = Number(param);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [connected, setConnected] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  // L'horloge ne recalcule rien : elle fait défiler le décompte entre deux réponses du serveur.
  const [now, setNow] = useState(() => Date.now());

  const stateKey = ['exercizer', 'pilotage', id];
  const stateQuery = useQuery({
    queryKey: stateKey,
    queryFn: () => getPilotageState(id),
    refetchInterval: connected ? false : POLL_INTERVAL_MS,
  });
  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'teacher'],
    queryFn: getSubjectsScheduledAsTeacher,
  });
  const scheduled = (scheduledQuery.data ?? []).find((item) => item.id === id);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    // Tant que le canal n'est pas ouvert, c'est le sondage qui tient l'état à jour
    // (`refetchInterval`) : aucun délai d'attente à gérer ici.
    const handle = connectPilotage(
      id,
      (event) => {
        // Un message n'a aucun effet sur l'état : inutile de le redemander.
        if (event?.type && event.type !== 'message') {
          void queryClient.invalidateQueries({ queryKey: ['exercizer', 'pilotage', id] });
        }
      },
      setConnected,
    );
    return () => handle.close();
  }, [id, queryClient]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: stateKey });
  const fail = () => setMessage({ type: 'danger', text: t('exercizer.error') });
  const done = (text?: string) => {
    setDialog(null);
    if (text) setMessage({ type: 'success', text });
    void refresh();
  };

  const pause = useMutation({ mutationFn: () => pausePilotage(id), onSuccess: () => done(), onError: fail });
  const resume = useMutation({ mutationFn: () => resumePilotage(id), onSuccess: () => done(), onError: fail });
  const force = useMutation({
    mutationFn: (student: PilotageStudent) => forcePilotageSubmit(id, student.studentId),
    onSuccess: () => done(t('exercizer.pilotage.force.submit.done')),
    onError: () =>
      setMessage({ type: 'danger', text: t('exercizer.pilotage.force.submit.refused') }),
  });
  const exclude = useMutation({
    mutationFn: (student: PilotageStudent) => excludeCopies([student.copyId]),
    onSuccess: () => done(),
    onError: fail,
  });

  if (stateQuery.isLoading) return <LoadingScreen position={false} />;
  const state = stateQuery.data;
  if (!state) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.error')} size={200} />
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

  const paused = state.sessionState === 'en_pause';
  const asCopy = (student: PilotageStudent): SubjectCopy => ({
    id: student.copyId,
    subject_scheduled_id: id,
    owner: student.studentId,
    owner_username: student.studentName,
    submitted_date: student.submittedDate,
  });

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {t('exercizer.pilotage.title')} « {state.title} »
        </Heading>
        <div className="d-flex align-items-center gap-16">
          <em className="small" role="status">
            {t(connected ? 'exercizer.pilotage.connection.live' : 'exercizer.pilotage.connection.poll')}
          </em>
          <Button
            color="tertiary"
            variant="ghost"
            onClick={() => navigate(`/dashboard/teacher/correction/${id}`)}
          >
            {t('exercizer.back')}
          </Button>
        </div>
      </div>

      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)} className="mb-16">
          {message.text}
        </Alert>
      )}
      {paused && (
        <Alert type="warning" className="mb-16">
          {t('exercizer.pilotage.paused.banner')}
        </Alert>
      )}

      <div className="d-flex flex-wrap gap-8 mb-24">
        {paused ? (
          <Button color="primary" variant="filled" isLoading={resume.isPending} onClick={() => resume.mutate()}>
            {t('exercizer.pilotage.resume')}
          </Button>
        ) : (
          <Button color="primary" variant="filled" isLoading={pause.isPending} onClick={() => pause.mutate()}>
            {t('exercizer.pilotage.pause')}
          </Button>
        )}
        <Button color="primary" variant="outline" onClick={() => setDialog({ kind: 'extend' })}>
          {t('exercizer.pilotage.extend.time.class')}
        </Button>
        <Button color="primary" variant="outline" onClick={() => setDialog({ kind: 'message' })}>
          {t('exercizer.pilotage.message.class')}
        </Button>
      </div>

      <div className="table-responsive">
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('exercizer.copy.from')}</Table.Th>
              <Table.Th>{t('exercizer.state')}</Table.Th>
              <Table.Th>{t('exercizer.pilotage.remaining.time')}</Table.Th>
              <Table.Th>{t('exercizer.pilotage.actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {state.students.length === 0 && (
              <Table.Tr>
                <td colSpan={4}>{t('exercizer.pilotage.no.students')}</td>
              </Table.Tr>
            )}
            {state.students.map((student) => (
              <Table.Tr key={student.copyId}>
                <Table.Td>{student.studentName}</Table.Td>
                <Table.Td>{t(`exercizer.copy.state.${student.state}`)}</Table.Td>
                <Table.Td>
                  {teacherRemaining(student, state.sessionState, stateQuery.dataUpdatedAt, now)}
                </Table.Td>
                <Table.Td>
                  <div className="d-flex flex-wrap gap-8">
                    {canActOn(student) && (
                      <>
                        <Button
                          size="sm"
                          color="primary"
                          variant="outline"
                          onClick={() => setDialog({ kind: 'extend', student })}
                        >
                          {t('exercizer.pilotage.extend.time.student')}
                        </Button>
                        <Button
                          size="sm"
                          color="primary"
                          variant="outline"
                          onClick={() => setDialog({ kind: 'force', student })}
                        >
                          {t('exercizer.pilotage.force.submit')}
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      color="primary"
                      variant="outline"
                      onClick={() => setDialog({ kind: 'message', student })}
                    >
                      {t('exercizer.pilotage.message.student')}
                    </Button>
                    {!student.submittedDate && (
                      <>
                        <Button
                          size="sm"
                          color="primary"
                          variant="outline"
                          onClick={() => setDialog({ kind: 'reminder', student })}
                        >
                          {t('exercizer.reminder')}
                        </Button>
                        <Button
                          size="sm"
                          color="danger"
                          variant="outline"
                          onClick={() => setDialog({ kind: 'exclude', student })}
                        >
                          {t('exercizer.exclude')}
                        </Button>
                      </>
                    )}
                  </div>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>

      {dialog?.kind === 'extend' && (
        <ExtendDialog
          subjectScheduledId={id}
          student={dialog.student}
          onClose={() => setDialog(null)}
          onDone={() => done(t('exercizer.pilotage.extend.sent'))}
        />
      )}

      {dialog?.kind === 'message' && (
        <MessageDialog
          subjectScheduledId={id}
          student={dialog.student}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            setMessage({ type: 'success', text: t('exercizer.pilotage.message.sent') });
          }}
        />
      )}

      {dialog?.kind === 'force' && (
        <ConfirmModal
          title={t('exercizer.pilotage.force.submit.title')}
          confirmLabel={t('exercizer.pilotage.force.submit')}
          isLoading={force.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => force.mutate(dialog.student)}
        >
          <p>
            {t('exercizer.pilotage.force.submit.confirm1')} {dialog.student.studentName}{' '}
            {t('exercizer.pilotage.force.submit.confirm2')}
          </p>
        </ConfirmModal>
      )}

      {dialog?.kind === 'reminder' && scheduled && (
        <ReminderDialog
          scheduled={scheduled}
          copies={[asCopy(dialog.student)]}
          onClose={() => setDialog(null)}
          onSent={() => done(t('exercizer.reminder.sent'))}
        />
      )}

      {dialog?.kind === 'exclude' && (
        <ConfirmModal
          title={t('exercizer.exclude')}
          confirmLabel={t('exercizer.validate')}
          isLoading={exclude.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => exclude.mutate(dialog.student)}
        >
          <p>
            {t('exercizer.exclude.confirm')} <strong>{t('exercizer.exclude.info')}</strong>
          </p>
          <ul>
            <li>{dialog.student.studentName}</li>
          </ul>
        </ConfirmModal>
      )}
    </div>
  );
}

/** Prolongation, pour la classe ou pour un élève. Un nombre négatif retire du temps. */
function ExtendDialog({
  subjectScheduledId,
  student,
  onClose,
  onDone,
}: {
  subjectScheduledId: number;
  student?: PilotageStudent;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const extend = useMutation({
    mutationFn: (value: number) => extendPilotageTime(subjectScheduledId, value, student?.studentId),
    onSuccess: onDone,
    onError: () => setError(t('exercizer.error')),
  });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="sm">
      <Modal.Header onModalClose={onClose}>
        {student
          ? `${t('exercizer.pilotage.extend.time.student')} - ${student.studentName}`
          : t('exercizer.pilotage.extend.time.class')}
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}
        <FormControl id={`${id}-minutes`}>
          <Label>{t('exercizer.pilotage.extend.minutes.label')}</Label>
          <Input
            type="number"
            size="md"
            step={1}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
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
          isLoading={extend.isPending}
          onClick={() => {
            const value = parseInt(minutes, 10);
            if (!value || Number.isNaN(value)) {
              return setError(t('exercizer.pilotage.extend.invalid.minutes'));
            }
            setError(null);
            extend.mutate(value);
          }}
        >
          {t('exercizer.pilotage.extend.confirm')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/** Message affiché sur l'écran de la classe, ou d'un seul élève, pendant la séance. */
function MessageDialog({
  subjectScheduledId,
  student,
  onClose,
  onDone,
}: {
  subjectScheduledId: number;
  student?: PilotageStudent;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => sendPilotageMessage(subjectScheduledId, text, student?.studentId),
    onSuccess: onDone,
    onError: () => setError(t('exercizer.error')),
  });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>
        {student
          ? `${t('exercizer.pilotage.message.student')} - ${student.studentName}`
          : t('exercizer.pilotage.message.class')}
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}
        <FormControl id={`${id}-text`}>
          <Label>{t('exercizer.pilotage.message.placeholder')}</Label>
          <TextArea
            size="md"
            value={text}
            placeholder={t('exercizer.pilotage.message.placeholder')}
            onChange={(event) => setText(event.target.value)}
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
          isLoading={send.isPending}
          onClick={() => {
            if (!text.trim()) return setError(t('exercizer.pilotage.message.empty'));
            setError(null);
            send.mutate();
          }}
        >
          {t('exercizer.pilotage.message.send')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default Pilotage;
