/** Mise en forme des dates et petits utilitaires partagés par les écrans. */

/**
 * `dd/MM/yyyy à HH:mm` — la forme qu'affichait l'IHM AngularJS (filtres `date` + clé
 * `exercizer.at`). Le séparateur est passé par l'appelant, qui seul a accès à l'i18n.
 */
export function formatDateTime(value?: string | null, at = 'à'): string {
  const date = parse(value);
  if (!date) return '';
  return `${formatDate(value)} ${at} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `dd/MM/yyyy`. */
export function formatDate(value?: string | null): string {
  const date = parse(value);
  if (!date) return '';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** Valeur d'un `<input type="date">` : `yyyy-MM-dd`, en heure LOCALE (pas `toISOString`). */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Lecture d'un `<input type="date">` : minuit local, ou `null` si le champ est vide. */
export function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function parse(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
