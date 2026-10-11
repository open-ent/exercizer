import { Button, FormControl, Input, Label } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import { Section } from '../types';
import { RichTextEditor } from './RichTextEditor';

/**
 * En-tête d'une section dans l'éditeur : titre et consigne (enregistrés au fil de la frappe, comme
 * les grains), barème de la section, et ses actions.
 */
export function SectionHeader({
  section,
  label,
  maxScore,
  onChange,
  onDuplicate,
  onRemove,
  isDuplicating,
}: {
  section: Section;
  /** Libellé affiché quand le titre est vide (« Section 2 »). */
  label: string;
  maxScore: number;
  onChange: (section: Section) => void;
  onDuplicate: (section: Section) => void;
  onRemove: (section: Section) => void;
  isDuplicating?: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);

  return (
    <header className="card p-16 mb-16 border-secondary" id={`section-edit-${section.id}`}>
      <div className="d-flex flex-wrap align-items-end gap-16 mb-16">
        <FormControl id={`section-title-${section.id}`} className="flex-fill">
          <Label>{t('exercizer.section.title')}</Label>
          <Input
            type="text"
            size="md"
            maxLength={255}
            placeholder={label}
            value={section.title ?? ''}
            onChange={(event) => onChange({ ...section, title: event.target.value })}
          />
        </FormControl>
        <span className="text-muted pb-8">
          {t('exercizer.section.score')} <strong>{maxScore}</strong>
        </span>
      </div>

      <FormControl id={`section-description-${section.id}`}>
        <Label>{t('exercizer.section.description')}</Label>
        {/* La clé force un éditeur neuf par section : le composant du socle ne relit pas
            `content` après son montage. */}
        <RichTextEditor
          key={section.id}
          content={section.description ?? ''}
          placeholder={t('exercizer.section.description.placeholder')}
          onChange={(description) => onChange({ ...section, description })}
        />
      </FormControl>

      <footer className="d-flex justify-content-end gap-8 mt-16">
        <Button
          color="tertiary"
          variant="ghost"
          isLoading={isDuplicating}
          onClick={() => onDuplicate(section)}
        >
          {t('exercizer.section.duplicate')}
        </Button>
        <Button color="danger" variant="ghost" onClick={() => onRemove(section)}>
          {t('exercizer.section.remove')}
        </Button>
      </footer>
    </header>
  );
}

export default SectionHeader;
