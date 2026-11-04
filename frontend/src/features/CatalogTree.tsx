import { Badge, Tree } from '@open-ent/react';

import { CatalogTreeItem } from '../catalog';

export interface CatalogTreeProps {
  items: CatalogTreeItem[];
  selectedId: string | null;
  onSelect: (item: CatalogTreeItem) => void;
  /** Un nœud déplié (vue sommaire : on charge alors ses exercices). */
  onUnfold?: (id: string) => void;
}

/**
 * L'arbre du catalogue, quel que soit son rangement (programme, niveau, matière) : chaque nœud
 * porte son code éventuel (C2.MAT.1.2) et le nombre d'exercices qu'il couvre ; en vue sommaire,
 * les exercices eux-mêmes en sont les feuilles.
 */
export function CatalogTree({ items, selectedId, onSelect, onUnfold }: CatalogTreeProps) {
  const byId = new Map<string, CatalogTreeItem>();
  const index = (list: CatalogTreeItem[]) =>
    list.forEach((item) => {
      byId.set(item.id, item);
      index(item.children);
    });
  index(items);

  return (
    <Tree
      nodes={items}
      selectedNodeId={selectedId ?? undefined}
      onTreeItemClick={(id) => {
        const item = byId.get(id);
        if (item) onSelect(item);
      }}
      onTreeItemUnfold={onUnfold}
      renderNode={({ node }) => <CatalogTreeNode item={node as CatalogTreeItem} />}
    />
  );
}

function CatalogTreeNode({ item }: { item: CatalogTreeItem }) {
  if (item.kind === 'loading') {
    return <span className="small text-muted fst-italic">{item.name}</span>;
  }
  if (item.kind === 'subject' || item.kind === 'more') {
    return (
      <span className="text-truncate text-primary" title={item.name}>
        {item.name}
      </span>
    );
  }
  return (
    <span className="d-flex align-items-center gap-8 w-100" style={{ minWidth: 0 }}>
      {item.code && <span className="small text-muted flex-shrink-0">{item.code}</span>}
      <span className="text-truncate flex-fill" title={item.name}>
        {item.name}
      </span>
      {item.count > 0 && (
        <Badge className="flex-shrink-0" variant={{ type: 'content', level: 'info', background: true }}>
          {item.count}
        </Badge>
      )}
    </span>
  );
}

export default CatalogTree;
