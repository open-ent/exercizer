import { Badge, Button, EmptyScreen, Heading, SearchBar, Tabs } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import { createTrainingCopy, getCopiesAsStudent, getSubjectsScheduledAsStudent } from '../api';
import {
  copyState,
  DominoAction,
  isDueThisWeekOrEarlier,
  isFinished,
  isTodo,
  matchesDueDateRange,
  matchesTitle,
  withDueDate,
} from '../copies';
import { CopyCard } from '../features/CopyCard';
import { DateRangeFilter, DateRange } from '../features/DateRangeFilter';
import { SubjectCopy, SubjectScheduled } from '../types';

/** Les trois onglets, dans l'ordre de l'IHM AngularJS. */
const TABS = ['todo', 'finished', 'training'] as const;
type TabId = (typeof TABS)[number];

/** Les états cochables de l'onglet « Terminés ». */
const FINISHED_FILTERS = [
  { state: 'is_submitted', label: 'exercizer.copy.state.submitted' },
  { state: 'is_correction_on_going', label: 'exercizer.copy.state.ongoing' },
  { state: 'is_corrected', label: 'exercizer.copy.state.corrected' },
] as const;

/** Les états cochables de l'onglet « Sujets d'entraînement ». */
const TRAINING_FILTERS = [
  { state: 'is_done', label: 'exercizer.dashboard.learner.tab3.sub.filter1' },
  { state: 'is_on_going', label: 'exercizer.dashboard.learner.tab3.sub.filter2' },
  { state: 'is_sided', label: 'exercizer.dashboard.learner.tab3.sub.filter3' },
] as const;

/** Trois mois de part et d'autre : les bornes par défaut de l'onglet « Terminés ». */
function defaultFinishedRange(): DateRange {
  const begin = new Date();
  begin.setMonth(begin.getMonth() - 3);
  const end = new Date();
  end.setMonth(end.getMonth() + 3);
  return { begin, end };
}

/**
 * Tableau de bord de l'élève : ses sujets à faire, ceux qu'il a rendus, et ses entraînements.
 *
 * Portage de `student-dashboard.html` et de ses trois directives de liste. Le classement et la
 * recherche sont ceux de `copies.ts`, qui reprend filtre par filtre les chaînes de l'IHM
 * AngularJS — c'est là, et pas ici, qu'on vérifie la règle.
 */
export function StudentDashboard() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // `?tab=training|finished` : l'IHM AngularJS acceptait ce paramètre pour les liens entrants
  // (notifications, fil de nouveautés), puis l'effaçait de l'URL. On le lit de la même façon.
  const [searchParams] = useSearchParams();
  const initialTab: TabId =
    searchParams.get('tab') === 'training'
      ? 'training'
      : searchParams.get('tab') === 'finished'
        ? 'finished'
        : 'todo';

  const copiesQuery = useQuery({ queryKey: ['exercizer', 'copies'], queryFn: getCopiesAsStudent });
  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'student'],
    queryFn: getSubjectsScheduledAsStudent,
  });

  const scheduledById = useMemo(
    () => new Map((scheduledQuery.data ?? []).map((s) => [s.id, s])),
    [scheduledQuery.data],
  );

  const copies = useMemo(
    () => withDueDate(copiesQuery.data ?? [], scheduledById),
    [copiesQuery.data, scheduledById],
  );

  const training = useMutation({
    mutationFn: (scheduled: SubjectScheduled) => createTrainingCopy(scheduled.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercizer', 'copies'] }),
  });

  /**
   * Ouverture d'une copie. Les chemins sont ceux de l'IHM AngularJS, à l'identique : les deux
   * interfaces partagent le même routage par fragment (`/exercizer#/…`), et un lien copié dans
   * l'une reste valide dans l'autre.
   */
  const open = (action: DominoAction, copy: SubjectCopy, scheduled: SubjectScheduled) => {
    switch (action) {
      case 'perform':
        navigate(
          scheduled.type === 'simple'
            ? `/subject/copy/perform/simple/${copy.id}`
            : `/subject/copy/perform/${copy.id}`,
        );
        break;
      case 'view':
        navigate(`/subject/copy/view/${copy.id}`);
        break;
      case 'training':
        navigate(`/subject/copy/view/final-score/${copy.id}`);
        break;
      default:
        break;
    }
  };

  const counts = {
    todo: copies.filter(isTodo).length,
    finished: copies.filter(isFinished).length,
    training: copies.filter((c) => c.is_training_copy).length,
  };

  const loading = copiesQuery.isLoading || scheduledQuery.isLoading;

  // Le contenu de chaque onglet est porté par l'élément lui-même (`content`) : le composant
  // `Tabs` du socle rend la barre ET le panneau de l'onglet actif, sans état à tenir ici.
  const panels: Record<TabId, JSX.Element> = {
    todo: (
      <TodoTab
        copies={copies}
        scheduledById={scheduledById}
        onOpen={open}
        onTraining={training.mutate}
      />
    ),
    finished: (
      <FinishedTab
        copies={copies}
        scheduledById={scheduledById}
        onOpen={open}
        onTraining={training.mutate}
      />
    ),
    training: <TrainingTab copies={copies} scheduledById={scheduledById} onOpen={open} />,
  };

  const items = TABS.map((id, index) => ({
    id,
    icon: null,
    label: t(`exercizer.dashboard.learner.tab${index + 1}`),
    badge: counts[id] ? (
      <Badge variant={{ type: 'notification', level: 'info' }}>{counts[id]}</Badge>
    ) : undefined,
    // Tant que les listes chargent, la barre d'onglets est déjà en place : afficher un panneau
    // vide plutôt que rien évite que l'écran saute quand les données arrivent.
    content: loading ? null : panels[id],
  }));

  return <Tabs items={items} defaultId={initialTab} />;
}

interface TabProps {
  copies: SubjectCopy[];
  scheduledById: Map<number, SubjectScheduled>;
  onOpen: (action: DominoAction, copy: SubjectCopy, scheduled: SubjectScheduled) => void;
  onTraining?: (scheduled: SubjectScheduled) => void;
}

/**
 * « Mes sujets » : deux colonnes, l'une pour ce qui est dû cette semaine, l'autre pour la suite.
 * Chacune a sa propre recherche, comme dans le gabarit d'origine ; seule la seconde est bornée
 * par dates.
 */
function TodoTab({ copies, scheduledById, onOpen, onTraining }: TabProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [thisWeekText, setThisWeekText] = useState('');
  const [laterText, setLaterText] = useState('');
  const [range, setRange] = useState<DateRange>({ begin: null, end: null });

  const todo = copies.filter(isTodo);
  const thisWeek = todo.filter(
    (copy) =>
      isDueThisWeekOrEarlier(scheduledById.get(copy.subject_scheduled_id)) &&
      matchesTitle(scheduledById.get(copy.subject_scheduled_id), thisWeekText),
  );
  const later = todo.filter(
    (copy) =>
      matchesTitle(scheduledById.get(copy.subject_scheduled_id), laterText) &&
      matchesDueDateRange(scheduledById.get(copy.subject_scheduled_id), range.begin, range.end),
  );

  return (
    <div className="grid gap-24 mt-24">
      <section className="g-col-12 g-col-md-6">
        <Heading level="h2" headingStyle="h4" className="mb-16">
          {t('exercizer.dashboard.learner.tab1.sub.header1')}
        </Heading>
        <SearchBar
          isVariant
          size="md"
          clearable
          placeholder={t('exercizer.search')}
          value={thisWeekText}
          onChange={(event) => setThisWeekText(event.target.value)}
        />
        <CopyList
          className="mt-16"
          copies={thisWeek}
          scheduledById={scheduledById}
          onOpen={onOpen}
          onTraining={onTraining}
          emptyText={t('exercizer.dashboard.learner.subject.empty')}
        />
      </section>

      <section className="g-col-12 g-col-md-6">
        <Heading level="h2" headingStyle="h4" className="mb-16">
          {t('exercizer.dashboard.learner.tab1.sub.header2')}
        </Heading>
        <div className="d-flex flex-wrap align-items-end gap-16">
          <SearchBar
            isVariant
            size="md"
            clearable
            placeholder={t('exercizer.search')}
            value={laterText}
            onChange={(event) => setLaterText(event.target.value)}
          />
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
        <CopyList
          className="mt-16"
          copies={later}
          scheduledById={scheduledById}
          onOpen={onOpen}
          onTraining={onTraining}
          emptyText={t('exercizer.dashboard.learner.subject.later.empty')}
        />
      </section>
    </div>
  );
}

/** « Terminés » : les copies rendues, filtrables par état et par date de rendu. */
function FinishedTab({ copies, scheduledById, onOpen, onTraining }: TabProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [text, setText] = useState('');
  const [range, setRange] = useState<DateRange>(defaultFinishedRange);
  const [states, setStates] = useState<string[]>([]);

  const finished = copies.filter(
    (copy) =>
      isFinished(copy) &&
      matchesTitle(scheduledById.get(copy.subject_scheduled_id), text) &&
      matchesDueDateRange(scheduledById.get(copy.subject_scheduled_id), range.begin, range.end) &&
      // Aucun état coché = aucun filtre, comme dans `filterOnSubjectCopyState`.
      (states.length === 0 || states.includes(copyState(copy) ?? '')),
  );

  return (
    <section className="mt-24">
      <div className="d-flex flex-wrap align-items-end gap-16 mb-16">
        <SearchBar
          isVariant
          size="md"
          clearable
          placeholder={t('exercizer.search')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <DateRangeFilter value={range} onChange={setRange} />
      </div>
      <StateChips options={FINISHED_FILTERS} selected={states} onToggle={setStates} />
      <CopyList
        className="mt-16"
        copies={finished}
        scheduledById={scheduledById}
        onOpen={onOpen}
        onTraining={onTraining}
        emptyText={t('exercizer.dashboard.learner.finish.empty')}
      />
    </section>
  );
}

/**
 * « Sujets d'entraînement » : les copies que l'élève s'est lui-même créées.
 *
 * Le filtre d'état ne passe pas par `copyState` : l'IHM AngularJS traite ici « réalisé » comme
 * « rendu et non reprise » (`filterOnSubjectCopyTrainingState`), ce qui revient au même résultat
 * mais par un autre chemin. On garde ses prédicats, à la lettre.
 */
function TrainingTab({ copies, scheduledById, onOpen }: TabProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [text, setText] = useState('');
  const [states, setStates] = useState<string[]>([]);

  const matchesState = (copy: SubjectCopy): boolean => {
    if (states.length === 0) return true;
    if (states.includes('is_done') && copy.submitted_date && !copy.has_been_started) return true;
    if (states.includes('is_on_going') && copy.has_been_started) return true;
    if (states.includes('is_sided') && !copy.submitted_date && !copy.has_been_started) return true;
    return false;
  };

  const training = copies.filter(
    (copy) =>
      copy.is_training_copy &&
      matchesTitle(scheduledById.get(copy.subject_scheduled_id), text) &&
      matchesState(copy),
  );

  // Trois écrans vides distincts, selon l'état qu'on cherchait : dire « pas de sujet » quand on
  // filtrait sur « mis de côté » n'apprend rien.
  const emptyText =
    states.length === 1 && states[0] === 'is_sided'
      ? t('exercizer.dashboard.learner.training.empty.sided')
      : states.length === 1 && states[0] === 'is_on_going'
        ? t('exercizer.dashboard.learner.training.empty.ongoing')
        : states.length === 1 && states[0] === 'is_done'
          ? t('exercizer.dashboard.learner.training.empty.done')
          : t('exercizer.dashboard.learner.finish.empty');

  return (
    <section className="mt-24">
      <div className="mb-16">
        <SearchBar
          isVariant
          size="md"
          clearable
          placeholder={t('exercizer.search')}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <StateChips options={TRAINING_FILTERS} selected={states} onToggle={setStates} />
      <CopyList
        className="mt-16"
        copies={training}
        scheduledById={scheduledById}
        onOpen={onOpen}
        emptyText={emptyText}
      />
    </section>
  );
}

/** Les pastilles d'état, cochables et cumulables. */
function StateChips({
  options,
  selected,
  onToggle,
}: {
  options: ReadonlyArray<{ state: string; label: string }>;
  selected: string[];
  onToggle: (states: string[]) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <div className="d-flex gap-8 flex-wrap" role="group">
      {options.map((option) => {
        const active = selected.includes(option.state);
        return (
          // `aria-pressed` plutôt qu'une case à cocher : ce sont des bascules de filtre, et le
          // lecteur d'écran doit annoncer l'état sans qu'on ait à poser un libellé caché.
          <Button
            key={option.state}
            type="button"
            size="sm"
            color="secondary"
            variant={active ? 'filled' : 'outline'}
            aria-pressed={active}
            onClick={() =>
              onToggle(
                active
                  ? selected.filter((state) => state !== option.state)
                  : [...selected, option.state],
              )
            }
          >
            {t(option.label)}
          </Button>
        );
      })}
    </div>
  );
}

/** Une liste de vignettes, ou l'écran vide qui la remplace. */
function CopyList({
  copies,
  scheduledById,
  onOpen,
  onTraining,
  emptyText,
  className,
}: TabProps & { emptyText: string; className?: string }) {
  if (copies.length === 0) {
    return (
      <div className={className}>
        <EmptyScreen imageSrc={illuExercizer} text={emptyText} size={160} />
      </div>
    );
  }
  return (
    <div className={className}>
      {copies.map((copy) => (
        <CopyCard
          key={copy.id}
          copy={copy}
          scheduled={scheduledById.get(copy.subject_scheduled_id)}
          onOpen={onOpen}
          onCreateTraining={onTraining}
        />
      ))}
    </div>
  );
}

export default StudentDashboard;
