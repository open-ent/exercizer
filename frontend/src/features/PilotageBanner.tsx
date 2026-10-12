import { Alert, Button, useEdificeClient } from '@open-ent/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCopiesAsStudent, getSubjectsScheduledAsStudent } from '../api';
import {
  applyPilotageEvent,
  connectPilotage,
  formatRemaining,
  initialStudentPilotage,
  isPilotageReadOnly,
  POLL_INTERVAL_MS,
  studentRemainingSeconds,
  StudentPilotage,
  WS_OPEN_TIMEOUT_MS,
} from '../pilotage';
import { SubjectCopy, SubjectScheduled } from '../types';

/**
 * Le pilotage de la séance, vu de l'élève — portage de `subjectPerformCopyPilotage`.
 *
 * L'écran de passation se branche sur le même canal que celui de l'enseignant. L'élève n'a pas
 * le droit de demander l'état consolidé de la séance : son état initial est lu sur sa
 * distribution et sa copie, puis tenu à jour par les événements reçus. Si le canal ne s'ouvre
 * pas, ces deux mêmes listes sont relues toutes les vingt secondes.
 *
 * `readOnly` verrouille la saisie et le rendu : séance en pause, ou copie remise d'office. Le
 * serveur refuse de toute façon ces écritures — le verrou évite d'envoyer des requêtes vouées à
 * l'échec, et de laisser l'élève taper dans le vide.
 */
export function usePilotage(scheduled: SubjectScheduled | undefined, copy: SubjectCopy | undefined) {
  const { user } = useEdificeClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<StudentPilotage | null>(null);
  const [connected, setConnected] = useState(false);
  const [extended, setExtended] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const scheduledId = scheduled?.id;
  const copyId = copy?.id;
  const userId = user?.userId;

  // L'état initial est posé une fois par copie : le reposer à chaque rendu effacerait ce que les
  // événements ont appris depuis.
  const seeded = useRef<number | null>(null);
  useEffect(() => {
    if (!scheduled || !copy || seeded.current === copy.id) return;
    seeded.current = copy.id;
    setState(initialStudentPilotage(scheduled, copy));
  }, [scheduled, copy]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!scheduledId || !copyId) return;
    let alive = true;
    let poll: number | undefined;
    let live = false;

    const refresh = async () => {
      try {
        const [scheduledList, copies] = await Promise.all([
          queryClient.fetchQuery({
            queryKey: ['exercizer', 'scheduled', 'student'],
            queryFn: getSubjectsScheduledAsStudent,
            staleTime: 0,
          }),
          queryClient.fetchQuery({
            queryKey: ['exercizer', 'copies'],
            queryFn: getCopiesAsStudent,
            staleTime: 0,
          }),
        ]);
        const freshScheduled = scheduledList.find((item) => item.id === scheduledId);
        const freshCopy = copies.find((item) => item.id === copyId);
        if (!alive || !freshScheduled || !freshCopy) return;
        // Les messages ne sont pas en base : on garde ceux déjà reçus.
        setState((current) => ({
          ...initialStudentPilotage(freshScheduled, freshCopy),
          messages: current?.messages ?? [],
        }));
      } catch {
        // Le prochain sondage réessaiera.
      }
    };
    const startPolling = () => {
      if (poll === undefined) poll = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (poll !== undefined) window.clearInterval(poll);
      poll = undefined;
    };

    const openTimer = window.setTimeout(() => {
      if (!live) startPolling();
    }, WS_OPEN_TIMEOUT_MS);

    const handle = connectPilotage(
      scheduledId,
      (event) => {
        if (!alive) return;
        if (
          event.type === 'extend-time' &&
          (event.updatedCopies ?? []).some((item) => item.owner === userId)
        ) {
          setExtended(true);
        }
        setState((current) => (current ? applyPilotageEvent(current, event, userId) : current));
      },
      (isConnected) => {
        if (!alive) return;
        live = isConnected;
        setConnected(isConnected);
        if (isConnected) stopPolling();
        else startPolling();
      },
    );

    return () => {
      alive = false;
      window.clearTimeout(openTimer);
      stopPolling();
      handle.close();
    };
  }, [scheduledId, copyId, userId, queryClient]);

  // Une fois la copie rendue, normalement ou d'office, le décompte n'a plus de sens.
  const remaining =
    state &&
    scheduled &&
    copy &&
    // Un entraînement n'a pas d'échéance : rien à décompter.
    !copy.is_training_copy &&
    !copy.submitted_date &&
    !state.isForcedSubmit
      ? studentRemainingSeconds(scheduled.due_date, state, now)
      : null;

  return {
    state,
    connected,
    extended,
    remaining,
    readOnly: state ? isPilotageReadOnly(state) : false,
    dismissMessage: (id: string) =>
      setState((current) =>
        current
          ? { ...current, messages: current.messages.filter((message) => message.id !== id) }
          : current,
      ),
    dismissExtended: () => setExtended(false),
  };
}

/** Ce que l'élève voit du pilotage : pause, remise d'office, messages, temps restant. */
export function PilotageBanner({ pilotage }: { pilotage: ReturnType<typeof usePilotage> }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { state, remaining, connected, extended } = pilotage;
  if (!state) return null;
  const paused = state.sessionState === 'en_pause';
  if (!paused && !state.isForcedSubmit && state.messages.length === 0 && remaining === null && !extended) {
    return null;
  }

  return (
    <div className="mb-16" aria-live="polite">
      {paused && (
        <Alert type="warning" className="mb-8">
          {t('exercizer.pilotage.student.paused.banner')}
        </Alert>
      )}
      {state.isForcedSubmit && (
        <Alert type="danger" className="mb-8">
          {t('exercizer.pilotage.student.force.submit.banner')}
        </Alert>
      )}
      {extended && (
        <Alert type="info" isDismissible onClose={pilotage.dismissExtended} className="mb-8">
          {t('exercizer.pilotage.student.extend.received')}
        </Alert>
      )}
      {state.messages.map((message) => (
        <Alert key={message.id} type="info" className="mb-8">
          <div className="d-flex align-items-center justify-content-between gap-8">
            <span>{message.text}</span>
            <Button
              size="sm"
              color="tertiary"
              variant="ghost"
              onClick={() => pilotage.dismissMessage(message.id)}
            >
              {t('exercizer.close')}
            </Button>
          </div>
        </Alert>
      ))}
      {remaining !== null && (
        <p className="small fst-italic mb-0">
          {t('exercizer.pilotage.remaining.time')} : {formatRemaining(remaining)}
          {!connected && ` (${t('exercizer.pilotage.connection.poll')})`}
        </p>
      )}
    </div>
  );
}

export default PilotageBanner;
