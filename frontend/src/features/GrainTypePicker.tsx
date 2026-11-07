import { useTranslation } from 'react-i18next';

import { GRAIN, preferredRank } from '../grains';
import { GrainType } from '../types';
import { GrainTypeIcon } from './GrainTypeIcon';

/**
 * Le choix du type de question — seconde étape d'un grain neuf (`chooseAnswer`).
 *
 * Les types sont rangés du plus courant au plus spécialisé, et non par identifiant : c'est l'ordre
 * de l'ancienne IHM, et il met le QCM en premier parce que c'est ce qu'on crée le plus souvent.
 *
 * Chaque choix est un BOUTON, pas une tuile cliquable : on parcourt donc la grille au clavier, ce
 * que l'ancienne IHM ne permettait pas.
 *
 * Sert aussi à CHANGER le type d'un grain déjà décidé (`currentTypeId`) : on y retire le type
 * actuel et le SCORM (un paquet se dépose, une question ne s'y convertit pas), et on y ajoute
 * l'énoncé, qu'une question peut redevenir.
 */
export function GrainTypePicker({
  grainTypes,
  currentTypeId,
  onPick,
}: {
  grainTypes: GrainType[];
  currentTypeId?: number;
  onPick: (grainTypeId: number) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);

  const choices = grainTypes
    .filter((type) =>
      currentTypeId === undefined
        ? type.is_in_list
        : (type.is_in_list || type.id === GRAIN.STATEMENT) &&
          type.id !== currentTypeId &&
          type.id !== GRAIN.SCORM,
    )
    .sort((a, b) => preferredRank(a.id) - preferredRank(b.id));

  return (
    <div className="grid gap-16" role="group" aria-label={t('exercizer.question.new')}>
      {choices.map((type) => (
        <button
          key={type.id}
          type="button"
          className="g-col-6 g-col-md-4 g-col-xl-3 btn btn-outline btn-tertiary d-flex flex-column align-items-center gap-8 p-16"
          onClick={() => onPick(type.id)}
        >
          <GrainTypeIcon name={type.name} size={56} />
          <span className="fw-bold text-center">{t(type.public_name)}</span>
        </button>
      ))}
    </div>
  );
}

export default GrainTypePicker;
