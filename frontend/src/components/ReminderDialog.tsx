import { Alert, Button, FormControl, Input, Label, Modal } from '@open-ent/react';
import { useMutation } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { remindCopies, remindCopiesAutomatically } from '../api';
import { RichTextEditor } from '../features/RichTextEditor';
import { SubjectCopy, SubjectScheduled } from '../types';
import { formatDateTime } from '../utils';

type Step = 'choose' | 'auto' | 'perso';

/**
 * Relance des élèves qui n'ont pas rendu leur copie — portage de la directive `reminders`.
 *
 * Deux relances : l'automatique, dont le texte est fixé par la plateforme (il rappelle le sujet
 * et son échéance), et la personnalisée, où l'enseignant écrit l'objet et le message.
 */
export function ReminderDialog({
  scheduled,
  copies,
  onClose,
  onSent,
}: {
  scheduled: SubjectScheduled;
  /** Les copies à relancer — déjà restreintes à celles qui ne sont pas rendues. */
  copies: SubjectCopy[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [step, setStep] = useState<Step>('choose');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => {
      const ids = copies.map((copy) => copy.id);
      return step === 'auto'
        ? remindCopiesAutomatically(ids, scheduled.id)
        : remindCopies(ids, subject, body);
    },
    onSuccess: onSent,
    onError: () => setError(t('exercizer.error')),
  });

  const submit = () => {
    if (step === 'perso') {
      if (!subject.trim()) return setError(t('exercizer.reminder.check.subject'));
      if (!body.trim()) return setError(t('exercizer.reminder.check.body'));
    }
    setError(null);
    send.mutate();
  };

  return (
    <Modal id={id} isOpen onModalClose={onClose} size={step === 'perso' ? 'lg' : 'md'}>
      <Modal.Header onModalClose={onClose}>
        {t('exercizer.reminder')} - {scheduled.title}
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}

        {step === 'choose' && (
          <>
            <p>{t('exercizer.reminder.choose.label')}</p>
            <div className="d-flex flex-wrap justify-content-center gap-8 my-16">
              <Button color="primary" variant="outline" onClick={() => setStep('perso')}>
                {t('exercizer.reminder.choose.type1')}
              </Button>
              <Button color="primary" variant="outline" onClick={() => setStep('auto')}>
                {t('exercizer.reminder.choose.type2')}
              </Button>
            </div>
          </>
        )}

        {step === 'auto' && (
          <>
            <p>
              <strong>{t('exercizer.reminder.type2.label')}</strong>
            </p>
            <p className="mb-0">
              {t('exercizer.reminder.type2.content1')} {scheduled.title}{' '}
              {t('exercizer.reminder.type2.content2')}{' '}
              {formatDateTime(scheduled.due_date, t('exercizer.at'))}
            </p>
          </>
        )}

        {step === 'perso' && (
          <>
            <p className="mb-8">
              <strong>{t('exercizer.reminder.type1.label1')}</strong>{' '}
              {copies.map((copy) => copy.owner_username).join(', ')}
            </p>
            <FormControl id={`${id}-subject`} className="mb-16">
              <Label>{t('exercizer.reminder.type1.label2')}</Label>
              <Input
                type="text"
                size="md"
                value={subject}
                placeholder={t('exercizer.reminder.type1.label2')}
                onChange={(event) => setSubject(event.target.value)}
              />
            </FormControl>
            <RichTextEditor content={body} onChange={setBody} />
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        {step !== 'choose' && (
          <Button color="tertiary" variant="ghost" onClick={() => setStep('choose')}>
            {t('exercizer.back')}
          </Button>
        )}
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        {step !== 'choose' && (
          <Button color="primary" variant="filled" isLoading={send.isPending} onClick={submit}>
            {t('exercizer.reminder.send')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

export default ReminderDialog;
