/**
 * Import d'un sujet depuis un fichier Moodle XML (ou TDBase, qui en produit) — portage
 * d'`ImportService` de l'IHM AngularJS.
 *
 * La lecture du fichier est faite par le CLIENT : le serveur ne reçoit que le sujet et ses grains
 * déjà construits (`POST /subject/import`). Trois temps, que ce module sépare pour qu'ils soient
 * vérifiables :
 *  1. `parseMoodleXml` lit le XML et rend les grains, avec la liste des images qu'il a trouvées ;
 *  2. l'écran dépose ces images dans l'espace documentaire (une requête par image) ;
 *  3. `applyImageLinks` remplace dans les grains les références Moodle par les liens obtenus.
 *
 * ⚠ Les données produites doivent rester lisibles par l'ancienne IHM : le gabarit des zones d'un
 * texte à trous est donc repris TEL QUEL, attributs AngularJS compris.
 */

import { GRAIN } from './grains';
import { GrainAnswer, GrainData, GrainZone } from './types';

/** Un grain tel que l'import le construit — sans identifiant ni sujet, le serveur les pose. */
export interface ImportedGrain {
  grain_type_id: number;
  order_by: number;
  grain_data: GrainData;
}

/** Une image trouvée dans le fichier, à déposer dans l'espace documentaire. */
export interface ImportedImage {
  blob: Blob;
  name: string;
  /** Chemin Moodle de l'image (`@@PLUGINFILE@@<path><name>`), pour la retrouver dans l'énoncé. */
  path: string;
  /** Lien obtenu après dépôt (`/workspace/document/<id>`), vide si le dépôt a échoué. */
  link?: string;
}

/** Les images d'un grain, par usage. La clé est un rang (celui de l'image, ou de l'étiquette). */
export interface GrainImages {
  in_statement: Record<number, ImportedImage>;
  concat_statement: Record<number, ImportedImage>;
  drag_drop: Record<number, ImportedImage>;
}

export interface MoodleImport {
  grains: ImportedGrain[];
  /** Les images de chaque grain, par RANG du grain (`order_by`). */
  images: Map<number, GrainImages>;
  /** Titres des questions d'un type que le module ne sait pas représenter. */
  unsupported: string[];
  /** Nombre de questions du fichier, hors catégories — le dénominateur du bilan. */
  total: number;
}

/** Le fichier n'est pas du XML lisible. */
export class MoodleXmlError extends Error {}

/**
 * Gabarit d'une zone de texte à trous, repris de l'ancienne IHM : c'est ce que son éditeur riche
 * écrivait, et ce qu'elle attend de relire.
 */
const FILL_ZONE_TEMPLATE =
  '<fill-zone zone-id="@ID@" class="ng-isolate-scope"><text-zone ng-class="{ success: optionData.correction &amp;&amp; optionData.isCorrect, error: optionData.correction &amp;&amp; !optionData.isCorrect }"><!-- ngIf: optionData.mode === \'edit\' -->' +
  '<i class="close ng-scope" ng-click="removeFillZone($event)" ng-if="optionData.mode === \'edit\'"></i><!-- end ngIf: optionData.mode === \'edit\' --><!-- ngIf: optionData.mode === \'edit\' --><i class="edit ng-scope" ng-if="optionData.mode === \'edit\'">' +
  '</i><!-- end ngIf: optionData.mode === \'edit\' --><!-- ngIf: optionData.mode === \'view\' --><!-- ngIf: optionData.mode === \'edit\' --><input type="text" disabled="" placeholder="@answer@" ng-if="optionData.mode === \'edit\'" class="ng-scope">' +
  '<!-- end ngIf: optionData.mode === \'edit\' --><!-- ngIf: optionData.mode === \'perform-text\' --><!-- ngIf: optionData.mode === \'perform-list\' --><!-- ngIf: optionData.mode === \'perform-drag\' --></text-zone></fill-zone>&nbsp;</span>';

/** Le texte de TOUS les descendants qui correspondent — le `.find(sel).text()` de jQuery. */
const textOf = (root: Element, selector: string): string =>
  Array.from(root.querySelectorAll(selector))
    .map((node) => node.textContent ?? '')
    .join('');

/** Le texte du PREMIER descendant qui correspond — `.find('sel:first').text()`. */
const firstText = (root: Element, selector: string): string =>
  root.querySelector(selector)?.textContent ?? '';

/** Retire les balises d'un fragment HTML et décode ses entités — `$('<div/>').html(x).text()`. */
function plainText(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes.buffer], { type });
}

/** Range une image dans la bonne case ; un contenu vide ou illisible est ignoré. */
function addImage(
  target: Record<number, ImportedImage>,
  rank: number,
  base64: string | null | undefined,
  fileName: string | null | undefined,
  path = '',
): void {
  if (!base64 || !fileName) return;
  const parts = fileName.split('.');
  // Sans extension, Moodle a exporté un PNG.
  const extension = parts.length === 1 ? 'png' : parts[parts.length - 1];
  const name = parts.length === 1 ? `${fileName}.png` : fileName;
  try {
    target[rank] = { blob: base64ToBlob(base64.trim(), `image/${extension}`), name, path };
  } catch {
    // Base64 invalide : la question est importée sans son image plutôt que de faire échouer
    // tout le fichier.
  }
}

/**
 * Lit un fichier Moodle XML.
 *
 * `trueFalse` traduit les deux réponses d'une question vrai/faux, que Moodle exporte en anglais.
 * `textToImage` fabrique l'image d'une étiquette de texte à déposer sur une image : le type 12 ne
 * connaît que des images. Il est injecté parce qu'il a besoin d'un `canvas`, absent des tests.
 */
export function parseMoodleXml(
  xml: string,
  trueFalse: (value: string) => string,
  textToImage: (text: string) => string | null = canvasTextToImage,
): MoodleImport {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new MoodleXmlError('exercizer.import.xml.error');

  const grains: ImportedGrain[] = [];
  const images = new Map<number, GrainImages>();
  const unsupported: string[] = [];
  let categories = 0;
  let order = 1;

  const questions = Array.from(document.querySelectorAll('question'));
  for (const question of questions) {
    const type = question.getAttribute('type');
    if (type === 'category') {
      categories++;
      continue;
    }

    // Le `<name>` DIRECT de la question : une calculée a aussi des `<name>` dans ses variables.
    const title = firstText(question, ':scope > name > text');
    const data: GrainData = { title };
    const rank = order++;

    let statement = textOf(question, 'questiontext text');
    if (statement) {
      // L'éditeur de l'ENT ne connaît pas `<i>` : l'italique passe par un style.
      statement = statement.split('<i>').join('<span style="font-style: italic;">');
      statement = statement.split('</i>').join('</span>');
      statement = `<div>${statement}</div>`;
    }

    const grainImages: GrainImages = { in_statement: {}, concat_statement: {}, drag_drop: {} };
    images.set(rank, grainImages);
    Array.from(question.querySelectorAll('questiontext file')).forEach((file, index) =>
      addImage(
        grainImages.in_statement,
        index,
        file.textContent,
        file.getAttribute('name'),
        file.getAttribute('path') ?? '',
      ),
    );
    // TDBase joint l'image à part, et non dans l'énoncé : elle sera posée en tête.
    const joined = textOf(question, 'image_base64');
    if (joined) {
      const parts = textOf(question, 'image').split('/', 2);
      if (parts.length === 2) addImage(grainImages.concat_statement, 0, joined, parts[1]);
    }

    const explanation = textOf(question, 'generalfeedback text');
    if (question.querySelector('generalfeedback text')) {
      data.answer_explanation = plainText(explanation);
    }

    // Les textes à trous portent leur énoncé dans `htmlContent`, la Calculée simple le sien,
    // valeurs figées.
    if (!['description', 'gapselect', 'ddwtos', 'multianswer', 'calculatedsimple'].includes(type ?? '')) {
      data.statement = statement;
    }

    // TDBase ne donne pas de barème : chaque type a alors le sien par défaut.
    const grade = textOf(question, 'defaultgrade');
    const score = grade ? Number(parseFloat(grade).toFixed(2)) : null;

    let grainTypeId: number | null = null;
    switch (type) {
      case 'description':
        grainTypeId = GRAIN.STATEMENT;
        data.custom_data = { statement };
        break;
      case 'shortanswer':
      case 'numerical':
        grainTypeId = fillSimpleOrMultipleAnswer(data, question, score);
        break;
      case 'essay':
        grainTypeId = GRAIN.OPEN_ANSWER;
        data.max_score = score ?? 1;
        break;
      case 'multichoice':
      case 'truefalse':
        grainTypeId = GRAIN.QCM;
        fillQcm(data, question, score, trueFalse);
        break;
      case 'matching':
        grainTypeId = GRAIN.ASSOCIATION;
        fillMatching(data, question, score);
        break;
      case 'gapselect':
      case 'ddwtos':
        grainTypeId = GRAIN.TEXT_TO_FILL;
        fillText(data, question, score, statement);
        break;
      case 'ddimageortext':
        grainTypeId = GRAIN.AREA_SELECT_IMAGE;
        fillAreaSelect(data, question, score, grainImages, textToImage);
        break;
      case 'ddmarker':
        grainTypeId = fillMarkers(data, question, score, grainImages, textToImage);
        break;
      case 'ordering':
        grainTypeId = fillOrdering(data, question, score);
        break;
      case 'multianswer':
        grainTypeId = fillCloze(data, score, statement);
        break;
      case 'calculatedsimple':
        grainTypeId = fillCalculatedSimple(data, question, score, statement);
        break;
      default:
        break;
    }

    if (grainTypeId === null) {
      // Le rang est rendu : une question ignorée — type inconnu, ou contenu que le module ne
      // sait pas représenter — ne doit pas laisser de trou dans le sujet.
      order--;
      images.delete(rank);
      unsupported.push(title);
    }

    else grains.push({ grain_type_id: grainTypeId, order_by: rank, grain_data: data });
  }

  return { grains, images, unsupported, total: questions.length - categories };
}

function fillSimpleOrMultipleAnswer(data: GrainData, question: Element, score: number | null): number {
  const answers = Array.from(question.querySelectorAll('answer'));
  // Une seule réponse attendue : réponse simple. Plusieurs : réponses multiples — Moodle ne
  // distingue pas les deux.
  if (answers.length === 1) {
    data.max_score = score ?? 1;
    data.custom_data = { correct_answer: firstText(answers[0], 'text') };
    return GRAIN.SIMPLE_ANSWER;
  }
  const list: GrainAnswer[] = answers
    .filter((answer) => Number(answer.getAttribute('fraction')) > 0)
    .map((answer) => ({ text: firstText(answer, 'text') }));
  data.max_score = score ?? list.length;
  data.custom_data = { no_error_allowed: false, correct_answer_list: list };
  return GRAIN.MULTIPLE_ANSWERS;
}

function fillQcm(
  data: GrainData,
  question: Element,
  score: number | null,
  trueFalse: (value: string) => string,
): void {
  const isTrueFalse = question.getAttribute('type') === 'truefalse';
  const single = isTrueFalse ? 'true' : textOf(question, 'single');
  const list: GrainAnswer[] = Array.from(question.querySelectorAll('answer')).map((answer) => ({
    text: isTrueFalse
      ? trueFalse(firstText(answer, 'text'))
      : plainText(firstText(answer, 'text')),
    isChecked: Number(answer.getAttribute('fraction')) > 0,
  }));
  data.max_score = score ?? list.filter((answer) => answer.isChecked).length;
  data.custom_data = { no_error_allowed: single === 'true', correct_answer_list: list };
}

function fillMatching(data: GrainData, question: Element, score: number | null): void {
  const list: GrainAnswer[] = Array.from(question.querySelectorAll('subquestion')).map(
    (subQuestion) => ({
      text_left: plainText(firstText(subQuestion, 'text')),
      text_right: plainText(textOf(subQuestion, 'answer text')),
    }),
  );
  data.max_score = score ?? list.length;
  // Moodle ne dit rien de la colonne de gauche ni de la tolérance : valeurs de l'ancienne IHM.
  data.custom_data = { show_left_column: true, no_error_allowed: false, correct_answer_list: list };
}

function fillText(
  data: GrainData,
  question: Element,
  score: number | null,
  statement: string,
): void {
  const dragAndDrop = question.getAttribute('type') === 'ddwtos';
  const answers = Array.from(question.querySelectorAll(dragAndDrop ? 'dragbox' : 'selectoption'));
  /** rang de la réponse → son groupe, pour les seules réponses PLACÉES dans le texte. */
  const groupOf = new Map<number, string>();

  const html = statement
    .replace(/<.?fill-zone.?>/g, '')
    // `[[3]]` désigne la 3e réponse proposée : elle devient la zone, et la bonne réponse.
    .replace(/(\[\[).*?(\]\])/g, (matched) => {
      const index = Number(matched.substring(2, matched.length - 2)) - 1;
      const answer = answers[index];
      if (!answer) return matched;
      groupOf.set(index, firstText(answer, 'group'));
      return FILL_ZONE_TEMPLATE.replace('@ID@', String(index)).replace(
        '@answer@',
        firstText(answer, 'text'),
      );
    });

  const zones: GrainZone[] = [];
  let options: string[] = [];
  answers.forEach((answer, index) => {
    // Un groupe VIDE compte pour « pas de groupe », comme dans l'original (`if (map[index])`).
    const group = groupOf.get(index);
    if (!group) return;
    const response = firstText(answer, 'text');
    // Les propositions d'une zone : la bonne réponse, puis les leurres du même groupe.
    let zoneOptions = [response];
    answers.forEach((other, otherIndex) => {
      if (!groupOf.get(otherIndex) && firstText(other, 'group') === group) {
        zoneOptions.push(firstText(other, 'text'));
      }
    });
    if (dragAndDrop) {
      // Glisser-déposer : les étiquettes sont communes à toutes les zones.
      options = [...new Set([...options, ...zoneOptions])];
      zoneOptions = [];
    }
    zones.push({ answer: response, options: zoneOptions, id: index });
  });

  data.max_score = score ?? zones.length;
  data.custom_data = {
    options,
    zones,
    answersType: dragAndDrop ? 'drag' : 'list',
    htmlContent: html,
  };
}

function fillAreaSelect(
  data: GrainData,
  question: Element,
  score: number | null,
  images: GrainImages,
  textToImage: (text: string) => string | null,
): void {
  // L'image de fond est l'enfant DIRECT `<file>` de la question.
  const guide = Array.from(question.children).find((child) => child.tagName === 'file');
  addImage(images.drag_drop, 0, guide?.textContent, guide?.getAttribute('name'));

  for (const drag of Array.from(question.querySelectorAll('drag'))) {
    const rank = Number(textOf(drag, 'no'));
    const file = drag.querySelector('file');
    if (file && (file.textContent ?? '').length > 0) {
      addImage(images.drag_drop, rank, file.textContent, file.getAttribute('name'));
    } else {
      const text = textOf(drag, 'text');
      addImage(images.drag_drop, rank, textToImage(text), `${text.replace(/[^\w]/gi, '')}.png`);
    }
  }

  const zones: GrainZone[] = Array.from(question.querySelectorAll('drop')).map((drop) => ({
    position: {
      x: Number(textOf(drop, 'xleft')),
      y: Number(textOf(drop, 'ytop')),
      z: Number(textOf(drop, 'no')),
    },
    // Provisoire : le RANG de l'étiquette attendue, remplacé par son lien après le dépôt.
    answer: textOf(drop, 'choice'),
  }));

  data.max_score = score ?? zones.length;
  data.custom_data = { zones, options: [] };
}

/**
 * Mise en ordre (`ordering`, extension Moodle). Les éléments sont exportés dans le bon ordre, leur
 * position rangée dans `fraction` (1, 2, 3…) : on s'y fie si elle est complète et sans doublon,
 * sinon on garde l'ordre du fichier.
 */
function fillOrdering(data: GrainData, question: Element, score: number | null): number | null {
  const items = Array.from(question.querySelectorAll('answer')).map((answer, index) => ({
    text: plainText(firstText(answer, 'text')).trim(),
    rank: Number(answer.getAttribute('fraction')),
    index,
  }));
  if (items.length < 2) return null;
  const ranked =
    items.every((item) => Number.isFinite(item.rank)) &&
    new Set(items.map((item) => item.rank)).size === items.length;
  items.sort((a, b) => (ranked ? a.rank - b.rank : a.index - b.index));
  data.max_score = score ?? items.length;
  data.custom_data = {
    no_error_allowed: false,
    correct_answer_list: items.map((item, position) => ({ text: item.text, order_by: position + 1 })),
  };
  return GRAIN.ORDER_BY;
}

// ── Cloze (réponses intégrées) ────────────────────────────────────────────────

/** Un trou cloze : `{poids:TYPE:réponses}`, accolade fermante échappée par `\}`. */
const CLOZE_GAP = /\{(\d*):([A-Z_]+):((?:\\.|[^\\}])*)\}/g;

type ClozeFamily = 'text' | 'numerical' | 'choice';

/** Les familles que le texte à trous sait représenter ; les réponses multiples (MR) n'en sont pas. */
function clozeFamily(kind: string): ClozeFamily | null {
  if (/^(SHORTANSWER(_C)?|SA|MW|SAC|MWC)$/.test(kind)) return 'text';
  if (/^(NUMERICAL|NM)$/.test(kind)) return 'numerical';
  if (/^(MULTICHOICE(_[VH]?S?)?|MC[VH]?S?)$/.test(kind)) return 'choice';
  return null;
}

/** Découpe sur un séparateur non échappé. */
function splitUnescaped(text: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && i + 1 < text.length) {
      current += text[i] + text[i + 1];
      i++;
    } else if (text[i] === separator) {
      parts.push(current);
      current = '';
    } else {
      current += text[i];
    }
  }
  parts.push(current);
  return parts;
}

const unescapeCloze = (text: string) => text.replace(/\\(.)/g, '$1');

/** Les réponses d'un trou : `=bonne`, `%50%partielle`, `fausse`, chacune suivie d'un `#commentaire`. */
export function parseClozeAnswers(body: string): { text: string; fraction: number }[] {
  return splitUnescaped(body, '~')
    .map((raw) => splitUnescaped(raw, '#')[0])
    .filter((raw) => raw.trim().length > 0)
    .map((raw) => {
      const weighted = /^%(-?\d+(?:\.\d+)?)%/.exec(raw);
      if (raw.startsWith('=')) return { text: unescapeCloze(raw.slice(1)), fraction: 100 };
      if (weighted) return { text: unescapeCloze(raw.slice(weighted[0].length)), fraction: Number(weighted[1]) };
      return { text: unescapeCloze(raw), fraction: 0 };
    });
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Cloze (`multianswer`) → texte à trous. Chaque trou devient une zone dont la réponse est la
 * réponse à 100 %. Le texte à trous n'a qu'un mode de réponse pour toutes ses zones : listes si
 * TOUS les trous sont des choix, saisie libre sinon. Une seule bonne réponse par zone : les
 * variantes acceptées d'une réponse courte, et les réponses partielles, sont perdues.
 *
 * La question est écartée si un trou n'a pas d'équivalent : réponses multiples (MR), réponse
 * numérique avec tolérance, joker `*` d'une réponse courte, ou trou sans réponse à 100 %.
 */
function fillCloze(data: GrainData, score: number | null, statement: string): number | null {
  const gaps: { answer: string; options: string[]; family: ClozeFamily }[] = [];
  let representable = true;

  const html = statement.replace(CLOZE_GAP, (matched, _weight: string, kind: string, body: string) => {
    const family = clozeFamily(kind);
    const answers = parseClozeAnswers(body);
    const correct = answers.find((answer) => answer.fraction === 100);
    if (!family || !correct) {
      representable = false;
      return matched;
    }
    let answer = plainText(correct.text).trim();
    if (family === 'numerical') {
      const [value, tolerance] = answer.split(':');
      if (tolerance !== undefined && Number(tolerance) !== 0) {
        representable = false;
        return matched;
      }
      answer = value.trim().replace('.', ',');
    }
    if (family === 'text' && answer.includes('*')) {
      representable = false;
      return matched;
    }
    const options = family === 'choice' ? answers.map((option) => plainText(option.text).trim()) : [];
    const id = gaps.length;
    gaps.push({ answer, options, family });
    return (
      '<span contenteditable="false">' +
      FILL_ZONE_TEMPLATE.replace('@ID@', String(id)).replace('@answer@', escapeHtml(answer))
    );
  });

  if (!representable || gaps.length === 0) return null;
  const allChoices = gaps.every((gap) => gap.family === 'choice');
  data.max_score = score ?? gaps.length;
  data.custom_data = {
    options: [],
    zones: gaps.map((gap, id) => ({ answer: gap.answer, options: allChoices ? gap.options : [], id })),
    answersType: allChoices ? 'list' : 'text',
    htmlContent: html,
  };
  return GRAIN.TEXT_TO_FILL;
}

// ── Marqueurs à glisser-déposer ───────────────────────────────────────────────

/**
 * Coin haut-gauche d'une zone Moodle. Les zones d'images de l'ENT sont des cases posées en un
 * point : un cercle, un rectangle ou un polygone est ramené au coin de son rectangle englobant.
 */
export function markerTopLeft(shape: string, coords: string): { x: number; y: number } | null {
  const points = coords
    .split(';')
    .map((pair) => pair.split(',').map((value) => Number(value.trim())));
  if (points.some((point) => point.some((value) => !Number.isFinite(value)))) return null;
  switch (shape.trim()) {
    case 'circle': {
      // « x,y;r »
      const [[x, y], [radius]] = points;
      if (radius === undefined) return null;
      return { x: Math.round(x - radius), y: Math.round(y - radius) };
    }
    case 'rectangle': {
      // « x,y;largeur,hauteur »
      const [[x, y]] = points;
      return { x: Math.round(x), y: Math.round(y) };
    }
    case 'polygon': {
      // « x1,y1;x2,y2;… »
      if (points.some((point) => point.length < 2)) return null;
      return {
        x: Math.round(Math.min(...points.map(([x]) => x))),
        y: Math.round(Math.min(...points.map(([, y]) => y))),
      };
    }
    default:
      return null;
  }
}

/**
 * Marqueurs à glisser-déposer (`ddmarker`) → zones d'images, comme `ddimageortext` : chaque
 * étiquette (texte) devient une image, chaque zone attend la sienne. Moodle note la PRÉSENCE d'un
 * marqueur dans une forme ; l'ENT, une étiquette posée dans une case.
 */
function fillMarkers(
  data: GrainData,
  question: Element,
  score: number | null,
  images: GrainImages,
  textToImage: (text: string) => string | null,
): number | null {
  const guide = Array.from(question.children).find((child) => child.tagName === 'file');
  if (!guide) return null;
  addImage(images.drag_drop, 0, guide.textContent, guide.getAttribute('name'));

  for (const drag of Array.from(question.querySelectorAll('drag'))) {
    const text = plainText(textOf(drag, 'text')).trim();
    addImage(
      images.drag_drop,
      Number(textOf(drag, 'no')),
      textToImage(text),
      `${text.replace(/[^\w]/gi, '') || 'marqueur'}.png`,
    );
  }

  const zones: GrainZone[] = [];
  for (const [index, drop] of Array.from(question.querySelectorAll('drop')).entries()) {
    const corner = markerTopLeft(textOf(drop, 'shape'), textOf(drop, 'coords'));
    if (!corner) return null;
    zones.push({
      position: { ...corner, z: Number(textOf(drop, 'no')) || index + 1 },
      // Provisoire : le RANG de l'étiquette attendue, remplacé par son lien après le dépôt.
      answer: textOf(drop, 'choice'),
    });
  }
  if (zones.length === 0) return null;

  data.max_score = score ?? zones.length;
  data.custom_data = { zones, options: [] };
  return GRAIN.AREA_SELECT_IMAGE;
}

// ── Calculée simple ───────────────────────────────────────────────────────────

/** Un nombre à la française : virgule décimale. */
const frenchNumber = (value: number) => String(value).replace('.', ',');

/**
 * Calculée simple (`calculatedsimple`) → réponse simple, valeurs FIGÉES : chaque variable prend
 * la première valeur de son jeu de données, l'énoncé est écrit avec ces valeurs et la réponse
 * attendue est calculée une fois pour toutes. Moodle tirait un jeu différent par élève et
 * acceptait une tolérance ; l'ENT compare une réponse exacte, d'où l'indice sur l'arrondi.
 */
function fillCalculatedSimple(
  data: GrainData,
  question: Element,
  score: number | null,
  statement: string,
): number | null {
  const variables = new Map<string, number>();
  for (const definition of Array.from(question.querySelectorAll('dataset_definition'))) {
    const name = firstText(definition, 'name text').trim();
    const item = definition.querySelector('dataset_items dataset_item');
    const value = item ? Number(textOf(item, 'value')) : Number.NaN;
    if (!name || !Number.isFinite(value)) return null;
    variables.set(name, value);
  }

  const answer = Array.from(question.querySelectorAll('answer')).find(
    (candidate) => Number(candidate.getAttribute('fraction')) === 100,
  );
  if (!answer) return null;
  const result = evaluateFormula(firstText(answer, 'text'), variables);
  if (result === null) return null;

  const significant = textOf(answer, 'correctanswerformat').trim() === '2';
  const length = Number(textOf(answer, 'correctanswerlength') || 2);
  const rounded = significant
    ? Number(result.toPrecision(Math.min(21, Math.max(1, length))))
    : Number(result.toFixed(Math.min(20, Math.max(0, length))));

  // Les formules en ligne `{={a}*2}`, puis les variables `{a}`.
  let text = statement.replace(/\{=((?:[^{}]|\{\w+\})*)\}/g, (matched, formula: string) => {
    const value = evaluateFormula(formula, variables);
    return value === null ? matched : frenchNumber(value);
  });
  for (const [name, value] of variables) text = text.split(`{${name}}`).join(frenchNumber(value));
  if (/\{[A-Za-z_]\w*\}/.test(text)) return null;

  data.statement = text;
  data.max_score = score ?? 1;
  data.answer_hint = significant
    ? `Donnez le résultat avec ${length} chiffre(s) significatif(s).`
    : length > 0
      ? `Arrondissez le résultat à ${length} décimale(s) au plus, avec une virgule.`
      : 'Donnez le résultat arrondi à l’unité.';
  data.custom_data = { correct_answer: frenchNumber(rounded) };
  return GRAIN.SIMPLE_ANSWER;
}

/** Les fonctions des formules Moodle (celles de PHP), et leur nombre d'arguments. */
const FORMULA_FUNCTIONS: Record<string, { arity: number[]; apply: (...args: number[]) => number }> = {
  abs: { arity: [1], apply: Math.abs },
  acos: { arity: [1], apply: Math.acos },
  acosh: { arity: [1], apply: Math.acosh },
  asin: { arity: [1], apply: Math.asin },
  asinh: { arity: [1], apply: Math.asinh },
  atan: { arity: [1], apply: Math.atan },
  atan2: { arity: [2], apply: Math.atan2 },
  atanh: { arity: [1], apply: Math.atanh },
  ceil: { arity: [1], apply: Math.ceil },
  cos: { arity: [1], apply: Math.cos },
  cosh: { arity: [1], apply: Math.cosh },
  deg2rad: { arity: [1], apply: (x) => (x * Math.PI) / 180 },
  exp: { arity: [1], apply: Math.exp },
  expm1: { arity: [1], apply: Math.expm1 },
  floor: { arity: [1], apply: Math.floor },
  fmod: { arity: [2], apply: (x, y) => x % y },
  log: { arity: [1, 2], apply: (x, base) => (base === undefined ? Math.log(x) : Math.log(x) / Math.log(base)) },
  log10: { arity: [1], apply: Math.log10 },
  log1p: { arity: [1], apply: Math.log1p },
  max: { arity: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], apply: Math.max },
  min: { arity: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], apply: Math.min },
  pi: { arity: [0], apply: () => Math.PI },
  pow: { arity: [2], apply: Math.pow },
  rad2deg: { arity: [1], apply: (x) => (x * 180) / Math.PI },
  round: {
    arity: [1, 2],
    apply: (x, digits = 0) => Math.round(x * 10 ** digits) / 10 ** digits,
  },
  sin: { arity: [1], apply: Math.sin },
  sinh: { arity: [1], apply: Math.sinh },
  sqrt: { arity: [1], apply: Math.sqrt },
  tan: { arity: [1], apply: Math.tan },
  tanh: { arity: [1], apply: Math.tanh },
};

/**
 * Évalue une formule de question calculée : nombres, variables `{a}`, `+ - * / % **`,
 * parenthèses et fonctions de {@link FORMULA_FUNCTIONS}. Jamais d'`eval` : un fichier importé
 * vient de l'extérieur. Renvoie null pour toute formule illisible ou tout résultat non fini.
 */
export function evaluateFormula(formula: string, variables: Map<string, number>): number | null {
  const tokens = formula.match(/\{[A-Za-z_]\w*\}|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+|[A-Za-z_]\w*|\*\*|[-+*/%(),]|\S/g) ?? [];
  let position = 0;
  const peek = () => tokens[position];
  const next = () => tokens[position++];
  const fail = (): never => {
    throw new Error('formula');
  };

  // expression := terme (('+' | '-') terme)*
  const expression = (): number => {
    let value = term();
    while (peek() === '+' || peek() === '-') value = next() === '+' ? value + term() : value - term();
    return value;
  };
  // terme := puissance (('*' | '/' | '%') puissance)*
  const term = (): number => {
    let value = power();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const operator = next();
      const right = power();
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
    }
    return value;
  };
  // puissance := unaire ('**' puissance)?   (associative à droite)
  const power = (): number => {
    const base = unary();
    return peek() === '**' ? (next(), base ** power()) : base;
  };
  const unary = (): number => {
    if (peek() === '-') return next(), -unary();
    if (peek() === '+') return next(), unary();
    return primary();
  };
  const primary = (): number => {
    const token = next();
    if (token === undefined) return fail();
    if (token === '(') {
      const value = expression();
      if (next() !== ')') fail();
      return value;
    }
    if (/^\{\w+\}$/.test(token)) {
      const value = variables.get(token.slice(1, -1));
      return value === undefined ? fail() : value;
    }
    if (/^(\d|\.\d)/.test(token)) return Number(token);
    const fn = FORMULA_FUNCTIONS[token.toLowerCase()];
    if (!fn || next() !== '(') return fail();
    const args: number[] = [];
    if (peek() !== ')') {
      args.push(expression());
      while (peek() === ',') {
        next();
        args.push(expression());
      }
    }
    if (next() !== ')' || !fn.arity.includes(args.length)) fail();
    return fn.apply(...args);
  };

  try {
    const value = expression();
    if (position !== tokens.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Dessine un texte dans une image PNG, rendue en base64 sans son préfixe `data:`. */
function canvasTextToImage(text: string): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  canvas.width = Math.max(1, Math.ceil(context.measureText(text).width));
  canvas.height = 20;
  context.fillText(text, 0, 10);
  return canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '');
}

/** Toutes les images d'un import, à plat — celles que l'écran doit déposer. */
export function allImages(images: Map<number, GrainImages>): ImportedImage[] {
  const list: ImportedImage[] = [];
  for (const grainImages of images.values()) {
    list.push(
      ...Object.values(grainImages.in_statement),
      ...Object.values(grainImages.concat_statement),
      ...Object.values(grainImages.drag_drop),
    );
  }
  return list;
}

const IMG_TAG = /<img [-a-z0-9%_@/.="A-Z\s]+/g;

/**
 * Remplace dans les grains les références Moodle par les liens des images déposées. À appeler
 * une fois `link` renseigné sur chaque image (chaîne vide si le dépôt a échoué).
 */
export function applyImageLinks(grains: ImportedGrain[], images: Map<number, GrainImages>): void {
  for (const grain of grains) {
    const grainImages = images.get(grain.order_by);
    if (!grainImages) continue;
    const data = grain.grain_data;
    const custom = data.custom_data ?? {};

    const joined = grainImages.concat_statement[0];
    if (joined) {
      // Une image par question, posée avant l'énoncé.
      const tag = `<div></div><div><img src="${joined.link ?? ''}" draggable="" native=""><div><div></div>`;
      if (custom.statement) custom.statement = tag + custom.statement;
      else data.statement = tag + (data.statement ?? '');
    }

    if (Object.keys(grainImages.drag_drop).length > 0) {
      // Zones d'images : la première image est le fond, les autres les étiquettes ; chaque zone
      // désignait la sienne par son rang.
      custom._guideImage = grainImages.drag_drop[0]?.link ?? '';
      const options: string[] = [];
      for (const zone of custom.zones ?? []) {
        zone.answer = grainImages.drag_drop[Number(zone.answer)]?.link ?? '';
        options.push(zone.answer);
      }
      custom.options = options;
    }

    if (Object.keys(grainImages.in_statement).length > 0) {
      const isFillText = grain.grain_type_id === GRAIN.TEXT_TO_FILL;
      let statement = isFillText ? custom.htmlContent : data.statement || custom.statement;
      if (statement) {
        for (const image of Object.values(grainImages.in_statement)) {
          const reference = `@@PLUGINFILE@@${image.path}${encodeURIComponent(image.name)}`;
          statement = statement.replace(IMG_TAG, (matched) =>
            matched.includes(reference) ? `<img src="${image.link ?? ''}"/` : matched,
          );
        }
      }
      if (isFillText) custom.htmlContent = statement;
      else if (data.statement) data.statement = statement;
      else custom.statement = statement;
    }

    data.custom_data = custom;
  }
}
