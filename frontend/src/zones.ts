/**
 * Les trois types de grains « à zones » — portage des modèles et des règles de
 * `components/grain/filltext`, `zonetext` et `zoneimage` de l'IHM AngularJS :
 *
 *  - **texte à trous** (10) : un texte riche dans lequel des zones remplacent des mots ;
 *  - **zones de texte** (11) : des étiquettes de texte posées sur une image de fond ;
 *  - **zones d'images** (12) : des vignettes posées sur une image de fond.
 *
 * Pour les deux premiers, l'élève répond de trois façons au choix de l'enseignant
 * (`answersType`) : en tapant (`text`), en choisissant dans une liste propre à chaque zone
 * (`list`), ou en plaçant des étiquettes communes à toutes les zones (`drag`).
 *
 * ⚠ Les données doivent rester lisibles par l'ancienne IHM : la balise `<fill-zone zone-id="…">`
 * et le repère de 760 × 600 des positions sont repris tels quels.
 */

import { shuffle } from './schedule';
import { GrainCustomCopyData, GrainCustomData, GrainZone } from './types';

export type AnswersType = 'text' | 'list' | 'drag';

/** Une zone ne porte pas plus de quarante caractères — la limite de l'ancienne saisie. */
export const ZONE_MAX_LENGTH = 40;

export const answersTypeOf = (data: { answersType?: string } | undefined): AnswersType =>
  data?.answersType === 'list' || data?.answersType === 'drag' ? data.answersType : 'text';

// ── Modèle ────────────────────────────────────────────────────────────────────

/** L'identifiant d'une nouvelle zone de texte à trous : le dernier, plus un. */
export function nextZoneId(zones: GrainZone[]): number {
  return zones.length > 0 ? (zones[zones.length - 1].id ?? zones.length - 1) + 1 : 0;
}

/**
 * La position d'une nouvelle zone posée sur une image : en escalier depuis le coin, pour que
 * deux zones ajoutées à la suite ne se recouvrent pas exactement.
 */
export const nextZonePosition = (zones: GrainZone[]) => ({
  x: zones.length * 15,
  y: zones.length * 15,
  z: zones.length,
});

/**
 * Change la façon de répondre. Les propositions sont reconstruites à partir de ce qui existe :
 *  - vers `drag`, les étiquettes communes deviennent les bonnes réponses de chaque zone ;
 *  - vers `list`, chaque zone reçoit les étiquettes communes s'il y en a, sinon sa seule réponse.
 *
 * L'enseignant doit confirmer ce changement dès qu'il y a des zones : il réécrit leurs
 * propositions (`#WB-460`).
 */
export function switchAnswersType(data: GrainCustomData, next: AnswersType): GrainCustomData {
  const zones = data.zones ?? [];
  if (next === 'drag') {
    return { ...data, answersType: next, options: zones.map((zone) => zone.answer) };
  }
  if (next === 'list') {
    const shared = data.options ?? [];
    return {
      ...data,
      answersType: next,
      zones: zones.map((zone) => ({
        ...zone,
        options: shared.length > 0 ? [...shared] : [zone.answer],
      })),
    };
  }
  return { ...data, answersType: next };
}

/**
 * Retire une étiquette commune. Sur une image, les zones qui l'attendaient partent avec elle —
 * elles n'auraient plus de bonne réponse.
 */
export function removeSharedOption(
  data: GrainCustomData,
  option: string,
  dropZones: boolean,
): GrainCustomData {
  const options = [...(data.options ?? [])];
  const index = options.indexOf(option);
  if (index >= 0) options.splice(index, 1);
  return {
    ...data,
    options,
    zones: dropZones ? (data.zones ?? []).filter((zone) => zone.answer !== option) : data.zones,
  };
}

/**
 * Ce que l'élève reçoit pour un grain à zones : TOUT le grain — texte, image, propositions —
 * avec les réponses des zones effacées (`makeZoneCustomDataCopy`).
 */
export function zoneCopyData(data: GrainCustomData): GrainCustomCopyData {
  return {
    zones: (data.zones ?? []).map((zone) => ({
      ...zone,
      options: zone.options ? [...zone.options] : zone.options,
      answer: '',
    })),
    options: data.options ? [...data.options] : [],
    answersType: data.answersType,
    htmlContent: data.htmlContent,
    _guideImage: data._guideImage,
  };
}

// ── Passation ─────────────────────────────────────────────────────────────────

/**
 * Mélange des propositions, en évitant que la première reste la première : la bonne réponse est
 * toujours enregistrée en tête, et la laisser là reviendrait à la donner. Cinq essais au plus,
 * comme l'original — avec deux propositions identiques, on ne peut pas faire mieux.
 */
export function shuffledOptions(options: string[], random: () => number = Math.random): string[] {
  const clean = options.filter((option) => option !== null && option !== undefined);
  if (clean.length < 2) return clean;
  let result = clean;
  for (let attempt = 0; attempt < 5 && result[0] === clean[0]; attempt++) {
    result = shuffle(clean, random);
  }
  return result;
}

/**
 * Les étiquettes encore disponibles : celles qu'aucune zone n'a prises. Deux étiquettes de même
 * texte comptent pour deux — en poser une n'épuise pas l'autre.
 */
export function availableOptions(options: string[], zones: GrainZone[]): string[] {
  const used = zones.map((zone) => zone.answer).filter(Boolean);
  const available: string[] = [];
  for (const option of options) {
    const index = used.indexOf(option);
    if (index >= 0) used.splice(index, 1);
    else available.push(option);
  }
  return available;
}

/** Pose une réponse dans une zone (ou l'efface, avec une chaîne vide). */
export function answerZone(
  data: GrainCustomCopyData,
  index: number,
  answer: string,
): GrainCustomCopyData {
  return {
    ...data,
    zones: (data.zones ?? []).map((zone, position) =>
      position === index ? { ...zone, answer } : zone,
    ),
  };
}

// ── Texte à trous : le HTML ───────────────────────────────────────────────────

const parseHtml = (html: string): HTMLElement =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

/**
 * Retire d'un HTML ce qui s'exécute : scripts, cadres, gestionnaires d'événements, liens
 * `javascript:`. Le texte à trous est rendu hors de l'éditeur riche (il faut y glisser des
 * champs), et ne bénéficie donc pas du filtre de son schéma.
 */
function scrub(root: HTMLElement): void {
  root
    .querySelectorAll('script, style, iframe, object, embed, link, meta, base, form')
    .forEach((element) => element.remove());
  root.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.replace(/\s+/g, '').toLowerCase();
      if (
        name.startsWith('on') ||
        // Les attributs d'AngularJS ne servent qu'à l'ancienne IHM : inertes ici, on les ôte.
        name.startsWith('ng-') ||
        ((name === 'href' || name === 'src') && value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
}

export function sanitizeHtml(html: string | undefined): string {
  if (!html) return '';
  const root = parseHtml(html);
  scrub(root);
  return root.innerHTML;
}

/** Attribut posé sur les emplacements où l'écran viendra monter le champ d'une zone. */
export const ZONE_SLOT = 'data-zone-id';

/**
 * Le texte à trous prêt à l'affichage : assaini, et chaque `<fill-zone>` remplacée par un
 * emplacement vide que l'écran remplit — champ de saisie, liste, réponse corrigée.
 *
 * L'enveloppe `<span contenteditable="false">` que posait l'ancien éditeur est gardée : elle ne
 * gêne pas, et l'ôter déplacerait l'espace insécable qui suit la zone.
 */
export function fillTextSlots(html: string | undefined): string {
  if (!html) return '';
  const root = parseHtml(html);
  scrub(root);
  root.querySelectorAll('fill-zone').forEach((zone) => {
    const slot = root.ownerDocument.createElement('span');
    slot.setAttribute(ZONE_SLOT, zone.getAttribute('zone-id') ?? '');
    zone.replaceWith(slot);
  });
  return root.innerHTML;
}

/** Les identifiants des zones présentes dans le texte, dans l'ordre de lecture. */
export function zoneIdsInHtml(html: string | undefined): number[] {
  if (!html) return [];
  return Array.from(parseHtml(html).querySelectorAll('fill-zone'))
    .map((zone) => Number.parseInt(zone.getAttribute('zone-id') ?? '', 10))
    .filter((id) => !Number.isNaN(id));
}

/**
 * Ne garde que les zones encore présentes dans le texte : effacer une zone dans l'éditeur doit
 * aussi la retirer du grain, sans quoi elle compterait dans la note sans être affichée.
 */
export function pruneZones(data: GrainCustomData, html: string): GrainCustomData {
  const present = new Set(zoneIdsInHtml(html));
  return {
    ...data,
    htmlContent: html,
    zones: (data.zones ?? []).filter((zone) => zone.id !== undefined && present.has(zone.id)),
  };
}

/**
 * Le texte à trous tel qu'on l'imprime : chaque zone devient un trait à compléter, suivi de ses
 * propositions s'il y en a — ou la réponse soulignée, sur la version « avec les réponses ».
 */
export function printableFillText(
  data: GrainCustomData,
  showResponses: boolean,
): string {
  const root = parseHtml(data.htmlContent ?? '');
  scrub(root);
  const drag = answersTypeOf(data) === 'drag';
  root.querySelectorAll('fill-zone').forEach((element) => {
    const id = Number.parseInt(element.getAttribute('zone-id') ?? '', 10);
    const zone = (data.zones ?? []).find((item) => item.id === id);
    const fragment = root.ownerDocument.createElement('span');
    if (zone) {
      if (showResponses) {
        const answer = root.ownerDocument.createElement('u');
        const strong = root.ownerDocument.createElement('b');
        strong.textContent = zone.answer;
        answer.appendChild(strong);
        fragment.appendChild(answer);
      } else {
        fragment.append(' _______ ');
      }
      const options = zone.options ?? [];
      if (!drag && options.length > 0) fragment.append(` [${options.join(' / ')}] `);
    }
    element.replaceWith(fragment);
  });
  return root.innerHTML.replace(/ &nbsp;/g, ' ');
}

// ── Zones posées sur une image : la géométrie ─────────────────────────────────

/**
 * Les positions enregistrées sont celles du coin haut-gauche d'un bloc, en pixels, sur une image
 * de 760 × 600. À l'écran l'image est redimensionnée : il faut convertir dans les deux sens.
 */
export const MODEL_WIDTH = 760;
export const MODEL_HEIGHT = 600;

export interface Size {
  width: number;
  height: number;
}

/**
 * Le décalage du CENTRE d'un bloc, dans le modèle puis à l'écran. Convertir le coin d'un bloc
 * est imprécis quand l'image est réduite, parce que le bloc, lui, garde sa taille : l'original
 * convertit donc le centre. Une étiquette de texte fait 160 × 40 dans le modèle et 150 × 40 à
 * l'écran ; une vignette, 100 × 100 dans les deux.
 */
const CENTER = {
  text: { x: [80, 75], y: [20, 20] },
  image: { x: [50, 50], y: [50, 50] },
} as const;

export type BlockKind = keyof typeof CENTER;

/** Les marges qu'une image laisse quand elle est ajustée sans déformation dans son cadre. */
export function fitMargins(natural: Size, view: Size): { horizontal: number; vertical: number } {
  if (!natural.width || !natural.height || !view.height) return { horizontal: 0, vertical: 0 };
  if (natural.width / natural.height > view.width / view.height) {
    // Image plus plate que le cadre : marges en haut et en bas.
    return {
      horizontal: 0,
      vertical: Math.round((view.height - (view.width * natural.height) / natural.width) / 2),
    };
  }
  return {
    horizontal: Math.round((view.width - (view.height * natural.width) / natural.height) / 2),
    vertical: 0,
  };
}

/** Du modèle vers l'écran : où poser le coin haut-gauche d'un bloc. */
export function toScreen(
  position: { x: number; y: number },
  view: Size,
  natural: Size,
  kind: BlockKind,
): { left: number; top: number } {
  const margins = fitMargins(natural, view);
  const center = CENTER[kind];
  return {
    left:
      Math.round(((position.x + center.x[0]) * view.width) / MODEL_WIDTH + margins.horizontal) -
      center.x[1],
    top:
      Math.round(((position.y + center.y[0]) * view.height) / MODEL_HEIGHT + margins.vertical) -
      center.y[1],
  };
}

/** De l'écran vers le modèle : ce qu'on enregistre quand l'enseignant a déplacé un bloc. */
export function toModel(
  point: { left: number; top: number },
  view: Size,
  natural: Size,
  kind: BlockKind,
): { x: number; y: number } {
  if (!view.width || !view.height) return { x: 0, y: 0 };
  const margins = fitMargins(natural, view);
  const center = CENTER[kind];
  return {
    x:
      Math.round(((point.left + center.x[1] - margins.horizontal) * MODEL_WIDTH) / view.width) -
      center.x[0],
    y:
      Math.round(((point.top + center.y[1] - margins.vertical) * MODEL_HEIGHT) / view.height) -
      center.y[0],
  };
}
