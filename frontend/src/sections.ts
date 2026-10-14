/**
 * Règles des sections d'un sujet (sql/039) — sur le modèle Chapitre → Activités de LearnHouse.
 *
 * Un sujet se lit comme une suite de GROUPES : d'abord les grains hors section (en tête), puis
 * chaque section dans son ordre. `grain.order_by` reste un rang global et continu, section par
 * section : c'est ce qui permet à l'IHM AngularJS, qui ignore les sections, de rester cohérente.
 *
 * Sans réseau ni composant, comme `grains.ts` (cf. `sections.test.ts`).
 */

import type { SubjectStructure } from './api';
import { byOrder, computedMaxScore, isQuestion } from './grains';
import { Grain, ScheduledSection, Section } from './types';

/** Un groupe de grains : une section, ou `null` pour les grains hors section. */
export interface SectionGroup<S, G> {
  section: S | null;
  grains: G[];
}

export type EditorGroup = SectionGroup<Section, Grain>;

const bySectionOrder = <S extends { order_by: number; id: number }>(sections: S[]): S[] =>
  [...sections].sort((a, b) => a.order_by - b.order_by || a.id - b.id);

/**
 * Les grains d'un sujet, regroupés par section. Le groupe hors section vient TOUJOURS en premier,
 * même vide : c'est là qu'un grain atterrit quand on le fait remonter au-dessus de la première
 * section. Un grain qui pointerait vers une section inconnue est traité comme hors section.
 */
export function groupBySection(grains: Grain[], sections: Section[]): EditorGroup[] {
  const known = new Set(sections.map((section) => section.id));
  const ordered = byOrder(grains);
  return [
    {
      section: null,
      grains: ordered.filter((grain) => !grain.section_id || !known.has(grain.section_id)),
    },
    ...bySectionOrder(sections).map((section) => ({
      section,
      grains: ordered.filter((grain) => grain.section_id === section.id),
    })),
  ];
}

/**
 * Remet à plat des groupes : section et rang global (1 à n) de chaque grain, rang de chaque
 * section. Renvoie aussi ce qui a changé — l'affichage optimiste n'a besoin que du résultat, mais
 * les tests s'appuient sur la liste.
 */
export function flattenGroups(groups: EditorGroup[]): {
  grains: Grain[];
  sections: Section[];
  changed: Grain[];
} {
  const grains: Grain[] = [];
  const changed: Grain[] = [];
  const sections: Section[] = [];
  let rank = 0;
  for (const group of groups) {
    if (group.section) {
      sections.push({ ...group.section, order_by: sections.length + 1 });
    }
    for (const grain of group.grains) {
      rank += 1;
      const section_id = group.section?.id ?? null;
      if (grain.order_by === rank && (grain.section_id ?? null) === section_id) {
        grains.push(grain);
      } else {
        const next = { ...grain, order_by: rank, section_id };
        grains.push(next);
        changed.push(next);
      }
    }
  }
  return { grains, sections, changed };
}

/** Le corps de `PUT /subject/:id/structure`. */
export function structurePayload(groups: EditorGroup[]): SubjectStructure {
  return {
    ungrouped: groups.filter((group) => !group.section).flatMap((group) => group.grains.map((g) => g.id)),
    sections: groups
      .filter((group): group is EditorGroup & { section: Section } => !!group.section)
      .map((group) => ({ id: group.section.id, grainIds: group.grains.map((g) => g.id) })),
  };
}

/** Déplace une section d'un cran (`delta` = -1 ou +1), avec tous ses grains. */
export function moveSection(groups: EditorGroup[], sectionId: number, delta: -1 | 1): EditorGroup[] {
  const from = groups.slice(1).findIndex((group) => group.section?.id === sectionId);
  return from < 0 ? groups : moveSectionTo(groups, sectionId, from + delta);
}

/**
 * Place une section au rang `to` (0 = première section), avec tous ses grains — le
 * glisser-déposer du sommaire. Le groupe hors section reste en tête : il n'est pas déplaçable.
 * Rang hors bornes ou inchangé : les groupes sont rendus tels quels.
 */
export function moveSectionTo(groups: EditorGroup[], sectionId: number, to: number): EditorGroup[] {
  const [head, ...rest] = groups;
  const from = rest.findIndex((group) => group.section?.id === sectionId);
  if (from < 0 || to < 0 || to >= rest.length || to === from) return groups;
  const next = [...rest];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return [head, ...next];
}

/**
 * Déplace un grain d'un cran. Au bord de sa section, il passe dans la section VOISINE (à la fin
 * de la précédente, ou au début de la suivante) plutôt que de rester bloqué : c'est ainsi qu'on
 * change un grain de section au clavier, sans glisser-déposer.
 */
export function moveGrainAcross(groups: EditorGroup[], grainId: number, delta: -1 | 1): EditorGroup[] {
  const groupIndex = groups.findIndex((group) => group.grains.some((grain) => grain.id === grainId));
  if (groupIndex < 0) return groups;
  const grains = [...groups[groupIndex].grains];
  const index = grains.findIndex((grain) => grain.id === grainId);
  const next = groups.map((group) => ({ ...group, grains: [...group.grains] }));

  const target = index + delta;
  if (target >= 0 && target < grains.length) {
    const [moved] = grains.splice(index, 1);
    grains.splice(target, 0, moved);
    next[groupIndex].grains = grains;
    return next;
  }

  const neighbour = groupIndex + delta;
  if (neighbour < 0 || neighbour >= groups.length) return groups;
  const [moved] = next[groupIndex].grains.splice(index, 1);
  if (delta < 0) {
    next[neighbour].grains.push(moved);
  } else {
    next[neighbour].grains.unshift(moved);
  }
  return next;
}

/** Range un grain à la FIN d'une section (`null` = hors section). */
export function moveGrainToSection(
  groups: EditorGroup[],
  grainId: number,
  sectionId: number | null,
): EditorGroup[] {
  const grain = groups.flatMap((group) => group.grains).find((item) => item.id === grainId);
  const target = groups.findIndex((group) => (group.section?.id ?? null) === sectionId);
  if (!grain || target < 0) return groups;
  return groups.map((group, index) => {
    const grains = group.grains.filter((item) => item.id !== grainId);
    return { ...group, grains: index === target ? [...grains, grain] : grains };
  });
}

/** Le barème d'une section : la somme de ses questions, comme pour le sujet entier. */
export const sectionMaxScore = (grains: Grain[]): number => computedMaxScore(grains);

/**
 * Le rang à envoyer pour un grain créé en fin de section. Le serveur renumérote ensuite tout le
 * sujet en triant par section PUIS par rang, puis par id : le dernier rang de la section suffit, le
 * grain neuf (id le plus grand) passe derrière. Section vide : 0.
 */
export function rankAtEndOf(groups: EditorGroup[], sectionId: number | null): number {
  const group = groups.find((item) => (item.section?.id ?? null) === sectionId);
  const grains = group?.grains ?? [];
  return grains.length > 0 ? grains[grains.length - 1].order_by : 0;
}

/** Le sujet a-t-il des sections ? Sans section, l'éditeur et la passation restent ceux d'avant. */
export const hasSections = (sections: unknown[] | undefined): boolean => (sections?.length ?? 0) > 0;

// ── Côté copie (passation, consultation, correction) ─────────────────────────

/**
 * Les copies de grains regroupées par section DISTRIBUÉE. L'ordre des copies est conservé à
 * l'intérieur de chaque groupe — il suit `display_order` quand le sujet mélange ses questions, et
 * le serveur ne mélange qu'à l'intérieur d'une section. Le groupe hors section, s'il n'est pas
 * vide, vient en tête ; les sections sans aucune copie sont omises.
 */
export function groupCopiesBySection<G extends { grain_scheduled_id: number }>(
  grainCopies: G[],
  sections: ScheduledSection[],
): Array<SectionGroup<ScheduledSection, G>> {
  const sectionOf = new Map<number, number>();
  for (const section of sections) {
    for (const id of section.grain_scheduled_ids) sectionOf.set(id, section.id);
  }
  const ungrouped = grainCopies.filter((copy) => !sectionOf.has(copy.grain_scheduled_id));
  const groups: Array<SectionGroup<ScheduledSection, G>> = ungrouped.length
    ? [{ section: null, grains: ungrouped }]
    : [];
  for (const section of bySectionOrder(sections)) {
    const grains = grainCopies.filter((copy) => sectionOf.get(copy.grain_scheduled_id) === section.id);
    if (grains.length) groups.push({ section, grains });
  }
  return groups;
}

/** Avancement d'un groupe pour l'élève : questions répondues sur questions posées. */
export function sectionProgress<G extends { grain_type_id: number }>(
  grains: G[],
  isAnswered: (grain: G) => boolean,
): { answered: number; total: number } {
  const questions = grains.filter((grain) => isQuestion(grain.grain_type_id));
  return { answered: questions.filter(isAnswered).length, total: questions.length };
}

/**
 * Sous-total d'un groupe à la correction : points obtenus (note finale, sinon note calculée) sur
 * barème. Les énoncés ne comptent pas.
 */
export function sectionScore<
  G extends {
    grain_type_id: number;
    final_score?: number | null;
    calculated_score?: number | null;
    grain_copy_data: { max_score?: number | string };
  },
>(grains: G[]): { score: number; max: number } {
  const questions = grains.filter((grain) => isQuestion(grain.grain_type_id));
  const round = (value: number) => Number.parseFloat(value.toFixed(2));
  return {
    score: round(questions.reduce((sum, grain) => sum + (grain.final_score ?? grain.calculated_score ?? 0), 0)),
    max: round(questions.reduce((sum, grain) => sum + (Number(grain.grain_copy_data.max_score) || 0), 0)),
  };
}
