import { Button, EmptyScreen, Heading, LoadingScreen } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  createGrain,
  duplicateGrains,
  getGrains,
  getGrainTypes,
  getSubjects,
  removeGrains,
  updateGrain,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { GrainCard } from '../features/GrainCard';
import { GrainOrganizer } from '../features/GrainOrganizer';
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
import { ScheduleDialog } from './ScheduleDialog';
import { Grain } from '../types';

/**
 * Éditeur d'un sujet interactif — portage de `EditSubjectController` et `edit-subject.html`.
 *
 * Il n'y a pas de bouton « Enregistrer » : chaque grain part de lui-même peu après la frappe,
 * comme dans l'IHM AngularJS. Le bouton « Enregistrer et quitter » ne fait donc que CHASSER ce
 * qui reste en attente avant de revenir au tableau de bord.
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

  const [toRemove, setToRemove] = useState<Grain | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });
  const subject = (subjectsQuery.data ?? []).find((item) => item.id === subjectId);

  const typesQuery = useQuery({
    queryKey: ['exercizer', 'grain-types'],
    queryFn: getGrainTypes,
    // Les types de grains sont une table de référence : inutile de les redemander.
    staleTime: Infinity,
  });

  const grainsQuery = useQuery({
    queryKey: ['exercizer', 'grains', subjectId],
    queryFn: () => getGrains(subject!),
    enabled: !!subject,
  });

  /**
   * Les grains tels qu'on les affiche. La frappe doit être rendue IMMÉDIATEMENT, alors que
   * l'enregistrement est différé : le cache de react-query sert donc d'état local, et c'est lui
   * qu'on modifie à chaque touche.
   */
  const grains = useMemo(() => byOrder(grainsQuery.data ?? []), [grainsQuery.data]);

  const setGrains = useCallback(
    (next: Grain[]) => queryClient.setQueryData(['exercizer', 'grains', subjectId], next),
    [queryClient, subjectId],
  );

  /** Enregistrement d'un grain : barème assaini et données nettoyées juste avant l'envoi. */
  const saveGrain = useCallback(
    (grain: Grain) =>
      updateGrain({
        ...grain,
        grain_data: cleanGrainData(grain.grain_type_id, {
          ...grain.grain_data,
          max_score: sanitizeScore(grain.grain_data.max_score),
        }),
      }),
    [],
  );

  const { schedule, flush, pending } = useDebouncedSave(saveGrain);

  const refreshGrains = () =>
    queryClient.invalidateQueries({ queryKey: ['exercizer', 'grains', subjectId] });

  const addGrain = useMutation({
    mutationFn: async (grainTypeId: number) => {
      const grain = {
        subject_id: subjectId,
        grain_type_id: grainTypeId,
        order_by: nextOrder(grains),
        grain_data: defaultGrainData(grainTypeId),
      };
      const created = await createGrain(grain);
      return { ...grain, id: created.id } as Grain;
    },
    onSuccess: (grain) => setGrains([...grains, grain]),
  });

  const duplicate = useMutation({
    mutationFn: (grain: Grain) => duplicateGrains(subjectId, [grain.id]),
    // Le serveur recopie le grain ET suffixe son titre : on relit la liste plutôt que de
    // reconstruire de notre côté une copie qui ne serait pas la sienne.
    onSuccess: refreshGrains,
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
    schedule(grain.id, grain);
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

  /** Déplacement d'un grain : seuls les rangs qui changent sont réenregistrés. */
  const move = async (fromIndex: number, toIndex: number) => {
    const { grains: reordered, changed } = moveGrain(grains, fromIndex, toIndex);
    if (changed.length === 0) return;
    setGrains(reordered);
    await Promise.all(changed.map((grain) => saveGrain(grain)));
  };

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

  return (
    <div className="mt-16">
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

      <div className="grid gap-24">
        <aside className="g-col-12 g-col-lg-3">
          <GrainOrganizer
            grains={grains}
            grainTypes={grainTypes}
            onMove={move}
            onSelect={(grain) =>
              document
                .getElementById(`grain-edit-${grain.id}`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          />
        </aside>

        <section className="g-col-12 g-col-lg-9">
          {grainsQuery.isLoading ? (
            <LoadingScreen position={false} />
          ) : grains.length === 0 ? (
            <EmptyScreen
              imageSrc={illuExercizer}
              text={t('exercizer.subject.emptyscreen')}
              size={200}
            />
          ) : (
            grains.map((grain) => (
              <GrainCard
                key={grain.id}
                grain={grain}
                grains={grains}
                grainTypes={grainTypes}
                onChange={onChange}
                onPickType={pickType}
                onDuplicate={duplicate.mutate}
                onRemove={setToRemove}
              />
            ))
          )}

          <div className="d-flex flex-wrap gap-16 mt-16">
            <Button
              color="primary"
              variant="filled"
              onClick={() => addGrain.mutate(GRAIN.STATEMENT)}
            >
              {t('exercizer.statement.new')}
            </Button>
            <Button
              color="primary"
              variant="filled"
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
    </div>
  );
}

export default SubjectEditor;
