import { Heading, Modal } from '@open-ent/react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { SubjectScheduled } from '../types';

/**
 * À qui le sujet a été distribué — portage de `subject-scheduled-assign-at`.
 *
 * Les vignettes et les en-têtes n'affichent que les premiers destinataires ; cette fenêtre donne
 * la liste entière, et les élèves retirés de la distribution après coup.
 */
export function RecipientsDialog({
  scheduled,
  onClose,
}: {
  scheduled: SubjectScheduled;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const groups = scheduled.scheduled_at?.groupList ?? [];
  const users = scheduled.scheduled_at?.userList ?? [];
  const excluded = scheduled.scheduled_at?.exclude ?? [];

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="sm" scrollable>
      <Modal.Header onModalClose={onClose}>{t('exercizer.scheduled.assign.header')}</Modal.Header>
      <Modal.Body>
        <ul className="list-unstyled d-flex flex-column gap-4 mb-0">
          {groups.map((group, index) => (
            <li key={`g${group._id ?? index}`}>
              <strong>{group.name}</strong>
            </li>
          ))}
          {users.map((user, index) => (
            <li key={`u${user._id ?? index}`}>{user.name}</li>
          ))}
        </ul>
        {excluded.length > 0 && (
          <>
            <Heading level="h3" headingStyle="h5" className="mt-16 mb-8">
              {t('exercizer.scheduled.assign.exclude')}
            </Heading>
            <ul className="list-unstyled d-flex flex-column gap-4 mb-0">
              {excluded.map((user, index) => (
                <li key={`x${user._id ?? index}`}>{user.name}</li>
              ))}
            </ul>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}

export default RecipientsDialog;
