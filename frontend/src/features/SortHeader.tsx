import { Table } from '@open-ent/react';
import { ReactNode } from 'react';

import { SortState } from '../corrections';

/**
 * En-tête de colonne triable.
 *
 * L'IHM AngularJS posait le `ng-click` sur le `<th>` : inatteignable au clavier, et rien ne
 * disait au lecteur d'écran dans quel sens la colonne était triée. Ici c'est un vrai bouton, et
 * `aria-sort` porte l'état.
 */
export function SortHeader<Field extends string>({
  field,
  sort,
  onSort,
  className,
  children,
}: {
  field: Field;
  sort: SortState<Field>;
  onSort: (field: Field) => void;
  className?: string;
  children: ReactNode;
}) {
  const active = sort.field === field;
  return (
    <Table.Th
      className={className}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="btn btn-link p-0 text-reset text-decoration-none fw-bold d-inline-flex align-items-center gap-4"
        onClick={() => onSort(field)}
      >
        {children}
        <span aria-hidden="true">{active ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </Table.Th>
  );
}

export default SortHeader;
