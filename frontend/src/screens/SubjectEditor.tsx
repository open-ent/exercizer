import { Alert, Button, Checkbox, EmptyScreen, Heading, LoadingScreen } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  createGrain,
  createSection,
  duplicateGrains,
  duplicateSection,
  getGrains,
  getGrainTypes,
  getSections,
  getSubjects,
  removeGrains,
  removeSection,
  saveStructure,
  updateGrain,
  updateSection,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { GrainCard } from '../features/GrainCard';
import { GrainOrganizer } from '../features/GrainOrganizer';
import { SectionHeader } from '../features/SectionHeader';
import { ExternalResources, ReuseGrains } from '../features/SubjectEditorPanels';
import {
  EditorFocus,
  focusOf,
  sectionLabel,
  SectionOrganizer,
} from '../features/SectionOrganizer';
import {
  byOrder,
  cleanGrainData,
  defaultGrainData,
  GRAIN,
  moveGrain,
  nextOrder,
  sanitizeScore,
} from '../grains';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import {
  EditorGroup,
  flattenGroups,
  groupBySection,
  moveGrainAcross,
  moveGrainToSection,
  moveSection,
  moveSectionTo,
  rankAtEndOf,
  sectionMaxScore,
  structurePayload,
} from '../sections';
import { ScheduleDialog } from './ScheduleDialog';
import { Grain, Section } from '../types';

/**
 * Éditeur d'un sujet interactif — portage de `EditSubjectController` et `edit-subject.html`.
 *
 * Il n'y a pas de bouton « Enregistrer » : chaque grain part de lui-même peu après la frappe,
 * comme dans l'IHM AngularJS. Le bouton « Enregistrer et quitter » ne fait donc que CHASSER ce
 * qui reste en attente avant de revenir au tableau de bord.
 *
 * Sujet à SECTIONS (sql/039, sur le modèle Chapitre → Activités de LearnHouse) : le sommaire de
 * gauche devient un arbre sections → grains, et l'éditeur n'ouvre qu'une section à la fois (ou
 * tout, à la demande). La section ouverte est dans l'URL (`?section=`) : le lien est partageable
 * et le retour arrière fonctionne. Toute modification de STRUCTURE (déplacements, changement de
 * section) part aussitôt, d'un bloc, par `PUT /structure` ; le contenu, lui, reste différé.
 *
 * ⚠ Le barème du sujet n'est jamais envoyé : le serveur le recalcule comme la somme des barèmes
 * des grains à chaque enregistrement de grain. Le total affiché n'est qu'un aperçu.
 */
export function SubjectEditor() {
  const { subjectId: subjectIdParam } = useParams();
  const subjectId = Number(subjectIdParam);
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Enregistrement de l'ordre refusé : message visible (avant, l'ordre saisi disparaissait sans un mot).
  const [orderError, setOrderError] = useState(false);
  const [toRemove, setToRemove] = useState<Grain | null>(null);
  const [sectionToRemove, setSectionToRemove] = useState<Section | null>(null);
  const [removeWithGrains, setRemoveWithGrains] = useState(false);
  const [scheduling, setScheduling] = useState(false);

  const grainsKey = useMemo(() => ['exercizer', 'grains', subjectId], [subjectId]);
  const sectionsKey = useMemo(() => ['exercizer', 'sections', subjectId], [subjectId]);

  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });
  const subject = (subjectsQuery.data ?? []).find((item) => item.id === subjectId);

  const typesQuery = useQuery({
    queryKey: ['exercizer', 'grain-types'],
    queryFn: getGrainTypes,
    // Les types de grains sont une table de référence : inutile de les redemander.
    staleTime: Infinity,
  });

  const grainsQuery = useQuery({
    queryKey: grainsKey,
    queryFn: () => getGrains(subject!),
    enabled: !!subject,
  });

  // Les sujets de la bibliothèque n'ont pas de route de sections : ils restent à plat.
  const sectionsQuery = useQuery({
    queryKey: sectionsKey,
    queryFn: () => getSections(subjectId),
    enabled: !!subject && !subject.is_library_subject,
  });

  /**
   * Les grains tels qu'on les affiche. La frappe doit être rendue IMMÉDIATEMENT, alors que
   * l'enregistrement est différé : le cache de react-query sert donc d'état local, et c'est lui
   * qu'on modifie à chaque touche.
   */
  const grains = useMemo(() => byOrder(grainsQuery.data ?? []), [grainsQuery.data]);
  const sections = useMemo(() => sectionsQuery.data ?? [], [sectionsQuery.data]);
  const withSections = sections.length > 0;
  const groups = useMemo(() => groupBySection(grains, sections), [grains, sections]);

  const setGrains = useCallback(
    (next: Grain[]) => queryClient.setQueryData(grainsKey, next),
    [queryClient, grainsKey],
  );
  const setSections = useCallback(
    (next: Section[]) => queryClient.setQueryData(sectionsKey, next),
    [queryClient, sectionsKey],
  );

  /**
   * Enregistrement d'un grain : barème assaini et données nettoyées juste avant l'envoi.
   *
   * Le RANG est relu dans le cache au moment de l'envoi : un grain modifié puis déplacé avant la
   * fin du délai partirait sinon avec son ancien rang, et défairait le déplacement.
   */
  const saveGrain = useCallback(
    (grain: Grain) => {
      const latest = (queryClient.getQueryData<Grain[]>(grainsKey) ?? []).find(
        (item) => item.id === grain.id,
      );
      return updateGrain({
        ...grain,
        order_by: latest?.order_by ?? grain.order_by,
        grain_data: cleanGrainData(grain.grain_type_id, {
          ...grain.grain_data,
          max_score: sanitizeScore(grain.grain_data.max_score),
        }),
      });
    },
    [queryClient, grainsKey],
  );

  const grainSave = useDebouncedSave(saveGrain);
  const sectionSave = useDebouncedSave(useCallback((section: Section) => updateSection(section), []));
  const pending = grainSave.pending || sectionSave.pending;
  const flush = useCallback(
    () => Promise.all([grainSave.flush(), sectionSave.flush()]).then(() => undefined),
    [grainSave, sectionSave],
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: grainsKey }),
      queryClient.invalidateQueries({ queryKey: sectionsKey }),
    ]);

  // ── La partie ouverte ──────────────────────────────────────────────────────

  const focusParam = searchParams.get('section');
  const focus: EditorFocus = useMemo(() => {
    if (focusParam === 'all') return 'all';
    if (focusParam === 'ungrouped' && groups[0].grains.length > 0) return 'ungrouped';
    const asId = Number(focusParam);
    if (focusParam && sections.some((section) => section.id === asId)) return asId;
    // Par défaut : les grains hors section s'il y en a, sinon la première section.
    if (groups[0].grains.length > 0 || !withSections) return 'ungrouped';
    return groups[1].section!.id;
  }, [focusParam, groups, sections, withSections]);

  const setFocus = (next: EditorFocus) =>
    setSearchParams((params) => {
      params.set('section', String(next));
      return params;
    });

  const visibleGroups =
    focus === 'all' ? groups : groups.filter((group) => focusOf(group.section) === focus);

  /** La section où un grain neuf atterrit : celle ouverte, ou la dernière en vue d'ensemble. */
  const targetSectionId: number | null =
    focus === 'all'
      ? (groups[groups.length - 1].section?.id ?? null)
      : focus === 'ungrouped'
        ? null
        : focus;

  const scrollToGrain = (grain: Grain) =>
    // Après le rendu de la section qu'on vient d'ouvrir.
    window.setTimeout(
      () =>
        document
          .getElementById(`grain-edit-${grain.id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50,
    );

  // ── Structure ──────────────────────────────────────────────────────────────

  /** Applique un nouvel arbre : affiché tout de suite, enregistré d'un bloc. */
  const applyGroups = async (next: EditorGroup[]) => {
    const { grains: flat, sections: ordered } = flattenGroups(next);
    setGrains(flat);
    setSections(ordered);
    try {
      await saveStructure(subjectId, structurePayload(next));
      setOrderError(false);
    } catch {
      // Le serveur fait foi : on relit plutôt que de laisser un ordre qu'il n'a pas.
      setOrderError(true);
      await refresh();
    }
  };

  /** Déplacement d'un grain, sujet SANS section : seuls les rangs qui changent sont réenregistrés. */
  const move = async (fromIndex: number, toIndex: number) => {
    const { grains: reordered, changed } = moveGrain(grains, fromIndex, toIndex);
    if (changed.length === 0) return;
    setGrains(reordered);
    await Promise.all(changed.map((grain) => saveGrain(grain)));
  };

  // ── Grains ─────────────────────────────────────────────────────────────────

  const addGrain = useMutation({
    mutationFn: async (grainTypeId: number) => {
      const section_id = withSections ? targetSectionId : null;
      const grain = {
        subject_id: subjectId,
        grain_type_id: grainTypeId,
        order_by: withSections ? rankAtEndOf(groups, section_id) : nextOrder(grains),
        section_id,
        grain_data: defaultGrainData(grainTypeId),
      };
      const created = await createGrain(grain);
      return { ...grain, id: created.id } as Grain;
    },
    onSuccess: async (grain) => {
      if (withSections) {
        // Le serveur a renuméroté le sujet pour loger le grain en fin de section : on relit.
        await queryClient.invalidateQueries({ queryKey: grainsKey });
      } else {
        setGrains([...grains, grain]);
      }
      scrollToGrain(grain);
    },
  });

  const duplicate = useMutation({
    mutationFn: (grain: Grain) => duplicateGrains(subjectId, [grain.id]),
    // Le serveur recopie le grain ET suffixe son titre : on relit la liste plutôt que de
    // reconstruire de notre côté une copie qui ne serait pas la sienne.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: grainsKey }),
  });

  const remove = useMutation({
    mutationFn: (grain: Grain) => removeGrains(subjectId, [grain.id]),
    onSuccess: (_result, grain) => {
      setGrains(grains.filter((item) => item.id !== grain.id));
      setToRemove(null);
    },
  });

  /** Modification au fil de la frappe : affichée tout de suite, enregistrée peu après. */
  const onChange = (grain: Grain) => {
    setGrains(grains.map((item) => (item.id === grain.id ? grain : item)));
    grainSave.schedule(grain.id, grain);
  };

  /**
   * Choix du type d'un grain neuf. Enregistré TOUT DE SUITE, sans attendre : c'est le type qui
   * décide du formulaire affiché, et un rechargement de page entre-temps devrait le retrouver.
   */
  const pickType = async (grain: Grain, grainTypeId: number) => {
    const next: Grain = {
      ...grain,
      grain_type_id: grainTypeId,
      grain_data: { ...defaultGrainData(grainTypeId), title: '' },
    };
    setGrains(grains.map((item) => (item.id === grain.id ? next : item)));
    await saveGrain(next);
  };

  // ── Sections ───────────────────────────────────────────────────────────────

  /**
   * Nouvelle section, toujours en fin de sujet. La PREMIÈRE d'un sujet qui a déjà des grains les
   * accueille tous : passer aux sections ne doit rien laisser « hors section » par surprise.
   */
  const addSection = useMutation({
    mutationFn: async () => {
      const created = await createSection(subjectId, {
        title: `${t('exercizer.section')} ${sections.length + 1}`,
        description: null,
      });
      if (!withSections && grains.length > 0) {
        await saveStructure(subjectId, {
          ungrouped: [],
          sections: [{ id: created.id, grainIds: grains.map((grain) => grain.id) }],
        });
      }
      return created;
    },
    onSuccess: async (created) => {
      await refresh();
      setFocus(created.id);
    },
  });

  const onSectionChange = (section: Section) => {
    setSections(sections.map((item) => (item.id === section.id ? section : item)));
    sectionSave.schedule(section.id, section);
  };

  const duplicateSectionMutation = useMutation({
    mutationFn: async (section: Section) => {
      // Ce qui est en attente part d'abord : la copie doit reprendre le dernier état.
      await flush();
      return duplicateSection(subjectId, section.id);
    },
    onSuccess: async (created) => {
      await refresh();
      if (created?.id) setFocus(created.id);
    },
  });

  const removeSectionMutation = useMutation({
    mutationFn: async ({ section, withGrains }: { section: Section; withGrains: boolean }) => {
      await flush();
      return removeSection(subjectId, section.id, withGrains);
    },
    onSuccess: async () => {
      setSectionToRemove(null);
      setRemoveWithGrains(false);
      await refresh();
      setSearchParams((params) => {
        params.delete('section');
        return params;
      });
    },
  });

  const leave = async () => {
    await flush();
    navigate('/dashboard/teacher');
  };

  if (subjectsQuery.isLoading || typesQuery.isLoading) {
    return <LoadingScreen position={false} />;
  }
  if (!subject) {
    return (
      <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.empty.subjects')} size={200} />
    );
  }

  const grainTypes = typesQuery.data ?? [];
  const sectionTargets = withSections
    ? [
        { id: null, label: t('exercizer.section.ungrouped') },
        ...groups
          .filter((group) => group.section)
          .map((group, index) => ({ id: group.section!.id, label: sectionLabel(group.section!, index, t) })),
      ]
    : undefined;

  const renderGrains = (groupGrains: Grain[]) =>
    groupGrains.map((grain) => (
      <GrainCard
        key={grain.id}
        grain={grain}
        grains={grains}
        grainTypes={grainTypes}
        onChange={onChange}
        onPickType={pickType}
        onDuplicate={duplicate.mutate}
        onRemove={setToRemove}
        sectionTargets={sectionTargets}
        onMoveToSection={(target, sectionId) => {
          void applyGroups(moveGrainToSection(groups, target.id, sectionId));
          if (focus !== 'all') setFocus(sectionId ?? 'ungrouped');
          scrollToGrain(target);
        }}
      />
    ));

  return (
    <div className="mt-16">
      {orderError && (
        <Alert type="danger" isDismissible onClose={() => setOrderError(false)} className="mb-16">
          {t('exercizer.error')}
        </Alert>
      )}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {subject.title}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          {/* Le témoin d'enregistrement remplace le bouton absent : sans lui, rien ne dirait que
              la frappe est partie — ni qu'elle ne l'est pas encore. */}
          <span className="align-self-center text-muted" role="status">
            {pending ? t('exercizer.subject.navigation.saving') : t('exercizer.subject.saved')}
          </span>
          <Button
            color="tertiary"
            variant="ghost"
            onClick={() => navigate(`/subject/copy/preview/perform/${subject.id}/`)}
          >
            {t('exercizer.preview')}
          </Button>
          <Button color="primary" variant="outline" onClick={leave}>
            {t('exercizer.back.subject')}
          </Button>
          <Button
            color="primary"
            variant="filled"
            onClick={async () => {
              // Ce qui est en attente part d'abord : on ne distribue pas une version du sujet
              // qui n'est pas encore enregistrée.
              await flush();
              setScheduling(true);
            }}
          >
            {t('exercizer.schedule')}
          </Button>
        </div>
      </div>

      <ExternalResources subjectId={subject.id} />

      <div className="grid gap-24">
        <aside className="g-col-12 g-col-lg-3">
          {withSections ? (
            <SectionOrganizer
              groups={groups}
              grains={grains}
              grainTypes={grainTypes}
              focus={focus}
              onFocus={setFocus}
              onSelectGrain={(grain) => {
                if (focus !== 'all') setFocus(grain.section_id ?? 'ungrouped');
                scrollToGrain(grain);
              }}
              onMoveSection={(sectionId, delta) => void applyGroups(moveSection(groups, sectionId, delta))}
              onMoveSectionTo={(sectionId, to) => void applyGroups(moveSectionTo(groups, sectionId, to))}
              onMoveGrain={(grainId, delta) => {
                const next = moveGrainAcross(groups, grainId, delta);
                void applyGroups(next);
                // Le grain a pu changer de section : on le suit.
                const owner = next.find((group) => group.grains.some((grain) => grain.id === grainId));
                if (focus !== 'all' && owner) setFocus(focusOf(owner.section));
              }}
              onAddSection={() => addSection.mutate()}
              isAdding={addSection.isPending}
            />
          ) : (
            <>
              <GrainOrganizer
                grains={grains}
                grainTypes={grainTypes}
                onMove={move}
                onSelect={scrollToGrain}
              />
              {!subject.is_library_subject && (
                <Button
                  color="primary"
                  variant="outline"
                  className="mt-16"
                  isLoading={addSection.isPending}
                  onClick={() => addSection.mutate()}
                >
                  {t('exercizer.section.new')}
                </Button>
              )}
            </>
          )}
          {/* Une question reprise d'un autre sujet arrive en fin de sujet — donc dans la dernière
              partie quand il y en a : c'est le serveur qui tient les rangs. */}
          <ReuseGrains
            subject={subject}
            grainTypes={grainTypes}
            nextOrder={() => nextOrder(grains)}
            // On relit la liste : deux ajouts rapprochés ne doivent pas se marcher dessus.
            onAdded={() => void refresh()}
          />
        </aside>

        <section className="g-col-12 g-col-lg-9">
          {grainsQuery.isLoading ? (
            <LoadingScreen position={false} />
          ) : grains.length === 0 && !withSections ? (
            <EmptyScreen
              imageSrc={illuExercizer}
              text={t('exercizer.subject.emptyscreen')}
              size={200}
            />
          ) : !withSections ? (
            renderGrains(grains)
          ) : (
            visibleGroups.map((group) => {
              if (!group.section) {
                if (group.grains.length === 0) return null;
                return (
                  <div key="ungrouped">
                    <Heading level="h3" headingStyle="h5" className="mb-16">
                      {t('exercizer.section.ungrouped')}
                    </Heading>
                    {renderGrains(group.grains)}
                  </div>
                );
              }
              const section = group.section;
              const position = groups.filter((item) => item.section).indexOf(group);
              return (
                <div key={section.id} className="mb-24">
                  <SectionHeader
                    section={section}
                    label={sectionLabel(section, position, t)}
                    maxScore={sectionMaxScore(group.grains)}
                    onChange={onSectionChange}
                    onDuplicate={(item) => duplicateSectionMutation.mutate(item)}
                    onRemove={setSectionToRemove}
                    isDuplicating={
                      duplicateSectionMutation.isPending &&
                      duplicateSectionMutation.variables?.id === section.id
                    }
                  />
                  {group.grains.length === 0 ? (
                    <p className="text-muted">{t('exercizer.section.empty')}</p>
                  ) : (
                    renderGrains(group.grains)
                  )}
                </div>
              );
            })
          )}

          <div className="d-flex flex-wrap gap-16 mt-16">
            <Button
              color="primary"
              variant="filled"
              isLoading={addGrain.isPending && addGrain.variables === GRAIN.STATEMENT}
              onClick={() => addGrain.mutate(GRAIN.STATEMENT)}
            >
              {t('exercizer.statement.new')}
            </Button>
            <Button
              color="primary"
              variant="filled"
              isLoading={addGrain.isPending && addGrain.variables === GRAIN.CHOOSE_ANSWER}
              onClick={() => addGrain.mutate(GRAIN.CHOOSE_ANSWER)}
            >
              {t('exercizer.question.new')}
            </Button>
          </div>
        </section>
      </div>

      {scheduling && (
        <ScheduleDialog
          subject={subject}
          onClose={() => setScheduling(false)}
          onScheduled={(scheduledId) => {
            setScheduling(false);
            navigate(`/dashboard/teacher/correction/${scheduledId}`);
          }}
        />
      )}

      {toRemove && (
        <ConfirmModal
          title={t('exercizer.grain.remove.title')}
          confirmLabel={t('exercizer.grain.remove.title')}
          onClose={() => setToRemove(null)}
          onConfirm={() => remove.mutate(toRemove)}
        >
          <p>{t('exercizer.grain.remove.confirm')}</p>
        </ConfirmModal>
      )}

      {sectionToRemove && (
        <ConfirmModal
          title={t('exercizer.section.remove')}
          confirmLabel={t('exercizer.section.remove')}
          isLoading={removeSectionMutation.isPending}
          onClose={() => {
            setSectionToRemove(null);
            setRemoveWithGrains(false);
          }}
          onConfirm={() =>
            removeSectionMutation.mutate({ section: sectionToRemove, withGrains: removeWithGrains })
          }
        >
          <p>{t('exercizer.section.remove.confirm')}</p>
          <Checkbox
            label={t('exercizer.section.remove.with.grains')}
            checked={removeWithGrains}
            onChange={(event) => setRemoveWithGrains(event.target.checked)}
          />
          {!removeWithGrains && (
            <small className="d-block text-muted mt-8">
              {t('exercizer.section.remove.keep.grains')}
            </small>
          )}
        </ConfirmModal>
      )}
    </div>
  );
}

export default SubjectEditor;
