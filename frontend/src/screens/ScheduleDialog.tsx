import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  Input,
  Label,
  Modal,
  RadioCard,
} from '@open-ent/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getGrains, scheduleSimpleSubject, scheduleSubject } from '../api';
import { RecipientPicker } from '../features/RecipientPicker';
import {
  areDatesValid,
  buildScheduleBody,
  buildScheduledAt,
  buildSimpleScheduleBody,
  hasRecipients,
  normaliseTime,
  PickedGroup,
  PickedUser,
  ScheduleOptions,
  scheduleBlocker,
} from '../schedule';
import { Subject } from '../types';
import { formatDate, fromDateInputValue, toDateInputValue } from '../utils';

/** Les quatre étapes de l'ancienne fenêtre. Un sujet « simple » n'a pas de type à choisir. */
type Step = 'type' | 'recipients' | 'options' | 'confirm';

const addDays = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

/**
 * Distribution d'un sujet — portage de la directive `subjectSchedule`.
 *
 * Quatre étapes, dans l'ordre de l'ancienne fenêtre : le type de distribution, les
 * destinataires, les options, puis la confirmation. Un sujet « simple » n'a pas de type (il n'y a
 * pas d'entraînement sans questions) et demande en plus une date de publication du corrigé.
 *
 * ⚠ Ce que le serveur attend est construit par `schedule.ts`, et pas ici : le corps doit
 * correspondre au schéma JSON au champ près (`additionalProperties: false`), les bornes de temps
 * ont une forme particulière, et c'est le CLIENT qui prépare la copie initiale de chaque question
 * — mélange des étiquettes compris. Ces règles sont testées à part.
 */
export function ScheduleDialog({
  subject,
  onClose,
  onScheduled,
}: {
  subject: Subject;
  onClose: () => void;
  /** Appelé avec l'identifiant de la distribution créée. */
  onScheduled: (scheduledId: number) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const isSimple = subject.type === 'simple';

  const [step, setStep] = useState<Step>(isSimple ? 'recipients' : 'type');
  const [groups, setGroups] = useState<PickedGroup[]>([]);
  const [users, setUsers] = useState<PickedUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<ScheduleOptions>({
    mode: 'classic',
    beginDate: new Date(),
    beginTime: '00:00',
    dueDate: addDays(7),
    dueTime: '23:59',
    correctedDate: addDays(8),
    correctedTime: '00:00',
    allowStudentsToUpdateCopy: false,
    forbidTraining: false,
    randomDisplay: false,
    estimatedDuration: '',
  });

  // Les grains ne servent qu'au sujet interactif : ils portent ce qu'il faut vérifier avant de
  // distribuer, et la copie initiale de chaque question.
  const grainsQuery = useQuery({
    queryKey: ['exercizer', 'grains', subject.id],
    queryFn: () => getGrains(subject),
    enabled: !isSimple,
  });
  const grains = grainsQuery.data ?? [];

  const blocker = useMemo(
    () => (isSimple || grainsQuery.isLoading ? null : scheduleBlocker(grains)),
    [isSimple, grainsQuery.isLoading, grains],
  );

  const scheduledAt = useMemo(() => buildScheduledAt(groups, users), [groups, users]);
  const recipientsOk = hasRecipients(scheduledAt);
  const datesOk =
    options.mode === 'training' ||
    areDatesValid(
      isSimple
        ? options
        : { ...options, correctedDate: undefined, correctedTime: undefined },
    );

  const submit = useMutation({
    mutationFn: async () => {
      if (isSimple) {
        return scheduleSimpleSubject(
          subject.id,
          buildSimpleScheduleBody(subject, options, scheduledAt),
        );
      }
      return scheduleSubject(
        subject.id,
        buildScheduleBody(subject, options, scheduledAt, grains),
      );
    },
    onSuccess: (created) => onScheduled(created?.id ?? 0),
    onError: () => setError(t('exercizer.error')),
  });

  const patch = (next: Partial<ScheduleOptions>) =>
    setOptions((current) => ({ ...current, ...next }));

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg">
      <Modal.Header onModalClose={onClose}>
        {t(isSimple ? 'exercizer.schedule.simple.title' : 'exercizer.schedule.interactive.title')}
      </Modal.Header>
      <Modal.Body>
        {/* Le sujet doit être distribuable AVANT qu'on demande à qui : annoncer le refus à la
            dernière étape ferait remplir la fenêtre pour rien. */}
        {blocker && (
          <Alert type="warning" className="mb-16">
            {t(blocker)}
          </Alert>
        )}
        {error && (
          <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
            {error}
          </Alert>
        )}

        <nav className="d-flex flex-wrap gap-8 mb-16" aria-label={t('exercizer.validate')}>
          {(isSimple
            ? (['recipients', 'options', 'confirm'] as Step[])
            : (['type', 'recipients', 'options', 'confirm'] as Step[])
          ).map((item) => (
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

        {step === 'type' && (
          <fieldset className="d-flex flex-column gap-8">
            <legend className="form-label">{t('exercizer.scheduled.subject.type.title')}</legend>
            {/* Un `RadioCard` par choix : le composant du socle en rend UN, pas une liste. */}
            {(['classic', 'training'] as const).map((mode) => (
              <RadioCard
                key={mode}
                groupName={`${id}-mode`}
                value={mode}
                selectedValue={options.mode}
                label={t(`exercizer.scheduled.subject.type.choice.${mode}`)}
                onChange={() => patch({ mode })}
              />
            ))}
          </fieldset>
        )}

        {step === 'recipients' && (
          <RecipientPicker
            subjectId={subject.id}
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
            {/* Une distribution d'entraînement n'a pas d'échéance : les bornes sont inutiles. */}
            {options.mode === 'classic' && (
              <>
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
                {isSimple && (
                  <DateTimeField
                    id={`${id}-corrected`}
                    label={t('exercizer.scheduled.simple.subject.corrected')}
                    date={options.correctedDate ?? options.dueDate}
                    time={options.correctedTime ?? '00:00'}
                    onChange={(correctedDate, correctedTime) =>
                      patch({ correctedDate, correctedTime })
                    }
                  />
                )}
              </>
            )}

            {!isSimple && (
              <>
                {options.mode === 'classic' && (
                  <Checkbox
                    label={t('exercizer.scheduled.subject.improve')}
                    checked={options.allowStudentsToUpdateCopy === true}
                    onChange={(event) =>
                      patch({ allowStudentsToUpdateCopy: event.target.checked })
                    }
                  />
                )}
                <Checkbox
                  label={t('exercizer.scheduled.subject.random.display')}
                  checked={options.randomDisplay === true}
                  onChange={(event) => patch({ randomDisplay: event.target.checked })}
                />
                {options.mode === 'classic' && (
                  <Checkbox
                    label={t('exercizer.scheduled.subject.forbid.training')}
                    checked={options.forbidTraining === true}
                    onChange={(event) => patch({ forbidTraining: event.target.checked })}
                  />
                )}
                <FormControl id={`${id}-duration`}>
                  <Label>{t('exercizer.scheduled.subject.delay')}</Label>
                  <div className="d-flex align-items-center gap-8">
                    <Input
                      type="text"
                      size="md"
                      inputMode="numeric"
                      className="w-auto"
                      value={options.estimatedDuration ?? ''}
                      onChange={(event) => patch({ estimatedDuration: event.target.value })}
                    />
                    <span>{t('exercizer.minute')}</span>
                  </div>
                </FormControl>
              </>
            )}

            {!datesOk && (
              <Alert type="warning">
                {t(
                  isSimple
                    ? 'exercizer.scheduled.simple.date.error'
                    : 'exercizer.scheduled.date.error',
                )}
              </Alert>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="d-flex flex-column gap-8">
            <p className="mb-0">
              {options.mode === 'training'
                ? t('exercizer.schedule.confirm.training')
                : `${t('exercizer.scheduled.subject.start')} : ${formatDate(
                    options.beginDate.toISOString(),
                  )} ${normaliseTime(options.beginTime)} — ${t(
                    'exercizer.scheduled.subject.end',
                  )} : ${formatDate(options.dueDate.toISOString())} ${normaliseTime(
                    options.dueTime,
                    true,
                  )}`}
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
            {(scheduledAt.exclude?.length ?? 0) > 0 && (
              <p className="mb-0 text-muted">
                {t('exercizer.scheduled.assign.exclude')} :{' '}
                {scheduledAt.exclude?.map((user) => user.name).join(', ')}
              </p>
            )}
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
              !!blocker ||
              (step === 'recipients' && !recipientsOk) ||
              (step === 'options' && !datesOk)
            }
            onClick={() => setStep(nextStep(step, isSimple))}
          >
            {t('exercizer.next')}
          </Button>
        ) : (
          <Button
            color="primary"
            variant="filled"
            isLoading={submit.isPending}
            disabled={!!blocker || !recipientsOk || !datesOk}
            onClick={() => submit.mutate()}
          >
            {t('exercizer.schedule')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

const STEP_LABELS: Record<Step, string> = {
  type: 'exercizer.scheduled.subject.type',
  recipients: 'exercizer.scheduled.subject.to',
  options: 'exercizer.scheduled.subject.option',
  confirm: 'exercizer.validate',
};

function nextStep(step: Step, isSimple: boolean): Step {
  const order: Step[] = isSimple
    ? ['recipients', 'options', 'confirm']
    : ['type', 'recipients', 'options', 'confirm'];
  const index = order.indexOf(step);
  return order[Math.min(index + 1, order.length - 1)];
}

/**
 * Une borne de temps : un jour et une heure.
 *
 * Champs natifs `date` et `time` : ils apportent la localisation du format, la saisie au clavier
 * et l'accessibilité sans code. L'ancienne IHM avait son propre `date-picker` et une heure en
 * texte libre, qu'il fallait valider à la main.
 */
function DateTimeField({
  id,
  label,
  date,
  time,
  onChange,
}: {
  id: string;
  label: string;
  date: Date;
  time: string;
  onChange: (date: Date, time: string) => void;
}) {
  return (
    <FormControl id={id}>
      <Label>{label}</Label>
      <div className="d-flex align-items-center gap-8 flex-wrap">
        <input
          type="date"
          className="form-control w-auto"
          value={toDateInputValue(date)}
          onChange={(event) => {
            const next = fromDateInputValue(event.target.value);
            if (next) onChange(next, time);
          }}
        />
        <input
          type="time"
          className="form-control w-auto"
          value={time}
          onChange={(event) => onChange(date, event.target.value)}
        />
      </div>
    </FormControl>
  );
}

export default ScheduleDialog;
