/**
 * Règles des grains — portage de `GrainService`, `GrainTypeService`, `CorrectOrderHelper` et des
 * directives `edit*` de l'IHM AngularJS.
 *
 * Sans réseau ni composant : ce sont ces règles qui décident du barème d'un sujet, de la
 * numérotation des questions et de la forme que prend chaque type de grain. Elles méritent
 * d'être lisibles et vérifiables seules (cf. `grains.test.ts`).
 */

import { Grain, GrainAnswer, GrainCustomData, GrainData } from './types';

/**
 * Les identifiants de `exercizer.grain_type`, figés en base depuis `sql/002` et `sql/008`.
 * Les nommer évite les `grain_type_id > 3` sans explication qui parsèment l'ancienne IHM.
 */
export const GRAIN = {
  /** Grain tout juste créé : l'enseignant n'a pas encore dit ce qu'il voulait en faire. */
  CHOOSE: 1,
  /** Deuxième étape : il a demandé une question, il choisit laquelle. */
  CHOOSE_ANSWER: 2,
  /** Énoncé : du texte, sans question ni barème. */
  STATEMENT: 3,
  SIMPLE_ANSWER: 4,
  OPEN_ANSWER: 5,
  MULTIPLE_ANSWERS: 6,
  QCM: 7,
  ASSOCIATION: 8,
  ORDER_BY: 9,
  TEXT_TO_FILL: 10,
  AREA_SELECT: 11,
  AREA_SELECT_IMAGE: 12,
} as const;

/**
 * Est-ce une question — c'est-à-dire un grain qui porte un titre, un énoncé, un barème et compte
 * dans la numérotation ? C'est le sens du `grain_type_id > 3` de l'ancienne IHM.
 */
export const isQuestion = (grainTypeId: number): boolean => grainTypeId > GRAIN.STATEMENT;

/** Grain pas encore décidé : les deux étapes de choix, qui n'ont pas de contenu à elles. */
export const isUndecided = (grainTypeId: number): boolean =>
  grainTypeId === GRAIN.CHOOSE || grainTypeId === GRAIN.CHOOSE_ANSWER;

/**
 * Les trois types « à zones » (texte à trous, zones de texte, zones d'images) ne sont pas encore
 * portés : leur édition reposait sur l'éditeur riche d'AngularJS, dans lequel l'enseignant
 * insérait des balises `<fill-zone>`, et sur un placement libre de zones au-dessus d'une image.
 *
 * Ils restent LISIBLES dans la nouvelle IHM, et ne sont jamais réenregistrés : tant qu'on ne les
 * sauvegarde pas, aucune donnée ne peut être abîmée.
 */
export const ZONE_TYPES: readonly number[] = [
  GRAIN.TEXT_TO_FILL,
  GRAIN.AREA_SELECT,
  GRAIN.AREA_SELECT_IMAGE,
];

export const isEditableHere = (grainTypeId: number): boolean =>
  !ZONE_TYPES.includes(grainTypeId);

/**
 * Ordre d'affichage des types dans le choix d'une question — celui de l'ancienne IHM
 * (`chooseAnswer#preferedGrainOrder`), qui n'est NI l'ordre des identifiants ni l'alphabétique :
 * il part du plus courant (QCM) vers le plus spécialisé.
 */
const PREFERRED_ORDER: Record<number, number> = {
  [GRAIN.CHOOSE]: 10,
  [GRAIN.CHOOSE_ANSWER]: 20,
  [GRAIN.QCM]: 30,
  [GRAIN.SIMPLE_ANSWER]: 40,
  [GRAIN.MULTIPLE_ANSWERS]: 50,
  [GRAIN.OPEN_ANSWER]: 60,
  [GRAIN.ASSOCIATION]: 70,
  [GRAIN.ORDER_BY]: 80,
  [GRAIN.TEXT_TO_FILL]: 90,
  [GRAIN.AREA_SELECT]: 100,
  [GRAIN.AREA_SELECT_IMAGE]: 110,
  [GRAIN.STATEMENT]: 120,
};

export const preferredRank = (grainTypeId: number): number =>
  PREFERRED_ORDER[grainTypeId] ?? Number.MAX_SAFE_INTEGER;

/**
 * Un barème lisible : virgule décimale admise, deux décimales, et 0 pour tout ce qui n'est pas un
 * nombre. Repris de `sanitizeScore` — sans lui, une saisie « 1,5 » part en `NaN` jusqu'en base.
 */
export function sanitizeScore(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number.parseFloat(String(value).replace(',', '.'));
  if (Number.isNaN(parsed)) return 0;
  return Number.parseFloat(parsed.toFixed(2));
}

/**
 * Le barème du sujet : la somme des barèmes de ses QUESTIONS. Les énoncés et les grains pas
 * encore décidés n'y entrent pas.
 *
 * ⚠ Le serveur recalcule cette somme de son côté à chaque enregistrement de grain
 * (`GrainServiceSqlImpl`) : ce total n'est qu'un aperçu, il n'est jamais envoyé.
 */
export function computedMaxScore(grains: Grain[]): number {
  const total = grains
    .filter((grain) => isQuestion(grain.grain_type_id))
    .reduce((sum, grain) => sum + sanitizeScore(grain.grain_data?.max_score), 0);
  return Number.parseFloat(total.toFixed(2));
}

/**
 * Le numéro d'une question dans le sujet — `CorrectOrderHelper`. Seules les questions sont
 * numérotées : insérer un énoncé entre deux questions ne décale donc pas leurs numéros.
 */
export function questionNumber(grain: Grain, grains: Grain[]): number {
  return (
    1 +
    grains.filter(
      (other) => isQuestion(other.grain_type_id) && other.order_by < grain.order_by,
    ).length
  );
}

/**
 * Le numéro d'une question dans une COPIE. Même règle que {@link questionNumber}, mais le rang
 * suit `display_order` quand il existe — un sujet peut mélanger ses questions (`random_display`),
 * et l'élève doit voir « 3) » pour la troisième question telle qu'elle lui est présentée.
 */
export function copyQuestionNumber(
  grainCopy: { grain_type_id: number; order_by: number; display_order?: number | null },
  grainCopies: Array<{ grain_type_id: number; order_by: number; display_order?: number | null }>,
): number {
  const rank = (item: { order_by: number; display_order?: number | null }) =>
    item.display_order ?? item.order_by;
  const mine = rank(grainCopy);
  return (
    1 +
    grainCopies.filter((other) => isQuestion(other.grain_type_id) && rank(other) < mine).length
  );
}

/** Le rang du prochain grain ajouté : après le dernier, et 1 sur un sujet vide. */
export function nextOrder(grains: Grain[]): number {
  if (grains.length === 0) return 1;
  return Math.ceil(Math.max(...grains.map((grain) => grain.order_by ?? 0))) + 1;
}

/** Les grains du sujet dans l'ordre où l'élève les verra. */
export const byOrder = (grains: Grain[]): Grain[] =>
  [...grains].sort((a, b) => (a.order_by ?? 0) - (b.order_by ?? 0));

/**
 * Déplace un grain d'une position à une autre et renumérote TOUTE la liste de 1 à n.
 *
 * Renvoie aussi les grains dont le rang a changé : eux seuls ont besoin d'être réenregistrés,
 * là où l'ancienne IHM réenregistrait la liste entière à chaque glissement.
 */
export function moveGrain(
  grains: Grain[],
  fromIndex: number,
  toIndex: number,
): { grains: Grain[]; changed: Grain[] } {
  const ordered = byOrder(grains);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ordered.length ||
    toIndex >= ordered.length ||
    fromIndex === toIndex
  ) {
    return { grains: ordered, changed: [] };
  }
  const moved = [...ordered];
  const [grain] = moved.splice(fromIndex, 1);
  moved.splice(toIndex, 0, grain);

  const changed: Grain[] = [];
  const renumbered = moved.map((item, index) => {
    const order_by = index + 1;
    if (item.order_by === order_by) return item;
    const next = { ...item, order_by };
    changed.push(next);
    return next;
  });
  return { grains: renumbered, changed };
}

/**
 * `custom_data` d'un grain neuf, par type — ce que les directives `edit*` posaient à la volée
 * quand `custom_data` était absent. Deux réponses vides d'emblée pour les listes : un QCM à une
 * seule réponse n'a pas de sens, et c'était déjà le choix de l'ancienne IHM.
 */
export function defaultCustomData(grainTypeId: number): GrainCustomData {
  switch (grainTypeId) {
    case GRAIN.STATEMENT:
      return { statement: '' };
    case GRAIN.SIMPLE_ANSWER:
      return { correct_answer: '' };
    case GRAIN.MULTIPLE_ANSWERS:
      return { correct_answer_list: [{ text: '' }, { text: '' }], no_error_allowed: false };
    case GRAIN.QCM:
      return {
        correct_answer_list: [
          { text: '', isChecked: false },
          { text: '', isChecked: false },
        ],
        no_error_allowed: false,
        multipleAnswers: false,
      };
    case GRAIN.ASSOCIATION:
      return {
        correct_answer_list: [{ text_left: '', text_right: '' }],
        no_error_allowed: false,
        // `show_left_column` vaut `true` par défaut : c'est ce que faisait (par accident, via un
        // `|| true`) `AssociationCustomData`, et l'exercice est inutilisable sans.
        show_left_column: true,
      };
    case GRAIN.ORDER_BY:
      return {
        correct_answer_list: [
          { text: '', order_by: 1 },
          { text: '', order_by: 2 },
        ],
        no_error_allowed: false,
      };
    default:
      // Réponse ouverte (5) et grains pas encore décidés : rien à régler.
      return {};
  }
}

/** Contenu d'un grain neuf : titre et barème vides, le reste selon le type. */
export function defaultGrainData(grainTypeId: number): GrainData {
  return { title: '', max_score: 0, custom_data: defaultCustomData(grainTypeId) };
}

/**
 * Nombre de lignes que l'éditeur montre AU MOINS, par type.
 *
 * Il ne s'agit pas d'une contrainte sur les données : un QCM enregistré peut n'avoir qu'une
 * proposition. Mais l'éditeur écarte les lignes vides à l'enregistrement (cf. {@link
 * cleanGrainData}) ; sans ce minimum, rouvrir un QCM à peine commencé n'afficherait plus aucune
 * ligne, et il faudrait les rajouter à la main. L'ancienne IHM ne posait ces deux lignes qu'à la
 * CRÉATION du grain et souffrait donc du même défaut au rechargement.
 */
const MIN_ANSWER_ROWS: Record<number, number> = {
  [GRAIN.MULTIPLE_ANSWERS]: 2,
  [GRAIN.QCM]: 2,
  [GRAIN.ORDER_BY]: 2,
  [GRAIN.ASSOCIATION]: 1,
};

/**
 * `custom_data` complété des lignes vides qu'il faut pour pouvoir saisir — à l'AFFICHAGE
 * seulement. Ces lignes ne sont jamais enregistrées d'elles-mêmes : rien ne partant au serveur
 * sans modification, elles ne deviennent réelles que lorsqu'on y écrit.
 */
export function withEditableAnswers(
  grainTypeId: number,
  customData: GrainCustomData,
): GrainCustomData {
  const minimum = MIN_ANSWER_ROWS[grainTypeId];
  if (!minimum) return customData;

  const answers = customData.correct_answer_list ?? [];
  if (answers.length >= minimum) return customData;

  const blank: GrainAnswer =
    grainTypeId === GRAIN.ASSOCIATION
      ? { text_left: '', text_right: '' }
      : grainTypeId === GRAIN.QCM
        ? { text: '', isChecked: false }
        : { text: '' };

  const padded = [...answers];
  while (padded.length < minimum) padded.push({ ...blank });
  return {
    ...customData,
    correct_answer_list:
      grainTypeId === GRAIN.ORDER_BY ? renumberOrderAnswers(padded) : padded,
  };
}

/**
 * Ce qu'on envoie au serveur pour un grain.
 *
 * Seule l'association a besoin d'être nettoyée : ses lignes à moitié remplies (un seul des deux
 * côtés) n'ont pas de sens à la correction. Même règle que `Grain#cleanBeforeUpdate`, qui ne
 * filtrait aussi que ce type.
 *
 * ⚠ Le QCM, lui, écartait à l'enregistrement les réponses SANS TEXTE (`editQcm#_updateGrain`) :
 * on garde ce filtre, sans quoi une ligne vide laissée à l'écran devient une réponse fantôme.
 */
export function cleanGrainData(grainTypeId: number, data: GrainData): GrainData {
  const answers = data.custom_data?.correct_answer_list;
  if (!answers) return data;

  let kept: GrainAnswer[] | null = null;
  if (grainTypeId === GRAIN.ASSOCIATION) {
    kept = answers.filter((answer) => answer.text_left || answer.text_right);
  } else if (grainTypeId === GRAIN.QCM) {
    kept = answers.filter((answer) => !!answer.text);
  }
  if (!kept) return data;
  return { ...data, custom_data: { ...data.custom_data, correct_answer_list: kept } };
}

/**
 * Renumérote les réponses d'une « mise en ordre » de 1 à n, dans l'ordre du tableau — c'est le
 * `reOrder` de `editOrder`. Le rang attendu EST la réponse : il ne peut pas y avoir de trou.
 */
export function renumberOrderAnswers(answers: GrainAnswer[]): GrainAnswer[] {
  return answers.map((answer, index) =>
    answer.order_by === index + 1 ? answer : { ...answer, order_by: index + 1 },
  );
}

/** Titre d'un grain dupliqué : celui d'origine suivi du suffixe, ou le nom du type à défaut. */
export function duplicatedTitle(title: string | undefined, publicName: string, suffix: string) {
  return `${title && title.length > 0 ? title : publicName}${suffix}`;
}

/**
 * L'énoncé d'un grain de type 3.
 *
 * Sa place canonique est `custom_data.statement` : c'est là que l'ancienne IHM l'écrit, et c'est
 * de là que la copie de l'élève le reprend (`custom_copy_data.statement`). Mais on trouve en base
 * des grains où il est posé À PLAT sur `grain_data` — scripts d'import, jeux d'essai, versions
 * antérieures. Les lire aussi évite d'afficher un énoncé vide là où il y a du texte ; on
 * réenregistre toujours à la place canonique.
 */
export function statementOf(data: GrainData): string {
  return data.custom_data?.statement ?? data.statement ?? '';
}

/** Le nom à afficher pour un grain : son titre, ou le nom de son type s'il n'en a pas encore. */
export function grainDisplayName(grain: Grain, publicName: string): string {
  const title = grain.grain_data?.title;
  return title && title.length > 0 ? title : publicName;
}
