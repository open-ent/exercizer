import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Heading } from '@open-ent/react';
import { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { computedMaxScore } from '../grains';
import { EditorGroup, sectionMaxScore } from '../sections';
import { Grain, GrainType, Section } from '../types';
import { GrainOrganizerRow } from './GrainOrganizer';

/** La partie du sujet ouverte dans l'éditeur : une section, les grains hors section, ou tout. */
export type EditorFocus = number | 'ungrouped' | 'all';

export const focusOf = (section: Section | null): EditorFocus => section?.id ?? 'ungrouped';

/** Le libellé d'une section : son titre, sinon « Section n ». */
export function sectionLabel(
  section: Section,
  index: number,
  t: (key: string) => string,
): string {
  return section.title?.trim() || `${t('exercizer.section')} ${index + 1}`;
}

/**
 * Le sommaire d'un sujet À SECTIONS, dans la colonne de gauche — l'équivalent de la page
 * « structure » de LearnHouse : l'arbre sections → grains, le barème de chaque section, et de
 * quoi le réordonner.
 *
 * Tout se déplace avec ↑/↓ (accessible au clavier, comme `GrainOrganizer`) : une section emporte
 * ses grains, et un grain poussé au-delà du bord de sa section passe dans la voisine. Les sections
 * se déplacent AUSSI au glisser-déposer, par leur poignée ⠿ — à la souris, au doigt, ou au clavier
 * (Espace, flèches, Espace). Le groupe hors section reste en tête et ne se déplace pas.
 * Cliquer sur une section l'ouvre seule dans l'éditeur ; cliquer sur un grain y mène.
 */
export function SectionOrganizer({
  groups,
  grains,
  grainTypes,
  focus,
  onFocus,
  onSelectGrain,
  onMoveSection,
  onMoveSectionTo,
  onMoveGrain,
  onAddSection,
  isAdding,
}: {
  groups: EditorGroup[];
  grains: Grain[];
  grainTypes: GrainType[];
  focus: EditorFocus;
  onFocus: (focus: EditorFocus) => void;
  onSelectGrain: (grain: Grain) => void;
  onMoveSection: (sectionId: number, delta: -1 | 1) => void;
  /** Glisser-déposer : `to` est le rang d'arrivée parmi les sections (0 = la première). */
  onMoveSectionTo: (sectionId: number, to: number) => void;
  onMoveGrain: (grainId: number, delta: -1 | 1) => void;
  onAddSection: () => void;
  isAdding?: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const sectionGroups = groups.filter((group) => group.section);
  const flat = groups.flatMap((group) => group.grains);
  const firstId = flat[0]?.id;
  const lastId = flat[flat.length - 1]?.id;

  // Un petit seuil avant de démarrer : un simple clic sur la poignée ne déplace rien.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const sectionIds = sectionGroups.map((group) => group.section!.id);
  const labelOf = (id: UniqueIdentifier) => {
    const position = sectionIds.indexOf(Number(id));
    return position < 0 ? '' : sectionLabel(sectionGroups[position].section!, position, t);
  };
  const rankOf = (id: UniqueIdentifier) => sectionIds.indexOf(Number(id)) + 1;

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const to = sectionIds.indexOf(Number(over.id));
    if (to >= 0) onMoveSectionTo(Number(active.id), to);
  };

  const renderGroup = (group: EditorGroup, handle?: ReactNode) => {
    const position = group.section ? sectionGroups.indexOf(group) : -1;
    const groupFocus = focusOf(group.section);
    const label = group.section
      ? sectionLabel(group.section, position, t)
      : t('exercizer.section.ungrouped');
    const selected = focus === groupFocus;
    return (
      <>
        <div className="d-flex align-items-center gap-8">
          {handle}
          <button
            type="button"
            className={`btn btn-sm flex-fill text-start text-truncate fw-bold ${
              selected ? 'btn-filled btn-secondary' : 'btn-ghost btn-tertiary'
            }`}
            aria-current={selected ? 'true' : undefined}
            onClick={() => onFocus(groupFocus)}
          >
            {label}
            <small className="ms-8 fw-normal">
              {sectionMaxScore(group.grains)} {t('exercizer.section.points')}
            </small>
          </button>
          {group.section && (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-tertiary btn-sm"
                aria-label={`${t('exercizer.sequence.item.moveUp')} — ${label}`}
                disabled={position === 0}
                onClick={() => onMoveSection(group.section!.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-tertiary btn-sm"
                aria-label={`${t('exercizer.sequence.item.moveDown')} — ${label}`}
                disabled={position === sectionGroups.length - 1}
                onClick={() => onMoveSection(group.section!.id, 1)}
              >
                ↓
              </button>
            </>
          )}
        </div>
        {group.grains.length > 0 && (
          <ol className="list-unstyled d-flex flex-column gap-4 ps-16">
            {group.grains.map((grain) => (
              <GrainOrganizerRow
                key={grain.id}
                grain={grain}
                grains={grains}
                grainTypes={grainTypes}
                onSelect={onSelectGrain}
                onUp={grain.id === firstId ? undefined : () => onMoveGrain(grain.id, -1)}
                onDown={grain.id === lastId ? undefined : () => onMoveGrain(grain.id, 1)}
              />
            ))}
          </ol>
        )}
      </>
    );
  };

  const ungrouped = groups.find((group) => !group.section);

  return (
    <section>
      <Heading level="h2" headingStyle="h4" className="mb-8">
        {t('exercizer.rank')}
      </Heading>
      <p className="mb-8">
        {t('exercizer.score.total')} <strong>{computedMaxScore(grains)}</strong>
      </p>
      <button
        type="button"
        className={`btn btn-sm mb-16 ${focus === 'all' ? 'btn-filled btn-secondary' : 'btn-ghost btn-tertiary'}`}
        aria-pressed={focus === 'all'}
        onClick={() => onFocus('all')}
      >
        {t('exercizer.section.show.all')}
      </button>

      <ol className="list-unstyled d-flex flex-column gap-12">
        {/* Le groupe hors section n'apparaît que s'il porte des grains. */}
        {ungrouped && ungrouped.grains.length > 0 && (
          <li className="d-flex flex-column gap-4">{renderGroup(ungrouped)}</li>
        )}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            screenReaderInstructions: { draggable: t('exercizer.section.drag.instructions') },
            announcements: {
              onDragStart: ({ active }) => `${t('exercizer.section.drag.start')} ${labelOf(active.id)}`,
              onDragOver: ({ over }) => (over ? `${t('exercizer.section.drag.over')} ${rankOf(over.id)}` : undefined),
              onDragEnd: ({ over }) => (over ? `${t('exercizer.section.drag.end')} ${rankOf(over.id)}` : undefined),
              onDragCancel: ({ active }) => `${t('exercizer.section.drag.cancel')} ${labelOf(active.id)}`,
            },
          }}
        >
          <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
            {sectionGroups.map((group, position) => (
              <SortableSection
                key={group.section!.id}
                id={group.section!.id}
                label={sectionLabel(group.section!, position, t)}
              >
                {(handle) => renderGroup(group, handle)}
              </SortableSection>
            ))}
          </SortableContext>
        </DndContext>
      </ol>

      <Button
        color="primary"
        variant="outline"
        className="mt-16"
        isLoading={isAdding}
        onClick={onAddSection}
      >
        {t('exercizer.section.new')}
      </Button>
    </section>
  );
}

/**
 * Une section déplaçable : la ligne entière suit le pointeur, mais seule la poignée ⠿ la saisit —
 * le reste de la ligne garde ses clics (ouvrir la section, mener à un grain, ↑/↓).
 */
function SortableSection({
  id,
  label,
  children,
}: {
  id: number;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
    // Translate, pas Transform : les sections n'ont pas la même hauteur, une mise à l'échelle
    // écraserait leurs grains pendant le déplacement.
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: 'relative',
    zIndex: isDragging ? 2 : undefined,
  };
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className="btn btn-ghost btn-tertiary btn-sm"
      style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      aria-label={`${t('exercizer.section.drag')} — ${label}`}
      title={t('exercizer.section.drag')}
      {...attributes}
      {...listeners}
    >
      ⠿
    </button>
  );
  return (
    <li ref={setNodeRef} style={style} className="d-flex flex-column gap-4" data-section-id={id}>
      {children(handle)}
    </li>
  );
}

export default SectionOrganizer;
