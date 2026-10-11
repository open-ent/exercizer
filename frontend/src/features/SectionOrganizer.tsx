import { Button, Heading } from '@open-ent/react';
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
 * ses grains, et un grain poussé au-delà du bord de sa section passe dans la voisine.
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
  onMoveGrain: (grainId: number, delta: -1 | 1) => void;
  onAddSection: () => void;
  isAdding?: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const sectionGroups = groups.filter((group) => group.section);
  const flat = groups.flatMap((group) => group.grains);
  const firstId = flat[0]?.id;
  const lastId = flat[flat.length - 1]?.id;

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
        {groups.map((group) => {
          // Le groupe hors section n'apparaît que s'il porte des grains.
          if (!group.section && group.grains.length === 0) return null;
          const position = group.section ? sectionGroups.indexOf(group) : -1;
          const groupFocus = focusOf(group.section);
          const label = group.section
            ? sectionLabel(group.section, position, t)
            : t('exercizer.section.ungrouped');
          const selected = focus === groupFocus;
          return (
            <li key={group.section?.id ?? 'ungrouped'} className="d-flex flex-column gap-4">
              <div className="d-flex align-items-center gap-8">
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
            </li>
          );
        })}
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

export default SectionOrganizer;
