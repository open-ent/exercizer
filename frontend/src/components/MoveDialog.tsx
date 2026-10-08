import { Button, Modal, Select } from '@open-ent/react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Folder } from '../types';

/** Identifiant de la racine dans la liste déroulante — `null` côté serveur. */
const ROOT = '';

/**
 * Choix du dossier de destination — portage de `teacher-dashboard-move.html`.
 *
 * La liste est à PLAT, chaque dossier affiché avec son chemin complet : une liste déroulante ne
 * sait pas rendre une arborescence, et le chemin lève l'ambiguïté entre deux dossiers homonymes
 * rangés à des endroits différents.
 */
export function MoveDialog({
  folders,
  onConfirm,
  onClose,
}: {
  folders: Folder[];
  onConfirm: (targetFolderId: number | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [target, setTarget] = useState<string>(ROOT);
  const id = useId();

  const path = (folder: Folder): string => {
    const parts = [folder.label];
    let parent = folder.parent_folder_id;
    // Garde-fou : une boucle dans `parent_folder_id` (données abîmées) ne doit pas figer l'écran.
    const seen = new Set<number>([folder.id]);
    while (parent !== null && parent !== undefined && !seen.has(parent)) {
      seen.add(parent);
      const next = folders.find((f) => f.id === parent);
      if (!next) break;
      parts.unshift(next.label);
      parent = next.parent_folder_id;
    }
    return parts.join(' / ');
  };

  const options = [
    { value: ROOT, label: t('exercizer.root.folder') },
    ...folders
      .map((folder) => ({ value: String(folder.id), label: path(folder) }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
  ];

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="sm">
      <Modal.Header onModalClose={onClose}>{t('exercizer.move.title')}</Modal.Header>
      <Modal.Body>
        <p>{t('exercizer.folder.target')}</p>
        <Select
          block
          options={options}
          selectedValue={target}
          onValueChange={(option) =>
            setTarget(typeof option === 'string' ? option : (option?.value ?? ROOT))
          }
          placeholderOption={t('exercizer.root.folder')}
        />
        <p className="text-muted mt-8">
          <small>{t('exercizer.folder.notarget')}</small>
        </p>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          onClick={() => onConfirm(target === ROOT ? null : Number(target))}
        >
          {t('exercizer.move')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default MoveDialog;
