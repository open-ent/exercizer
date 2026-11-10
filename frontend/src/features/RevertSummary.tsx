import { useTranslation } from 'react-i18next';

import { GRAIN, grainDisplayName, isQuestion, questionNumber } from '../grains';
import { SnapshotDiff } from '../revert';
import { Grain, GrainType, Section } from '../types';
import { sectionLabel } from './SectionOrganizer';

/**
 * Ce qu'« Annuler les modifications » va défaire, énuméré avant confirmation : on ne supprime pas
 * des questions, ni n'en rétablit, sans les nommer.
 *
 * Chaque grain est nommé comme dans le sommaire, et numéroté dans la version du sujet où il existe :
 * l'actuelle pour un ajout, celle de l'ouverture pour une suppression ou une modification.
 */
export function RevertSummary({
  diff,
  grainsBefore,
  grainsNow,
  sectionsBefore,
  sectionsNow,
  grainTypes,
}: {
  diff: SnapshotDiff;
  grainsBefore: Grain[];
  grainsNow: Grain[];
  sectionsBefore: Section[];
  sectionsNow: Section[];
  grainTypes: GrainType[];
}) {
  const { t } = useTranslation(['exercizer', 'common']);

  const grainLabel = (grain: Grain, grains: Grain[]) => {
    if (grain.grain_type_id === GRAIN.CHOOSE_ANSWER) return t('exercizer.question.new');
    const type = grainTypes.find((item) => item.id === grain.grain_type_id);
    const name = grainDisplayName(grain, type ? t(type.public_name) : '');
    return isQuestion(grain.grain_type_id) ? `${questionNumber(grain, grains)}) ${name}` : name;
  };
  const partLabel = (section: Section, sections: Section[]) =>
    sectionLabel(
      section,
      [...sections].sort((a, b) => a.order_by - b.order_by).findIndex((item) => item.id === section.id),
      t,
    );

  const groups = [
    { key: 'exercizer.revert.sections.added', items: diff.addedSections.map((s) => partLabel(s, sectionsNow)) },
    { key: 'exercizer.revert.sections.removed', items: diff.removedSections.map((s) => partLabel(s, sectionsBefore)) },
    { key: 'exercizer.revert.sections.modified', items: diff.modifiedSections.map((s) => partLabel(s, sectionsBefore)) },
    { key: 'exercizer.revert.grains.added', items: diff.addedGrains.map((g) => grainLabel(g, grainsNow)) },
    { key: 'exercizer.revert.grains.removed', items: diff.removedGrains.map((g) => grainLabel(g, grainsBefore)) },
    { key: 'exercizer.revert.grains.modified', items: diff.modifiedGrains.map((g) => grainLabel(g, grainsBefore)) },
  ].filter((group) => group.items.length > 0);

  return (
    <div data-testid="revert-summary">
      <p>{t('exercizer.revert.intro')}</p>
      {groups.map((group) => (
        <div key={group.key} className="mb-12">
          <strong>{t(group.key)}</strong>
          <ul className="mb-0">
            {group.items.map((label, index) => (
              <li key={index}>{label}</li>
            ))}
          </ul>
        </div>
      ))}
      {diff.reordered && <p className="mb-12">{t('exercizer.revert.reordered')}</p>}
      <p className="text-muted small mb-0">{t('exercizer.revert.excluded')}</p>
    </div>
  );
}

export default RevertSummary;
