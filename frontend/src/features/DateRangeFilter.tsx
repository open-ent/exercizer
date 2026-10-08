import { useTranslation } from 'react-i18next';

import { fromDateInputValue, toDateInputValue } from '../utils';

export interface DateRange {
  begin: Date | null;
  end: Date | null;
}

/**
 * Le couple « Du … Au … » des listes de copies.
 *
 * Champs `<input type="date">` natifs plutôt que le `DatePicker` du socle : ce filtre est une
 * BORNE, pas une saisie — le clavier y est plus rapide que le calendrier, et le champ natif
 * apporte la localisation du format et l'accessibilité sans code. L'IHM AngularJS utilisait son
 * propre `date-picker` faute d'équivalent natif à l'époque.
 */
export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <div className="d-flex align-items-center gap-8 flex-wrap">
      <label className="d-flex align-items-center gap-4">
        <span className="text-nowrap">{t('exercizer.date.from')}</span>
        <input
          type="date"
          className="form-control"
          value={toDateInputValue(value.begin)}
          onChange={(event) =>
            onChange({ ...value, begin: fromDateInputValue(event.target.value) })
          }
        />
      </label>
      <label className="d-flex align-items-center gap-4">
        <span className="text-nowrap">{t('exercizer.date.to')}</span>
        <input
          type="date"
          className="form-control"
          value={toDateInputValue(value.end)}
          onChange={(event) => onChange({ ...value, end: fromDateInputValue(event.target.value) })}
        />
      </label>
    </div>
  );
}

export default DateRangeFilter;
