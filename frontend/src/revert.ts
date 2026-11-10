/**
 * « Annuler les modifications » de l'éditeur de sujet.
 *
 * L'éditeur enregistre au fil de la frappe : au moment d'annuler, tout est déjà sur le serveur.
 * Annuler, c'est donc REVENIR à l'image du sujet prise à l'ouverture de l'éditeur, par différence :
 * ce qui a été ajouté est supprimé, ce qui a été supprimé est recréé, ce qui a été modifié est
 * réenregistré tel qu'il était, puis l'ordre est rétabli d'un bloc.
 *
 * ⚠ Une question ou une partie recréée change d'identifiant. Rien ne s'y réfère : les copies
 * distribuées sont des instantanés (`grain_scheduled`), pas des renvois vers `grain`.
 *
 * Hors périmètre : les ressources externes et les propriétés du sujet, enregistrées à part par
 * leur propre bouton.
 */

import { SubjectStructure } from './api';
import { byOrder } from './grains';
import { Grain, Section } from './types';

/** Le sujet tel qu'il était à l'ouverture de l'éditeur. */
export interface EditorSnapshot {
  grains: Grain[];
  sections: Section[];
}

/** Ce qu'une annulation défera — c'est aussi ce que la confirmation énumère. */
export interface SnapshotDiff {
  /** Grains apparus depuis l'ouverture (ajoutés, dupliqués, repris d'un autre sujet) : supprimés. */
  addedGrains: Grain[];
  /** Grains disparus depuis l'ouverture, dans leur version d'origine : recréés. */
  removedGrains: Grain[];
  /** Grains dont le type ou le contenu a changé, dans leur version d'origine : réenregistrés. */
  modifiedGrains: Grain[];
  addedSections: Section[];
  removedSections: Section[];
  modifiedSections: Section[];
  /** L'ordre des grains (ou leur partie), ou celui des parties, a changé. */
  reordered: boolean;
}

/** JSON aux clés triées : deux objets égaux le restent quel que soit l'ordre de leurs clés. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const grainChanged = (before: Grain, after: Grain) =>
  before.grain_type_id !== after.grain_type_id ||
  stableStringify(before.grain_data) !== stableStringify(after.grain_data);

const sectionChanged = (before: Section, after: Section) =>
  before.title !== after.title || (before.description ?? null) !== (after.description ?? null);

const sectionsByOrder = (sections: Section[]) => [...sections].sort((a, b) => a.order_by - b.order_by);

/** L'arbre réduit aux grains et parties présents des deux côtés : ce qui dit si l'ordre a bougé. */
function orderKey(grains: Grain[], sections: Section[], grainIds: Set<number>, sectionIds: Set<number>) {
  const grainOrder = byOrder(grains)
    .filter((grain) => grainIds.has(grain.id))
    .map((grain) => `${grain.section_id ?? '-'}:${grain.id}`);
  const sectionOrder = sectionsByOrder(sections)
    .filter((section) => sectionIds.has(section.id))
    .map((section) => section.id);
  return `${grainOrder.join(',')}|${sectionOrder.join(',')}`;
}

export function diffSnapshot(snapshot: EditorSnapshot, grains: Grain[], sections: Section[]): SnapshotDiff {
  const grainsNow = new Map(grains.map((grain) => [grain.id, grain]));
  const grainsBefore = new Map(snapshot.grains.map((grain) => [grain.id, grain]));
  const sectionsNow = new Map(sections.map((section) => [section.id, section]));
  const sectionsBefore = new Map(snapshot.sections.map((section) => [section.id, section]));

  const commonGrains = new Set(snapshot.grains.filter((grain) => grainsNow.has(grain.id)).map((grain) => grain.id));
  const commonSections = new Set(
    snapshot.sections.filter((section) => sectionsNow.has(section.id)).map((section) => section.id),
  );

  return {
    addedGrains: byOrder(grains.filter((grain) => !grainsBefore.has(grain.id))),
    // Un grain illisible n'a pas pu être modifié, et on ne saurait pas le réécrire.
    removedGrains: byOrder(snapshot.grains.filter((grain) => !grainsNow.has(grain.id) && !grain.unreadable)),
    modifiedGrains: byOrder(
      snapshot.grains.filter(
        (grain) => commonGrains.has(grain.id) && !grain.unreadable && grainChanged(grain, grainsNow.get(grain.id)!),
      ),
    ),
    addedSections: sectionsByOrder(sections.filter((section) => !sectionsBefore.has(section.id))),
    removedSections: sectionsByOrder(snapshot.sections.filter((section) => !sectionsNow.has(section.id))),
    modifiedSections: sectionsByOrder(
      snapshot.sections.filter(
        (section) => commonSections.has(section.id) && sectionChanged(section, sectionsNow.get(section.id)!),
      ),
    ),
    reordered:
      orderKey(snapshot.grains, snapshot.sections, commonGrains, commonSections) !==
      orderKey(grains, sections, commonGrains, commonSections),
  };
}

export const isEmptyDiff = (diff: SnapshotDiff) =>
  !diff.reordered &&
  diff.addedGrains.length === 0 &&
  diff.removedGrains.length === 0 &&
  diff.modifiedGrains.length === 0 &&
  diff.addedSections.length === 0 &&
  diff.removedSections.length === 0 &&
  diff.modifiedSections.length === 0;

/** Les appels au serveur dont la restauration a besoin — injectés, pour les tests. */
export interface RevertApi {
  createGrain: (grain: Omit<Grain, 'id'>) => Promise<{ id: number }>;
  updateGrain: (grain: Grain) => Promise<unknown>;
  removeGrains: (subjectId: number, grainIds: number[]) => Promise<unknown>;
  createSection: (subjectId: number, section: Pick<Section, 'title' | 'description'>) => Promise<Section>;
  updateSection: (section: Section) => Promise<unknown>;
  removeSection: (subjectId: number, sectionId: number, withGrains: boolean) => Promise<unknown>;
  saveStructure: (subjectId: number, structure: SubjectStructure) => Promise<unknown>;
}

/**
 * Rétablit le sujet dans l'état de `snapshot`. Les étapes sont ordonnées pour que chacune trouve
 * ce dont elle a besoin : les parties recréées avant les grains qu'elles accueillent, l'ordre en
 * dernier, quand tous les identifiants sont connus.
 *
 * Rejouable : en cas d'échec à mi-chemin, on relit le sujet, on recalcule la différence et on
 * relance — ce qui a déjà été rétabli n'y figure plus.
 */
export async function revertToSnapshot(
  api: RevertApi,
  subjectId: number,
  snapshot: EditorSnapshot,
  grains: Grain[],
  sections: Section[],
): Promise<void> {
  const diff = diffSnapshot(snapshot, grains, sections);
  // Un sujet sans partie, avant comme après (dont ceux de la bibliothèque, qui n'ont pas de route de
  // parties) : l'ordre tient tout entier dans `order_by`, sans passer par `PUT /structure`.
  const withStructure = snapshot.sections.length > 0 || sections.length > 0;

  if (diff.addedGrains.length > 0) {
    await api.removeGrains(subjectId, diff.addedGrains.map((grain) => grain.id));
  }
  // Ce qui reste d'une partie ajoutée (des grains d'origine qu'on y avait rangés) rejoint la partie
  // précédente ; l'arbre rétabli à la fin les remet à leur place.
  for (const section of diff.addedSections) {
    await api.removeSection(subjectId, section.id, false);
  }

  const sectionIds = new Map<number, number>();
  for (const section of diff.removedSections) {
    const created = await api.createSection(subjectId, section);
    sectionIds.set(section.id, created.id);
  }
  await Promise.all(diff.modifiedSections.map((section) => api.updateSection(section)));
  const sectionId = (id: number | null | undefined) => (id == null ? null : (sectionIds.get(id) ?? id));

  const grainIds = new Map<number, number>();
  for (const grain of diff.removedGrains) {
    const { id: _id, ...rest } = grain;
    const created = await api.createGrain({ ...rest, section_id: sectionId(grain.section_id) });
    grainIds.set(grain.id, created.id);
  }
  await Promise.all(diff.modifiedGrains.map((grain) => api.updateGrain(grain)));
  const grainId = (id: number) => grainIds.get(id) ?? id;

  if (withStructure) {
    // Un grain illisible supprimé n'a pas été recréé : il n'a plus de place à tenir.
    const present = new Set(grains.map((grain) => grain.id));
    const ordered = byOrder(snapshot.grains).filter((grain) => present.has(grain.id) || grainIds.has(grain.id));
    await api.saveStructure(subjectId, {
      ungrouped: ordered.filter((grain) => grain.section_id == null).map((grain) => grainId(grain.id)),
      sections: sectionsByOrder(snapshot.sections).map((section) => ({
        id: sectionId(section.id)!,
        grainIds: ordered.filter((grain) => grain.section_id === section.id).map((grain) => grainId(grain.id)),
      })),
    });
  } else if (diff.reordered) {
    // Les grains modifiés et recréés sont déjà repartis avec leur rang d'origine.
    const done = new Set(diff.modifiedGrains.map((grain) => grain.id));
    const now = new Map(grains.map((grain) => [grain.id, grain]));
    await Promise.all(
      snapshot.grains
        .filter((grain) => {
          const current = now.get(grain.id);
          return current && !done.has(grain.id) && !grain.unreadable && current.order_by !== grain.order_by;
        })
        .map((grain) => api.updateGrain({ ...now.get(grain.id)!, order_by: grain.order_by })),
    );
  }
}
