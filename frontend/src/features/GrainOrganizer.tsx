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
import { IconArrowDown, IconArrowUp } from '@open-ent/react/icons';
import { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import {
  byOrder,
  computedMaxScore,
  GRAIN,
  grainDisplayName,
  isQuestion,
  questionNumber,
  sanitizeScore,
} from '../grains';
import { Grain, GrainType } from '../types';
import { GrainTypeIcon } from './GrainTypeIcon';

/**
 * Le PLAN du sujet, dans la colonne de gauche : le barème total, et la liste des grains dans
 * l'ordre où l'élève les verra.
 *
 * Deux services : s'y repérer dans un sujet long (chaque ligne mène à son grain, la ligne du grain
 * en cours d'édition est surlignée), et le RÉORDONNER — au glisser-déposer par la poignée ⠿ (souris,
 * doigt, ou clavier : Espace, flèches, Espace), par Alt+↑/↓ sur une ligne, ou par ses deux boutons.
 *
 * Sujet SANS section seulement : un sujet à sections a son propre sommaire (`SectionOrganizer`).
 */
export function GrainOrganizer({
  grains,
  grainTypes,
  activeId,
  onMove,
  onSelect,
}: {
  grains: Grain[];
  grainTypes: GrainType[];
  /** Le grain en cours d'édition, surligné dans le plan. */
  activeId?: number | null;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSelect: (grain: Grain) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const ordered = byOrder(grains);
  const ids = ordered.map((grain) => grain.id);

  // Un petit seuil avant de démarrer : un simple clic sur la poignée ne déplace rien.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const rankOf = (id: UniqueIdentifier) => ids.indexOf(Number(id)) + 1;
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from >= 0 && to >= 0) onMove(from, to);
  };

  return (
    <section>
      <PlanHeader total={computedMaxScore(grains)} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: t('exercizer.section.drag.instructions') },
          announcements: {
            onDragStart: ({ active }) => `${t('exercizer.section.drag.start')} ${rankOf(active.id)}`,
            onDragOver: ({ over }) => (over ? `${t('exercizer.section.drag.over')} ${rankOf(over.id)}` : undefined),
            onDragEnd: ({ over }) => (over ? `${t('exercizer.section.drag.end')} ${rankOf(over.id)}` : undefined),
            onDragCancel: ({ active }) => `${t('exercizer.section.drag.cancel')} ${rankOf(active.id)}`,
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="list-unstyled d-flex flex-column gap-4 m-0">
            {ordered.map((grain, index) => (
              <SortableGrainRow key={grain.id} id={grain.id}>
                {(handle) => (
                  <GrainOrganizerRow
                    grain={grain}
                    grains={grains}
                    grainTypes={grainTypes}
                    active={grain.id === activeId}
                    handle={handle}
                    onSelect={onSelect}
                    onUp={index === 0 ? undefined : () => onMove(index, index - 1)}
                    onDown={index === ordered.length - 1 ? undefined : () => onMove(index, index + 1)}
                  />
                )}
              </SortableGrainRow>
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </section>
  );
}

/** L'en-tête du plan : son titre, et le barème total du sujet. */
export function PlanHeader({ total }: { total: number }) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <div className="d-flex align-items-baseline justify-content-between gap-8 mb-12">
      <h2 className="h4 m-0">{t('exercizer.plan', { defaultValue: 'Plan' })}</h2>
      <span className="small text-gray-700">
        {t('exercizer.plan.total', { total, defaultValue: '[[total]] points au total' })}
      </span>
    </div>
  );
}

/** Une ligne déplaçable : seule la poignée la saisit, le reste garde ses clics. */
function SortableGrainRow({ id, children }: { id: number; children: (handle: ReactNode) => ReactNode }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: CSSProperties = {
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
      className="btn btn-ghost btn-tertiary btn-sm px-4 exercizer-plan-handle"
      style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
      aria-label={t('exercizer.plan.drag', { defaultValue: 'Glisser pour déplacer' })}
      title={t('exercizer.plan.drag', { defaultValue: 'Glisser pour déplacer' })}
      {...attributes}
      {...listeners}
    >
      ⠿
    </button>
  );
  return (
    <li ref={setNodeRef} style={style}>
      {children(handle)}
    </li>
  );
}

/**
 * Une ligne du plan : la poignée (glisser-déposer, quand le plan le permet), l'icône du type, le
 * libellé (numéroté pour une question) qui mène au grain, ses points, et les deux boutons de
 * déplacement — désactivés quand le rappel est absent. Alt+↑/↓ sur le libellé fait de même.
 */
export function GrainOrganizerRow({
  grain,
  grains,
  grainTypes,
  active = false,
  handle,
  onSelect,
  onUp,
  onDown,
}: {
  grain: Grain;
  grains: Grain[];
  grainTypes: GrainType[];
  active?: boolean;
  handle?: ReactNode;
  onSelect: (grain: Grain) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const type = grainTypes.find((item) => item.id === grain.grain_type_id);
  const typeName = type ? t(type.public_name) : '';
  const name = grainDisplayName(grain, typeName);
  const label =
    grain.grain_type_id === GRAIN.CHOOSE_ANSWER
      ? t('exercizer.question.new')
      : isQuestion(grain.grain_type_id)
        ? `${questionNumber(grain, grains)}) ${name}`
        : name;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp' && onUp) {
      event.preventDefault();
      onUp();
    } else if (event.key === 'ArrowDown' && onDown) {
      event.preventDefault();
      onDown();
    }
  };

  return (
    <div className={`exercizer-plan-row d-flex align-items-center gap-4${active ? ' is-active' : ''}`}>
      {handle}
      {type && <GrainTypeIcon name={type.name} size={18} />}
      <button
        type="button"
        className="btn btn-ghost btn-tertiary btn-sm flex-fill text-start text-truncate"
        style={{ minWidth: 0 }}
        aria-current={active ? 'true' : undefined}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        title={label}
        onClick={() => onSelect(grain)}
        onKeyDown={onKeyDown}
      >
        {label}
      </button>
      {isQuestion(grain.grain_type_id) && (
        <small className="text-gray-700 text-nowrap">
          {sanitizeScore(grain.grain_data?.max_score)} {t('exercizer.section.points')}
        </small>
      )}
      <span className="exercizer-plan-moves d-flex">
        <button
          type="button"
          className="btn btn-ghost btn-tertiary btn-sm px-4"
          aria-label={`${t('exercizer.sequence.item.moveUp')} — ${name}`}
          title={t('exercizer.sequence.item.moveUp')}
          disabled={!onUp}
          onClick={onUp}
        >
          <IconArrowUp style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-tertiary btn-sm px-4"
          aria-label={`${t('exercizer.sequence.item.moveDown')} — ${name}`}
          title={t('exercizer.sequence.item.moveDown')}
          disabled={!onDown}
          onClick={onDown}
        >
          <IconArrowDown style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

export default GrainOrganizer;
