import { Button } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import { groupLevels, sortDisciplines, toggleId } from '../catalog';
import { CatalogReferential, Classification } from '../types';

/**
 * Choix des niveaux et des matières d'un sujet : des boutons bascule, les niveaux groupés dans
 * l'ordre de la scolarité (maternelle, élémentaire, collège…). Plusieurs choix possibles dans
 * chaque famille — un même sujet vaut souvent pour le CE2 et le CM1.
 */
export function ClassificationPicker({
  referential,
  value,
  onChange,
}: {
  referential: CatalogReferential;
  value: Classification;
  onChange: (value: Classification) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const translate = (key: string) => t(key);

  return (
    <div className="d-flex flex-column gap-16">
      <fieldset>
        {/* `float-none` : Bootstrap fait flotter une <legend>, ce qui renvoyait le bloc suivant
            dans une colonne étroite à côté d'elle. */}
        <legend className="h5 mb-8 float-none">{t('exercizer.catalog.levels')}</legend>
        {groupLevels(referential.levels).map(({ group, levels }) => (
          <div key={group} className="mb-8">
            <div className="small text-muted mb-4">{t(`exercizer.catalog.group.${group}`)}</div>
            <div className="d-flex flex-wrap gap-8">
              {levels.map((level) => {
                const selected = value.level_ids.includes(level.id);
                return (
                  <Button
                    key={level.id}
                    size="sm"
                    color="primary"
                    variant={selected ? 'filled' : 'outline'}
                    aria-pressed={selected}
                    onClick={() => onChange({ ...value, level_ids: toggleId(value.level_ids, level.id) })}
                  >
                    {t(level.label)}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
      <fieldset>
        {/* `float-none` : Bootstrap fait flotter une <legend>, ce qui renvoyait le bloc suivant
            dans une colonne étroite à côté d'elle. */}
        <legend className="h5 mb-8 float-none">{t('exercizer.catalog.disciplines')}</legend>
        <div className="d-flex flex-wrap gap-8">
          {sortDisciplines(referential.disciplines, translate).map((discipline) => {
            const selected = value.discipline_ids.includes(discipline.id);
            return (
              <Button
                key={discipline.id}
                size="sm"
                color="secondary"
                variant={selected ? 'filled' : 'outline'}
                aria-pressed={selected}
                onClick={() =>
                  onChange({ ...value, discipline_ids: toggleId(value.discipline_ids, discipline.id) })
                }
              >
                {t(discipline.label)}
              </Button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
