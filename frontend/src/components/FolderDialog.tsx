import { Button, FormControl, Input, Label, Modal } from '@open-ent/react';
import { FormEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Folder } from '../types';

/**
 * Création et renommage d'un dossier — portage de `teacher-dashboard-folder-edit.html`.
 * Un dossier n'a qu'un intitulé ; son emplacement est celui où on l'a créé.
 */
export function FolderDialog({
  folder,
  onSave,
  onClose,
}: {
  folder?: Folder;
  onSave: (label: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [label, setLabel] = useState(folder?.label ?? '');
  const id = useId();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = label.trim();
    if (!trimmed) return;
    onSave(trimmed);
  };

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="sm">
      <Modal.Header onModalClose={onClose}>
        {folder ? t('exercizer.folderedit.title.edit') : t('exercizer.folderedit.title.create')}
      </Modal.Header>
      <form onSubmit={submit}>
        <Modal.Body>
          <FormControl id={`${id}-label`}>
            <Label>{t('exercizer.folder')}</Label>
            <Input
              type="text"
              size="md"
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </FormControl>
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" color="tertiary" variant="ghost" onClick={onClose}>
            {t('exercizer.cancel')}
          </Button>
          <Button type="submit" color="primary" variant="filled" disabled={!label.trim()}>
            {folder ? t('exercizer.folderedit.update') : t('exercizer.create')}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}

export default FolderDialog;
