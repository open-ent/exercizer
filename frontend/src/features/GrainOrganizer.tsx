import { Heading } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import { byOrder, computedMaxScore, GRAIN, grainDisplayName, isQuestion, questionNumber } from '../grains';
import { Grain, GrainType } from '../types';
import { GrainTypeIcon } from './GrainTypeIcon';

/**
 * Le « résumé » du sujet, dans la colonne de gauche : le barème total, et la liste des grains
 * dans l'ordre où l'élève les verra.
 *
 * Deux services : s'y repérer dans un sujet long (chaque ligne mène à son grain), et le
 * RÉORDONNER. L'ancienne IHM le faisait au glisser-déposer ; ici deux boutons déplacent la ligne,
 * ce qui fonctionne aussi au clavier.
 *
 * Sujet SANS section seulement : un sujet à sections a son propre sommaire (`SectionOrganizer`).
 */
export function GrainOrganizer({
  grains,
  grainTypes,
  onMove,
  onSelect,
}: {
  grains: Grain[];
  grainTypes: GrainType[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onSelect: (grain: Grain) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const ordered = byOrder(grains);

  return (
    <section>
      <Heading level="h2" headingStyle="h4" className="mb-8">
        {t('exercizer.rank')}
      </Heading>
      <p className="mb-16">
        {t('exercizer.score.total')} <strong>{computedMaxScore(grains)}</strong>
      </p>

      <ol className="list-unstyled d-flex flex-column gap-4">
        {ordered.map((grain, index) => (
          <GrainOrganizerRow
            key={grain.id}
            grain={grain}
            grains={grains}
            grainTypes={grainTypes}
            onSelect={onSelect}
            onUp={index === 0 ? undefined : () => onMove(index, index - 1)}
            onDown={index === ordered.length - 1 ? undefined : () => onMove(index, index + 1)}
          />
        ))}
      </ol>
    </section>
  );
}

/**
 * Une ligne du sommaire : l'icône du type, le libellé (numéroté pour une question) qui mène au
 * grain, et les deux boutons de déplacement — désactivés quand le rappel est absent.
 */
export function GrainOrganizerRow({
  grain,
  grains,
  grainTypes,
  onSelect,
  onUp,
  onDown,
}: {
  grain: Grain;
  grains: Grain[];
  grainTypes: GrainType[];
  onSelect: (grain: Grain) => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const type = grainTypes.find((item) => item.id === grain.grain_type_id);
  const typeName = type ? t(type.public_name) : '';
  const name = grainDisplayName(grain, typeName);

  return (
    <li className="d-flex align-items-center gap-8">
      {type && <GrainTypeIcon name={type.name} size={18} />}
      <button
        type="button"
        className="btn btn-ghost btn-tertiary btn-sm flex-fill text-start text-truncate"
        onClick={() => onSelect(grain)}
      >
        {grain.grain_type_id === GRAIN.CHOOSE_ANSWER
          ? t('exercizer.question.new')
          : isQuestion(grain.grain_type_id)
            ? `${questionNumber(grain, grains)}) ${name}`
            : name}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-tertiary btn-sm"
        aria-label={`${t('exercizer.sequence.item.moveUp')} — ${name}`}
        disabled={!onUp}
        onClick={onUp}
      >
        ↑
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-tertiary btn-sm"
        aria-label={`${t('exercizer.sequence.item.moveDown')} — ${name}`}
        disabled={!onDown}
        onClick={onDown}
      >
        ↓
      </button>
    </li>
  );
}

export default GrainOrganizer;
