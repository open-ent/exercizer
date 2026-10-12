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

    const title = textOf(question, 'name text');
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

    if (type !== 'description' && type !== 'gapselect' && type !== 'ddwtos') {
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
      default:
        // Le rang est rendu : une question ignorée ne doit pas laisser de trou dans le sujet.
        order--;
        images.delete(rank);
        unsupported.push(title);
    }

    if (grainTypeId !== null) grains.push({ grain_type_id: grainTypeId, order_by: rank, grain_data: data });
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
