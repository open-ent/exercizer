import { Tree } from '@open-ent/react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Folder } from '../types';

/** Identifiant de la racine dans l'arbre. `null` côté serveur, une chaîne ici. */
export const ROOT_ID = 'root';

export interface FolderTreeProps {
  folders: Folder[];
  /** `null` = racine. */
  currentFolderId: number | null;
  onSelect: (folderId: number | null) => void;
}

/**
 * L'arborescence des dossiers de sujets, dans la colonne de gauche.
 *
 * Portage de `folder-nav-item` / `folder-nav-container`. L'arbre est reconstruit à partir de la
 * liste PLATE que renvoie `GET /exercizer/folders` : le serveur ne donne que `parent_folder_id`.
 */
export function FolderTree({ folders, currentFolderId, onSelect }: FolderTreeProps) {
  const { t } = useTranslation(['exercizer', 'common']);

  const nodes = useMemo(() => {
    const byParent = new Map<number | null, Folder[]>();
    for (const folder of folders) {
      const parent = folder.parent_folder_id ?? null;
      byParent.set(parent, [...(byParent.get(parent) ?? []), folder]);
    }
    const build = (parent: number | null): Array<{ id: string; name: string; children: any[] }> =>
      (byParent.get(parent) ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
        .map((folder) => ({
          id: String(folder.id),
          name: folder.label,
          children: build(folder.id),
        }));

    return {
      id: ROOT_ID,
      name: t('exercizer.dashboard.learner.tab1'),
      section: true,
      children: build(null),
    };
  }, [folders, t]);

  return (
    <Tree
      nodes={nodes}
      showIcon
      selectedNodeId={currentFolderId === null ? ROOT_ID : String(currentFolderId)}
      onTreeItemClick={(nodeId) => onSelect(nodeId === ROOT_ID ? null : Number(nodeId))}
    />
  );
}

export default FolderTree;
