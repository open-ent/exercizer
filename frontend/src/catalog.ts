import {
  CatalogContext,
  CatalogDiscipline,
  CatalogFacet,
  CatalogLevel,
  CatalogOrg,
  CatalogReferential,
  CatalogView,
  Classification,
  LevelGroup,
  Programme,
  ProgrammeNode,
} from './types';

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

// ── Rangement du catalogue en arbre ───────────────────────────────────────────

/** L'énoncé fictif qui regroupe les sujets rattachés à aucun énoncé du programme. */
export const UNALIGNED_NODE = '__none__';

const PROGRAMME_PREFIX = 'programme:';

/** Le référentiel CASE d'un rangement par programme, ou null. */
export const programmeOf = (org: CatalogOrg | null | undefined): string | null =>
  org?.startsWith(PROGRAMME_PREFIX) ? org.slice(PROGRAMME_PREFIX.length) : null;

export const programmeOrg = (programme: string): CatalogOrg => `${PROGRAMME_PREFIX}${programme}`;

/** Un rangement lu dans l'URL ou une préférence ; null s'il est illisible. */
export function parseOrg(value: string | null | undefined): CatalogOrg | null {
  if (value === 'level' || value === 'discipline') return value;
  if (value?.startsWith(PROGRAMME_PREFIX) && value.length > PROGRAMME_PREFIX.length) {
    return value as CatalogOrg;
  }
  return null;
}

export const parseView = (value: string | null | undefined): CatalogView | null =>
  value === 'tree' || value === 'outline' || value === 'coverage' ? value : null;

/**
 * Le rangement à afficher : celui de l'URL, sinon celui de la préférence s'il existe encore, sinon
 * le premier programme qui a des exercices rattachés, sinon par niveau.
 */
export function resolveOrg(
  fromUrl: CatalogOrg | null,
  fromPreference: CatalogOrg | null,
  programmes: Programme[],
): CatalogOrg {
  const exists = (org: CatalogOrg | null) => {
    const programme = programmeOf(org);
    return !!org && (!programme || programmes.some((p) => p.id === programme));
  };
  if (fromUrl && exists(fromUrl)) return fromUrl;
  if (fromPreference && exists(fromPreference)) return fromPreference;
  const aligned = programmes.find((p) => p.aligned > 0);
  return aligned ? programmeOrg(aligned.id) : 'level';
}

/**
 * Un nœud d'arbre du catalogue, au format du `Tree` du socle. `kind` distingue les branches, les
 * exercices (vue sommaire), la suite d'une liste tronquée et l'attente d'un chargement.
 */
export interface CatalogTreeItem {
  id: string;
  name: string;
  kind: 'node' | 'subject' | 'more' | 'loading';
  code?: string | null;
  count: number;
  children: CatalogTreeItem[];
  /** Le type d'énoncé d'un nœud de programme (Domaine, Objectif d'apprentissage…). */
  type?: string | null;
  /** Les codes des niveaux d'un nœud de programme (CP, CE1…). */
  levels?: string[];
  /** L'exercice d'une feuille `subject`. */
  subjectId?: number;
  /** Le nœud qui porte une feuille `subject`, `more` ou `loading`. */
  owner?: string;
}

/** L'arbre d'un programme, à partir de sa liste plate (dans l'ordre des énoncés frères). */
export function buildProgrammeTree(nodes: ProgrammeNode[]): CatalogTreeItem[] {
  const known = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, ProgrammeNode[]>();
  for (const node of nodes) {
    // Un parent absent de la liste (branche filtrée) rattache l'énoncé à la racine.
    const parent = node.parent && known.has(node.parent) ? node.parent : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), node]);
  }
  const build = (parent: string | null): CatalogTreeItem[] =>
    (byParent.get(parent) ?? []).map((node) => ({
      id: node.id,
      name: node.label,
      kind: 'node',
      code: node.code,
      count: node.count,
      children: build(node.id),
      type: node.type,
      levels: node.levels,
    }));
  return build(null);
}

// ── Couverture d'un programme ─────────────────────────────────────────────────

/**
 * Types d'énoncés qui structurent un programme sans décrire un apprentissage (même liste que
 * `ProgrammeSql.STRUCTURAL_TYPES` côté serveur) : tous les autres sont des objectifs.
 */
const STRUCTURAL_TYPES = ['Cycle', 'Enseignement', 'Domaine', 'Sous-domaine', 'Thème'];

/** Un énoncé à qui l'on peut rattacher un exercice : attendu, objectif, compétence… */
export const isObjective = (type: string | null | undefined) => !!type && !STRUCTURAL_TYPES.includes(type);

/** Une ligne du tableau de couverture : un domaine du programme. */
export interface CoverageRow {
  id: string;
  code: string | null;
  label: string;
  /** Les énoncés au-dessus du domaine (cycle, enseignement), du plus haut au plus proche. */
  path: string[];
  objectives: number;
  /** Objectifs qui ont au moins un exercice. */
  covered: number;
  /** Exercices distincts rattachés au domaine. */
  exercises: number;
}

/**
 * La couverture d'un programme, domaine par domaine, à partir de son arbre COMPLET (« Afficher tout
 * le programme ») : la part des objectifs qui ont au moins un exercice. Un objectif est rangé sous
 * son domaine le plus haut ; hors de tout domaine, sous son parent (un enseignement). `levelCodes`
 * ne garde que les objectifs de ces niveaux (null : tous) ; un domaine sans objectif est omis.
 * Les lignes suivent l'ordre du programme.
 */
export function programmeCoverage(nodes: ProgrammeNode[], levelCodes: readonly string[] | null): CoverageRow[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ancestors = (node: ProgrammeNode) => {
    const chain: ProgrammeNode[] = [];
    for (let current = node.parent ? byId.get(node.parent) : undefined; current; ) {
      chain.unshift(current);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
    return chain;
  };
  // L'ordre du programme (parcours en profondeur) : les nœuds arrivent triés frère par frère.
  const children = new Map<string | null, ProgrammeNode[]>();
  for (const node of nodes) {
    const parent = node.parent && byId.has(node.parent) ? node.parent : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const order = new Map<string, number>();
  const visit = (parent: string | null) =>
    (children.get(parent) ?? []).forEach((node) => {
      order.set(node.id, order.size);
      visit(node.id);
    });
  visit(null);

  // Une ligne prend la place de son premier objectif : les objectifs hors domaine d'un
  // enseignement viennent après ses domaines qui les précèdent, pas avant.
  const rows = new Map<string, CoverageRow & { first: number }>();
  for (const node of nodes) {
    if (!isObjective(node.type)) continue;
    if (levelCodes && node.levels.length > 0 && !node.levels.some((code) => levelCodes.includes(code))) continue;
    const chain = ancestors(node);
    const index = chain.findIndex((ancestor) => ancestor.type === 'Domaine');
    const at = index >= 0 ? index : chain.length - 1;
    if (at < 0) continue;
    const domain = chain[at];
    const row = rows.get(domain.id) ?? {
      id: domain.id,
      code: domain.code,
      label: domain.label,
      path: chain.slice(0, at).map((ancestor) => ancestor.label),
      objectives: 0,
      covered: 0,
      exercises: domain.count,
      first: Number.MAX_SAFE_INTEGER,
    };
    row.objectives += 1;
    if (node.count > 0) row.covered += 1;
    row.first = Math.min(row.first, order.get(node.id) ?? Number.MAX_SAFE_INTEGER);
    rows.set(domain.id, row);
  }
  return [...rows.values()].sort((a, b) => a.first - b.first).map(({ first: _first, ...row }) => row);
}

/** Part couverte, de 0 à 1 (0 sans objectif). */
export const coverageRatio = (row: Pick<CoverageRow, 'objectives' | 'covered'>) =>
  row.objectives > 0 ? row.covered / row.objectives : 0;

// Identifiants des nœuds des rangements par niveau et par matière : « g:<groupe> », « l:<id> »,
// « d:<id> », et un couple « l:<id>|d:<id> » ou « d:<id>|l:<id> ».

/** Les niveaux et les matières qu'un nœud des rangements par niveau ou par matière désigne. */
export function nodeCriteria(
  node: string | null,
  levels: CatalogLevel[],
): { levels: number[]; disciplines: number[] } {
  const criteria = { levels: [] as number[], disciplines: [] as number[] };
  for (const part of node?.split('|') ?? []) {
    const [kind, value] = [part.slice(0, 2), part.slice(2)];
    if (kind === 'g:') {
      const group = groupLevels(levels).find((entry) => entry.group === value);
      criteria.levels.push(...(group?.levels.map((level) => level.id) ?? []));
    } else if (kind === 'l:' && Number(value)) {
      criteria.levels.push(Number(value));
    } else if (kind === 'd:' && Number(value)) {
      criteria.disciplines.push(Number(value));
    }
  }
  return criteria;
}

const facetCount = (facets: CatalogFacet[], match: (facet: CatalogFacet) => boolean) =>
  facets.find(match)?.count ?? 0;

/** Groupe de niveaux › niveau › matière, sans les branches vides. */
export function buildLevelTree(
  referential: CatalogReferential,
  facets: CatalogFacet[],
  translate: (key: string) => string,
): CatalogTreeItem[] {
  const disciplines = sortDisciplines(referential.disciplines, translate);
  return groupLevels(referential.levels)
    .map(({ group, levels }) => ({
      id: `g:${group}`,
      name: translate(`exercizer.catalog.group.${group}`),
      kind: 'node' as const,
      count: facetCount(
        facets,
        (f) => f.kind === 'group' && (f.level_group ?? 'other') === group,
      ),
      children: levels
        .map((level) => ({
          id: `l:${level.id}`,
          name: translate(level.label),
          kind: 'node' as const,
          count: facetCount(facets, (f) => f.kind === 'level' && f.level_id === level.id),
          children: disciplines
            .map((discipline) => ({
              id: `l:${level.id}|d:${discipline.id}`,
              name: translate(discipline.label),
              kind: 'node' as const,
              count: facetCount(
                facets,
                (f) =>
                  f.kind === 'level_discipline' &&
                  f.level_id === level.id &&
                  f.discipline_id === discipline.id,
              ),
              children: [],
            }))
            .filter((item) => item.count > 0),
        }))
        .filter((item) => item.count > 0),
    }))
    .filter((item) => item.count > 0);
}

/** Matière › niveau, sans les branches vides. */
export function buildDisciplineTree(
  referential: CatalogReferential,
  facets: CatalogFacet[],
  translate: (key: string) => string,
): CatalogTreeItem[] {
  const levels = groupLevels(referential.levels).flatMap((entry) => entry.levels);
  return sortDisciplines(referential.disciplines, translate)
    .map((discipline) => ({
      id: `d:${discipline.id}`,
      name: translate(discipline.label),
      kind: 'node' as const,
      count: facetCount(facets, (f) => f.kind === 'discipline' && f.discipline_id === discipline.id),
      children: levels
        .map((level) => ({
          id: `d:${discipline.id}|l:${level.id}`,
          name: translate(level.label),
          kind: 'node' as const,
          count: facetCount(
            facets,
            (f) =>
              f.kind === 'level_discipline' &&
              f.level_id === level.id &&
              f.discipline_id === discipline.id,
          ),
          children: [],
        }))
        .filter((item) => item.count > 0),
    }))
    .filter((item) => item.count > 0);
}

/** Les exercices chargés sous un nœud de la vue sommaire. */
export interface OutlineEntry {
  subjects: { id: number; title: string }[];
  total: number;
}

/**
 * La vue sommaire : l'arbre, avec sous chaque nœud déjà déplié ses exercices en feuilles (puis
 * « … et N autres » si la liste est tronquée). Un nœud qui porte des exercices mais n'a pas encore
 * été chargé reçoit une feuille d'attente, pour que le socle lui affiche un chevron.
 */
export function withOutlineLeaves(
  items: CatalogTreeItem[],
  loaded: ReadonlyMap<string, OutlineEntry>,
  loadingLabel: string,
  moreLabel: (count: number) => string,
): CatalogTreeItem[] {
  return items.map((item) => {
    const children = withOutlineLeaves(item.children, loaded, loadingLabel, moreLabel);
    const entry = loaded.get(item.id);
    if (!entry) {
      // Une branche feuille qui porte des exercices : à charger quand on la déplie.
      return item.children.length === 0 && item.count > 0
        ? {
            ...item,
            children: [{ id: `loading:${item.id}`, name: loadingLabel, kind: 'loading', count: 0, children: [], owner: item.id }],
          }
        : { ...item, children };
    }
    const leaves: CatalogTreeItem[] = entry.subjects.map((subject) => ({
      id: `s:${item.id}:${subject.id}`,
      name: subject.title,
      kind: 'subject',
      count: 0,
      children: [],
      subjectId: subject.id,
      owner: item.id,
    }));
    if (entry.total > entry.subjects.length) {
      leaves.push({
        id: `more:${item.id}`,
        name: moreLabel(entry.total - entry.subjects.length),
        kind: 'more',
        count: 0,
        children: [],
        owner: item.id,
      });
    }
    return { ...item, children: [...children, ...leaves] };
  });
}

/** Le nœud d'id donné, n'importe où dans l'arbre. */
export function findTreeItem(items: CatalogTreeItem[], id: string): CatalogTreeItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const found = findTreeItem(item.children, id);
    if (found) return found;
  }
  return undefined;
}

// ── Choix des énoncés d'un programme (rattachement d'un sujet) ────────────────

/** Minuscules sans accents, pour comparer un texte saisi à un énoncé. */
export const foldText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Les énoncés à montrer dans le sélecteur : ceux qui répondent à la recherche (code ou texte) et
 * aux niveaux du sujet, avec leurs ancêtres pour garder l'arbre lisible. Sans recherche ni niveau,
 * null : tout l'arbre.
 */
export function visibleProgrammeNodes(
  nodes: ProgrammeNode[],
  search: string,
  levelCodes: string[],
): Set<string> | null {
  const term = foldText(search.trim());
  if (!term && levelCodes.length === 0) return null;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visible = new Set<string>();
  for (const node of nodes) {
    const levelOk = levelCodes.length === 0 || node.levels.some((code) => levelCodes.includes(code));
    const textOk =
      !term || foldText(node.label).includes(term) || foldText(node.code ?? '').includes(term);
    if (!levelOk || !textOk) continue;
    for (let current: ProgrammeNode | undefined = node; current && !visible.has(current.id); ) {
      visible.add(current.id);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
  }
  return visible;
}

// ── Contexte : les niveaux que sert l'établissement ou l'ENT ──────────────────

/**
 * Les groupes de niveaux à montrer : ceux des établissements de l'usager, sinon ceux que le thème
 * de l'ENT déclare servir ; null — tout montrer — si rien n'est connu ou si l'usager a demandé
 * « Afficher tous les niveaux ».
 */
export function contextLevels(
  context: CatalogContext | undefined,
  themeLevels: readonly string[] | undefined,
  showAll: boolean,
): LevelGroup[] | null {
  if (showAll) return null;
  const known = (levels: readonly string[] | undefined) =>
    (levels ?? []).filter((level): level is LevelGroup => LEVEL_GROUPS.includes(level as LevelGroup));
  const fromStructures = known(context?.schoolLevels);
  if (fromStructures.length) return fromStructures;
  const fromTheme = known(themeLevels);
  return fromTheme.length ? fromTheme : null;
}

/**
 * Les programmes qui couvrent l'un de ces niveaux (tous sans contexte). `keep` reste proposé même
 * hors contexte : un lien partagé vers un autre programme doit s'ouvrir.
 */
export function programmesInContext(
  programmes: Programme[],
  levels: LevelGroup[] | null,
  keep?: string | null,
): Programme[] {
  if (!levels) return programmes;
  return programmes.filter(
    (programme) => programme.id === keep || programme.levels.some((level) => levels.includes(level)),
  );
}

/** Le référentiel réduit aux niveaux de ces groupes (inchangé sans contexte). */
export function referentialInContext(
  referential: CatalogReferential,
  levels: LevelGroup[] | null,
): CatalogReferential {
  if (!levels) return referential;
  return {
    ...referential,
    levels: referential.levels.filter((level) => !!level.level_group && levels.includes(level.level_group)),
  };
}
