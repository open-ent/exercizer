import { CatalogDiscipline, CatalogLevel, Classification, LevelGroup } from './types';

/**
 * Règles du catalogue d'exercices et du classement par niveau et matière, hors de tout écran.
 *
 * Le référentiel garde des libellés en clés i18n (`exercizer.subject.lesson.levelN`) : on traduit
 * toujours avant de trier ou d'afficher.
 */

/** L'ordre des groupes de niveaux, celui de la scolarité. */
export const LEVEL_GROUPS: LevelGroup[] = [
  'maternelle',
  'elementaire',
  'college',
  'lycee',
  'lycee_pro',
  'superieur',
];

/** Les niveaux rangés par groupe, chaque groupe dans l'ordre de la scolarité ; les groupes vides sont omis. */
export function groupLevels(
  levels: CatalogLevel[],
): { group: LevelGroup | 'other'; levels: CatalogLevel[] }[] {
  const byRank = [...levels].sort(
    (a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.id - b.id,
  );
  const groups: { group: LevelGroup | 'other'; levels: CatalogLevel[] }[] = LEVEL_GROUPS.map(
    (group) => ({ group, levels: byRank.filter((level) => level.level_group === group) }),
  );
  groups.push({
    group: 'other',
    levels: byRank.filter((level) => !level.level_group || !LEVEL_GROUPS.includes(level.level_group)),
  });
  return groups.filter((entry) => entry.levels.length > 0);
}

/** Les matières dans l'ordre alphabétique de leur libellé traduit, « Autre » en dernier. */
export function sortDisciplines(
  disciplines: CatalogDiscipline[],
  translate: (key: string) => string,
): CatalogDiscipline[] {
  return [...disciplines].sort((a, b) => {
    if (a.code === 'AUTRE') return 1;
    if (b.code === 'AUTRE') return -1;
    return translate(a.label).localeCompare(translate(b.label), 'fr');
  });
}

/** Ajoute ou retire un id d'une liste, sans doublon. */
export function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

/** Les libellés (traduits) des id donnés, dans l'ordre du référentiel — un id inconnu est ignoré. */
export function labelsOf<T extends { id: number; label: string }>(
  ids: number[],
  referential: T[],
  translate: (key: string) => string,
): string[] {
  return referential.filter((item) => ids.includes(item.id)).map((item) => translate(item.label));
}

/** Un sujet ne se publie qu'avec au moins un niveau ET une matière : sans eux, il serait introuvable. */
export const isPublishable = (classification: Classification) =>
  classification.level_ids.length > 0 && classification.discipline_ids.length > 0;

/**
 * Peut-on retirer ou reclasser ce sujet du catalogue ? Son auteur, ou un modérateur — le serveur
 * reste seul juge, ceci ne fait que masquer des boutons inutiles.
 */
export const canManageCatalogSubject = (
  subject: { owner: string },
  userId: string | undefined,
  isModerator: boolean,
) => isModerator || (!!userId && subject.owner === userId);

/**
 * Un élève ou un parent ne voit jamais le catalogue, qui montre les réponses attendues — même quand
 * son établissement lui a donné le droit de créer des sujets. Même règle côté serveur.
 */
export const isCatalogAudience = (userType: string | undefined) =>
  userType !== 'ELEVE' && userType !== 'PERSRELELEVE';

/** Le nombre de pages d'un résultat. */
export const pageCount = (total: number, pageSize: number) =>
  Math.max(1, Math.ceil(total / pageSize));
