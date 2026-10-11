import { Heading } from '@open-ent/react';
import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { groupCopiesBySection, sectionScore } from '../../sections';
import { GrainCopy, ScheduledSection } from '../../types';

/**
 * La relecture d'une copie, groupée par section (sql/039) : chaque section ouvre sur son titre, sa
 * consigne et son sous-total (points obtenus / barème), puis ses grains. Sans section, la liste
 * est rendue telle quelle — l'écran d'avant.
 *
 * Partagé par la consultation (élève) et la correction (enseignant) : seul le rendu d'un grain
 * diffère, d'où `renderGrain`.
 */
export function SectionedReview({
  grainCopies,
  sections,
  renderGrain,
}: {
  grainCopies: GrainCopy[];
  sections: ScheduledSection[];
  renderGrain: (grainCopy: GrainCopy) => ReactNode;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const groups = groupCopiesBySection(grainCopies, sections);

  return (
    <div className="d-flex flex-column gap-24 mt-24">
      {groups.map((group) => {
        if (!group.section) {
          return (
            <div key="ungrouped" className="d-flex flex-column gap-24">
              {group.grains.map(renderGrain)}
            </div>
          );
        }
        const { score, max } = sectionScore(group.grains);
        return (
          <section key={group.section.id} className="d-flex flex-column gap-24">
            <header>
              <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-8">
                <Heading level="h3" headingStyle="h5" className="m-0">
                  {group.section.title}
                </Heading>
                <span className="text-muted">
                  {t('exercizer.section.subtotal')} <strong>{score}</strong> / {max}
                </span>
              </div>
              {group.section.description && (
                <div className="mt-8" dangerouslySetInnerHTML={{ __html: group.section.description }} />
              )}
            </header>
            {group.grains.map(renderGrain)}
          </section>
        );
      })}
    </div>
  );
}

export default SectionedReview;
