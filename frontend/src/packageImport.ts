/**
 * Créer un sujet à partir d'un fichier venu d'ailleurs — Moodle (XML, sauvegarde .mbz, GIFT,
 * Aiken), QTI, Common Cartridge, OEIP, SCORM, cmi5, LearnHouse.
 *
 * Le serveur reconnaît le format au CONTENU du fichier et rend, sans rien créer, l'analyse de la
 * conversion : ce qui sera créé (`preview`, les grains), ce qui sera perdu (`notices`), et pour un
 * paquet OEIP la liste des sujets qu'il porte (`POST /subject/import-package`, essai à blanc).
 *
 * La création passe ensuite par la route d'import ordinaire (`POST /subject/import`), avec ce que
 * l'enseignant a saisi : le titre, la description, le dossier courant. Une banque Moodle XML est
 * relue ICI (`moodleImport.ts`) : c'est le seul chemin qui reprend ses images.
 */

import { ImportedGrain } from './moodleImport';
import { CatalogReferential, Classification, Grain, GrainData } from './types';

export type NoticeLevel = 'info' | 'degraded' | 'dropped' | 'error';

export interface ConversionNotice {
  level: NoticeLevel;
  code: string;
  message: string;
  location?: string | null;
}

export interface PackageSubjectChoice {
  index: number;
  title: string;
  grains: number;
  levels: string[];
  disciplines: string[];
}

export interface PackageAnalysis {
  /** `moodle-xml`, `moodle`, `gift`, `aiken`, `qti`, `imscc`, `oeip`, `scorm12`… */
  format: string;
  formatLabel: string;
  sourceSystem?: string | null;
  sourceVersion?: string | null;
  title?: string | null;
  counts: { sections: number; activities: number; questions: number; grains: number };
  fidelity: 'full' | 'partial';
  notices: ConversionNotice[];
  /** Ce qui serait créé ; absent quand rien n'est convertible. */
  preview?: {
    subject: { title?: string; description?: string };
    grains: ImportedGrain[];
  };
  /** Paquet OEIP : les sujets qu'il porte, et celui que l'aperçu montre. */
  subjects?: PackageSubjectChoice[];
  selected?: number;
  levels?: string[];
  disciplines?: string[];
  /** Images citées par les grains (`src="<id>"`), à déposer dans l'espace documentaire. */
  assets?: PackageAsset[];
}

export interface PackageAsset {
  /** La chaîne qui figure dans le HTML des grains, à remplacer par l'adresse du fichier. */
  id: string;
  fileName: string;
  mimeType: string;
  /** Contenu en base 64. */
  data: string;
}

/** Le contenu d'une image de l'analyse, prêt à afficher ou à déposer. */
export function assetBlob(asset: PackageAsset): Blob {
  const binary = atob(asset.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: asset.mimeType });
}

/**
 * Remplace, dans tous les champs des grains, chaque identifiant d'image par son adresse. Les plus
 * longs d'abord : un identifiant peut en prolonger un autre (`a.png` / `a.png.old`).
 */
export function replaceAssetRefs(grains: ImportedGrain[], links: Map<string, string>): ImportedGrain[] {
  if (links.size === 0) return grains;
  let json = JSON.stringify(grains);
  [...links.keys()]
    .sort((a, b) => b.length - a.length)
    .forEach((id) => {
      json = json.split(id).join(links.get(id) ?? '');
    });
  return JSON.parse(json) as ImportedGrain[];
}

/** Un refus du serveur, porteur de sa clé i18n (`exercizer.import.format.unknown`…). */
export class PackageImportError extends Error {}

/** Les formats acceptés, pour le sélecteur de fichier et l'écran d'accueil. */
export const PACKAGE_FORMATS: Array<{ key: string; label: string; extensions: string[] }> = [
  { key: 'moodle', label: 'Moodle', extensions: ['.xml', '.mbz', '.gift', '.txt'] },
  { key: 'oeip', label: 'OEIP (Open ENT)', extensions: ['.oeip', '.zip'] },
  { key: 'qti', label: 'QTI 2.1 / 2.2 / 3.0', extensions: ['.zip', '.xml'] },
  { key: 'imscc', label: 'Common Cartridge 1.0 → 1.3', extensions: ['.imscc', '.zip'] },
  { key: 'scorm', label: 'SCORM / cmi5 / xAPI', extensions: ['.zip'] },
  { key: 'learnhouse', label: 'LearnHouse', extensions: ['.zip'] },
];

export const PACKAGE_ACCEPT = Array.from(
  new Set(PACKAGE_FORMATS.flatMap((format) => format.extensions)),
).join(',');

function xsrfHeader(): Record<string, string> {
  const m = typeof document !== 'undefined' ? document.cookie.match(/XSRF-TOKEN=([^;]+)/) : null;
  return m ? { 'X-XSRF-TOKEN': decodeURIComponent(m[1]) } : {};
}

/**
 * Essai à blanc : le fichier est analysé et converti, rien n'est créé. `item` choisit le sujet
 * montré quand le paquet en porte plusieurs (OEIP).
 */
export async function analysePackage(file: File, item = 0): Promise<PackageAnalysis> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch(`/exercizer/subject/import-package?item=${item}`, {
    credentials: 'include',
    method: 'POST',
    headers: xsrfHeader(),
    body,
  });
  if (res.status === 413) throw new PackageImportError('exercizer.package.error.too.large');
  const text = await res.text();
  let payload: { error?: string; analysis?: PackageAnalysis } | null = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!res.ok) {
    const key = payload?.error;
    throw new PackageImportError(
      key && key.startsWith('exercizer.') ? key : 'exercizer.package.error.unreadable',
    );
  }
  if (!payload?.analysis) throw new PackageImportError('exercizer.package.error.unreadable');
  return payload.analysis;
}

/** Le texte d'un fragment HTML, paragraphes séparés par un saut de ligne. */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return '';
  if (!/<[a-z!/]/i.test(html)) return html;
  const body = new DOMParser().parseFromString(
    html.replace(/<\/(p|div|li|h[1-6])>|<br\s*\/?>/gi, (tag) => `${tag}\n`),
    'text/html',
  ).body;
  return (body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * L'explication d'un grain est du TEXTE dans exercizer (zone de texte des deux éditeurs,
 * affichage tel quel à la correction). Un paquet OEIP peut y porter du HTML : on le réduit à son
 * texte, sans quoi les balises s'afficheraient littéralement à l'élève.
 */
export function normaliseGrains(grains: ImportedGrain[]): ImportedGrain[] {
  return grains.map((grain) => {
    const explanation = grain.grain_data?.answer_explanation;
    if (!explanation || !/<[a-z!/]/i.test(explanation)) return grain;
    return { ...grain, grain_data: { ...grain.grain_data, answer_explanation: htmlToText(explanation) } };
  });
}

/** Les grains de l'aperçu, sous la forme des grains d'un sujet, pour les rendre à l'écran. */
export function previewGrains(grains: ImportedGrain[]): Grain[] {
  return grains.map((grain, index) => ({
    id: -(index + 1),
    subject_id: 0,
    grain_type_id: grain.grain_type_id,
    order_by: index,
    grain_data: (grain.grain_data ?? {}) as GrainData,
  }));
}

/** Les avertissements, du plus grave au plus anodin. */
export function sortNotices(notices: ConversionNotice[]): ConversionNotice[] {
  const rank: Record<NoticeLevel, number> = { error: 0, dropped: 1, degraded: 2, info: 3 };
  return [...notices].sort((a, b) => (rank[a.level] ?? 4) - (rank[b.level] ?? 4));
}

/**
 * Le classement porté par un paquet OEIP (codes de niveaux et de matières, ceux des packs) en
 * identifiants du référentiel. Un code inconnu est simplement ignoré.
 */
export function classificationFromCodes(
  referential: CatalogReferential | undefined,
  levels: string[] = [],
  disciplines: string[] = [],
): Classification {
  if (!referential) return { level_ids: [], discipline_ids: [] };
  const wantedLevels = new Set(levels.map((code) => code.toUpperCase()));
  const wantedDisciplines = new Set(disciplines.map((code) => code.toUpperCase()));
  return {
    level_ids: referential.levels
      .filter((level) => level.code && wantedLevels.has(level.code.toUpperCase()))
      .map((level) => level.id),
    discipline_ids: referential.disciplines
      .filter((discipline) => discipline.code && wantedDisciplines.has(discipline.code.toUpperCase()))
      .map((discipline) => discipline.id),
  };
}

/** Le titre proposé : celui du sujet converti, sinon le nom du fichier sans extension. */
export function suggestedTitle(analysis: PackageAnalysis | null, fileName: string): string {
  const fromPackage = analysis?.preview?.subject?.title?.trim();
  if (fromPackage && fromPackage !== 'Cours importé') return fromPackage;
  const fromAnalysis = analysis?.title?.trim();
  if (fromAnalysis) return fromAnalysis;
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}
