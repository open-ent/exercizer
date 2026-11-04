import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyScreen,
  Heading,
  LoadingScreen,
  Modal,
  Pagination,
  SearchBar,
  Table,
  useEdificeClient,
  useEdificeTheme,
  useHasWorkflow,
} from '@open-ent/react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  CatalogSearch,
  copyCatalogSubject,
  createSubject,
  getCatalogFacets,
  getCatalogObjectives,
  getCatalogSubject,
  getProgrammeTree,
  getUiPreference,
  reclassifyCatalogSubject,
  removeCatalogSubject,
  searchCatalog,
  setClassification,
  setUiPreference,
  UiPreference,
} from '../api';
import {
  buildDisciplineTree,
  buildLevelTree,
  buildProgrammeTree,
  canManageCatalogSubject,
  CatalogTreeItem,
  CoverageRow,
  coverageRatio,
  findTreeItem,
  groupLevels,
  isObjective,
  labelsOf,
  nodeCriteria,
  OutlineEntry,
  parseOrg,
  parseView,
  programmeOf,
  programmeCoverage,
  programmeOrg,
  programmesInContext,
  referentialInContext,
  resolveOrg,
  sortDisciplines,
  UNALIGNED_NODE,
  withOutlineLeaves,
} from '../catalog';
import { useCatalogReferential } from '../components/CatalogDialogs';
import { AlignmentPicker, useContextLevels, useProgrammes } from '../features/AlignmentPicker';
import { CatalogTree } from '../features/CatalogTree';
import { CreateSequenceDialog, ObjectiveHits } from '../features/CatalogProgrammeActions';
import { ModerationButton, UsageLine, UsagePanel } from '../features/CatalogQuality';
import { WORKFLOW } from '../rights';
import {
  Alignment,
  CatalogOrg,
  CatalogReferential,
  CatalogSort,
  CatalogSubject,
  CatalogView,
  Programme,
} from '../types';
import { sanitizeHtml } from '../zones';
import { PrintedGrain } from './PrintSubject';

const PAGE_SIZE = 24;

/** Le texte brut d'une description HTML, pour la vignette. */
function plainText(html: string | null | undefined): string {
  if (!html) return '';
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}

/** La saisie de recherche, envoyée au serveur une fois la frappe arrêtée. */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Les exercices chargés sous un nœud de la vue sommaire : au-delà, « … et N autres ». */
const OUTLINE_LIMIT = 50;

/**
 * Catalogue d'exercices partagé entre TOUS les établissements de l'ENT. Un enseignant le range à
 * son choix — selon un programme officiel (référentiel CASE), par niveau ou par matière — et le
 * parcourt en arbre : l'arbre à côté des résultats, ou en sommaire dont les exercices sont les
 * feuilles. Il prévisualise un sujet avec ses réponses attendues, puis le copie dans « Mes sujets »
 * pour l'adapter et le distribuer. Le sujet du catalogue n'est jamais distribué en place : chacun
 * travaille sur sa copie.
 *
 * Le rangement, le nœud choisi et la vue sont dans l'URL (un lien les partage) ; le rangement et
 * la vue sont aussi gardés dans la préférence de l'usager, reprise quand l'URL n'en dit rien.
 */
export function Catalog() {
  const { t } = useTranslation(['exercizer', 'common']);
  const translate = useCallback((key: string) => t(key), [t]);
  const queryClient = useQueryClient();
  const referential = useCatalogReferential();
  const programmes = useProgrammes();
  const preference = useQuery({
    queryKey: ['exercizer', 'ui-preference'],
    queryFn: getUiPreference,
    staleTime: Infinity,
  });
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [levelId, setLevelId] = useState<number | null>(null);
  const [disciplineId, setDisciplineId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [treeShown, setTreeShown] = useState(false);
  const [sequenceShown, setSequenceShown] = useState(false);
  const [sort, setSort] = useState<CatalogSort>('level');
  const isModerator = !!(useHasWorkflow(WORKFLOW.catalogManage) as boolean | undefined);
  const q = useDebounced(search);

  // Contexte : les niveaux que servent les établissements de l'usager (ou l'ENT, d'après son
  // thème). Hors contexte, programmes, niveaux et sujets sont masqués, sauf « Afficher tous les
  // niveaux ». Un lien vers un programme hors contexte s'ouvre quand même.
  const allLevels = preference.data?.catalog?.allLevels ?? false;
  const context = useContextLevels(allLevels);
  const visibleProgrammes = programmesInContext(
    programmes.data ?? [],
    context.levels,
    programmeOf(parseOrg(params.get('org'))),
  );
  const visibleReferential = useMemo(
    () => (referential.data ? referentialInContext(referential.data, context.levels) : undefined),
    [referential.data, context.levels],
  );

  // Le rangement n'est connu qu'une fois la préférence, les programmes et le contexte lus (un défaut
  // de lecture vaut « rien » : on retombe sur le rangement par niveau, sans contexte).
  const ready = !preference.isPending && !programmes.isPending && !context.isPending;
  const org: CatalogOrg = resolveOrg(
    parseOrg(params.get('org')),
    parseOrg(preference.data?.catalog?.org),
    visibleProgrammes,
  );
  const programme = programmeOf(org);
  const wantedView = parseView(params.get('view')) ?? parseView(preference.data?.catalog?.view) ?? 'tree';
  // La couverture ne se calcule que sur un programme.
  const view: CatalogView = wantedView === 'coverage' && !programme ? 'tree' : wantedView;
  const node = params.get('node');

  const savePreference = useMutation({
    mutationFn: (next: UiPreference) => setUiPreference(next),
    // Réécrite ENTIÈRE : on remet le résultat en cache (cf. UiSwitchBanner).
    onSuccess: (_data, next) => queryClient.setQueryData(['exercizer', 'ui-preference'], next),
  });

  /** Change le rangement, la vue ou le nœud ; un choix de rangement ou de vue est mémorisé. */
  const go = (next: { org?: CatalogOrg; view?: CatalogView; node?: string | null }) => {
    const nextOrg = next.org ?? org;
    const nextView = next.view ?? view;
    const nextNode = next.node === undefined ? (nextOrg === org ? node : null) : next.node;
    const search = new URLSearchParams(params);
    search.set('org', nextOrg);
    search.set('view', nextView);
    if (nextNode) search.set('node', nextNode);
    else search.delete('node');
    setParams(search);
    if (nextOrg !== org) {
      // Le filtre que le nouveau rangement remplace ne doit pas rester actif, invisible.
      if (nextOrg === 'level') setLevelId(null);
      if (nextOrg === 'discipline') setDisciplineId(null);
    }
    if ((next.org && next.org !== org) || (next.view && next.view !== view)) {
      saveCatalogPreference({ org: nextOrg, view: nextView });
    }
  };

  /** Mémorise une partie des choix du catalogue, sans effacer les autres. */
  const saveCatalogPreference = (catalog: NonNullable<UiPreference['catalog']>) => {
    const next = { ...(preference.data ?? {}), catalog: { ...preference.data?.catalog, ...catalog } };
    // Tout de suite à l'écran, sans attendre l'aller-retour.
    queryClient.setQueryData(['exercizer', 'ui-preference'], next);
    savePreference.mutate(next);
  };

  // Les filtres visibles : celui que le rangement remplace (niveau ou matière) est masqué.
  const filterLevel = org === 'level' ? null : levelId;
  // Sans niveau choisi, les sujets des niveaux du contexte (tous sans contexte).
  const contextLevelIds = context.levels ? (visibleReferential?.levels ?? []).map((level) => level.id) : [];
  const contextKey = contextLevelIds.join(',');
  const filterDiscipline = org === 'discipline' ? null : disciplineId;
  const criteria: CatalogSearch = {
    q,
    levels: filterLevel ? [filterLevel] : contextLevelIds,
    disciplines: filterDiscipline ? [filterDiscipline] : [],
  };

  // La couverture compte aussi les objectifs vides : elle lit tout le programme.
  const fullTree = full || view === 'coverage';
  const programmeTree = useQuery({
    queryKey: ['exercizer', 'catalog', 'programme-tree', programme, q, filterLevel, filterDiscipline, contextKey, fullTree],
    queryFn: () => getProgrammeTree(programme as string, criteria, fullTree),
    enabled: ready && !!programme,
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({
    queryKey: ['exercizer', 'catalog', 'facets', q, filterLevel, filterDiscipline, contextKey],
    queryFn: () => getCatalogFacets(criteria),
    enabled: ready && !programme,
    placeholderData: keepPreviousData,
  });

  const items = useMemo<CatalogTreeItem[]>(() => {
    if (programme) {
      if (!programmeTree.data) return [];
      const tree = buildProgrammeTree(programmeTree.data.nodes);
      if (programmeTree.data.unaligned > 0) {
        tree.push({
          id: UNALIGNED_NODE,
          name: t('exercizer.catalog.unaligned'),
          kind: 'node',
          count: programmeTree.data.unaligned,
          children: [],
        });
      }
      return tree;
    }
    if (!visibleReferential || !facets.data) return [];
    return org === 'discipline'
      ? buildDisciplineTree(visibleReferential, facets.data, translate)
      : buildLevelTree(visibleReferential, facets.data, translate);
  }, [programme, programmeTree.data, visibleReferential, facets.data, org, t, translate]);

  /** Les critères de la liste sous un nœud de l'arbre. */
  const searchUnder = useCallback(
    (nodeId: string | null, direct = false): CatalogSearch => {
      if (!nodeId) return criteria;
      if (programme) return { ...criteria, programme, node: nodeId, direct: direct && nodeId !== UNALIGNED_NODE };
      const fromNode = nodeCriteria(nodeId, referential.data?.levels ?? []);
      return {
        q,
        levels: fromNode.levels.length ? fromNode.levels : criteria.levels,
        disciplines: fromNode.disciplines.length ? fromNode.disciplines : criteria.disciplines,
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [programme, q, filterLevel, filterDiscipline, contextKey, referential.data],
  );

  // Un nouveau critère ramène à la première page.
  useEffect(() => setPage(1), [q, levelId, disciplineId, org, node, contextKey, sort]);

  // Chercher par objectif : les énoncés des programmes (de celui qui range le catalogue, sinon de
  // ceux du contexte) qui répondent à la recherche, avec leurs exercices.
  const visibleProgrammeIds = visibleProgrammes.map((entry) => entry.id).join(',');
  const objectives = useQuery({
    queryKey: ['exercizer', 'catalog', 'objectives', q, programme, filterLevel, filterDiscipline, contextKey],
    queryFn: () => getCatalogObjectives(criteria, programme),
    enabled: ready && !!q.trim() && visibleProgrammes.length > 0 && view !== 'coverage',
    placeholderData: keepPreviousData,
  });
  const objectiveHits = useMemo(
    () =>
      q.trim()
        ? (objectives.data ?? []).filter((objective) => visibleProgrammeIds.split(',').includes(objective.programme))
        : [],
    [q, objectives.data, visibleProgrammeIds],
  );

  const results = useQuery({
    queryKey: ['exercizer', 'catalog', 'search', org, node, q, filterLevel, filterDiscipline, contextKey, sort, page],
    queryFn: () => searchCatalog({ ...searchUnder(node), sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    enabled: ready && view === 'tree',
    placeholderData: keepPreviousData,
  });

  // Vue sommaire : les exercices de chaque nœud déplié, chargés à la demande.
  const [outline, setOutline] = useState<Map<string, OutlineEntry>>(new Map());
  const outlineKey = [org, q, filterLevel, filterDiscipline, contextKey, full].join('|');
  useEffect(() => setOutline(new Map()), [outlineKey]);
  const loadOutline = (nodeId: string) => {
    const item = findTreeItem(items, nodeId);
    if (!item || item.kind !== 'node' || outline.has(nodeId)) return;
    // Rangements par niveau ou matière : seules les feuilles (niveau × matière) portent des exercices.
    if (!programme && item.children.length > 0) return;
    const search = { ...searchUnder(nodeId, true), limit: OUTLINE_LIMIT, offset: 0 };
    void queryClient
      .fetchQuery({
        queryKey: ['exercizer', 'catalog', 'outline', outlineKey, nodeId],
        queryFn: () => searchCatalog(search),
        staleTime: 60 * 1000,
      })
      .then((page) =>
        setOutline((current) =>
          new Map(current).set(nodeId, {
            subjects: page.subjects.map((subject) => ({ id: subject.id, title: subject.title })),
            total: page.total,
          }),
        ),
      )
      .catch(() => undefined);
  };
  const outlineItems = useMemo(
    () =>
      view === 'outline'
        ? withOutlineLeaves(items, outline, t('exercizer.catalog.tree.loading'), (count) =>
            t('exercizer.catalog.tree.more', { count }),
          )
        : items,
    [view, items, outline, t],
  );

  const onTreeSelect = (item: CatalogTreeItem) => {
    if (item.kind === 'subject' && item.subjectId) setOpenedId(item.subjectId);
    else if (item.kind === 'more' && item.owner) go({ view: 'tree', node: item.owner });
    else if (item.kind === 'node' && view === 'tree') go({ node: item.id === node ? null : item.id });
  };

  const total = results.data?.total ?? 0;
  const subjects = results.data?.subjects ?? [];
  const treeQuery = programme ? programmeTree : facets;
  const selected = node ? findTreeItem(items, node) : undefined;

  // Couverture : les objectifs du niveau choisi, sinon ceux des niveaux du contexte (tous sans contexte).
  const coverageLevels = useMemo(() => {
    const levels = referential.data?.levels ?? [];
    if (filterLevel) return levels.filter((level) => level.id === filterLevel).map((level) => level.code ?? '');
    return context.levels ? (visibleReferential?.levels ?? []).map((level) => level.code ?? '') : null;
  }, [referential.data, filterLevel, context.levels, visibleReferential]);
  const coverage = useMemo(
    () => (view === 'coverage' && programmeTree.data ? programmeCoverage(programmeTree.data.nodes, coverageLevels) : []),
    [view, programmeTree.data, coverageLevels],
  );

  return (
    <section className="py-16">
      <div className="d-flex flex-wrap align-items-center gap-8 mb-8">
        <Heading level="h1" headingStyle="h3" className="flex-fill m-0">
          {t('exercizer.catalog.title')}
        </Heading>
        {isModerator && <ModerationButton />}
      </div>
      <p className="text-muted mb-16">{t('exercizer.catalog.intro')}</p>

      <div className="d-flex flex-wrap gap-12 align-items-center mb-16">
        <div className="flex-fill" style={{ minWidth: 240 }}>
          <SearchBar
            isVariant
            size="md"
            clearable
            placeholder={t('exercizer.catalog.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {ready && (
          <OrgSelect org={org} programmes={visibleProgrammes} onChange={(next) => go({ org: next, node: null })} />
        )}
        {visibleReferential && (
          <Filters
            referential={visibleReferential}
            levelId={filterLevel}
            disciplineId={filterDiscipline}
            showLevels={org !== 'level'}
            showDisciplines={org !== 'discipline'}
            onLevel={setLevelId}
            onDiscipline={setDisciplineId}
          />
        )}
        <ViewSwitch
          view={view}
          views={programme ? ['tree', 'outline', 'coverage'] : ['tree', 'outline']}
          onChange={(next) => go({ view: next })}
        />
        {(context.levels || allLevels) && (
          <Checkbox
            checked={allLevels}
            onChange={(event) => {
              setLevelId(null);
              saveCatalogPreference({ allLevels: event.target.checked });
            }}
            label={t('exercizer.catalog.allLevels')}
          />
        )}
      </div>

      {view !== 'coverage' && (
        <ObjectiveHits
          objectives={objectiveHits}
          q={q.trim()}
          onOpen={(objective) => {
            // L'énoncé ouvert montre tous ses exercices : la recherche qui y a mené s'efface.
            setSearch('');
            if (objective.count === 0) setFull(true);
            go({ org: programmeOrg(objective.programme), view: 'tree', node: objective.id });
          }}
        />
      )}

      {!ready || referential.isPending ? (
        <LoadingScreen position={false} />
      ) : view === 'coverage' ? (
        <TreeState query={programmeTree} empty={coverage.length === 0}>
          <CoverageTable
            rows={coverage}
            onOpen={(row) => {
              // Les objectifs vides doivent paraître dans l'arbre : c'est là qu'on y contribue.
              setFull(true);
              go({ view: 'tree', node: row.id });
            }}
          />
        </TreeState>
      ) : view === 'outline' ? (
        <div>
          {programme && <FullProgrammeToggle full={full} onChange={setFull} />}
          <TreeState query={treeQuery} empty={items.length === 0}>
            <nav aria-label={t('exercizer.catalog.tree.label')} data-testid="catalog-outline">
              <CatalogTree
                key={`${org}-outline`}
                items={outlineItems}
                selectedId={null}
                onSelect={onTreeSelect}
                onUnfold={loadOutline}
              />
            </nav>
          </TreeState>
        </div>
      ) : (
        <div className="row">
          <div className="col-12 col-md-4 mb-16">
            <Button
              className="d-md-none mb-8"
              color="tertiary"
              variant="outline"
              aria-expanded={treeShown}
              onClick={() => setTreeShown((shown) => !shown)}
            >
              {t(treeShown ? 'exercizer.catalog.tree.hide' : 'exercizer.catalog.tree.show')}
            </Button>
            <nav
              aria-label={t('exercizer.catalog.tree.label')}
              data-testid="catalog-tree"
              className={`${treeShown ? '' : 'd-none'} d-md-block overflow-auto`}
              style={{ maxHeight: '75vh' }}
            >
              {programme && <FullProgrammeToggle full={full} onChange={setFull} />}
              <Button
                size="sm"
                color="tertiary"
                variant={node ? 'ghost' : 'filled'}
                className="mb-8"
                onClick={() => go({ node: null })}
              >
                {t('exercizer.catalog.tree.all')}
              </Button>
              <TreeState query={treeQuery} empty={items.length === 0}>
                <CatalogTree key={`${org}-tree`} items={items} selectedId={node} onSelect={onTreeSelect} />
              </TreeState>
            </nav>
          </div>
          <div className="col-12 col-md-8">
            {selected && (
              <div className="d-flex align-items-center gap-8 mb-8">
                <span className="small text-muted">{t('exercizer.catalog.tree.in')}</span>
                {selected.code && <strong className="small">{selected.code}</strong>}
                <span className="small text-truncate flex-fill" title={selected.name}>
                  {selected.name}
                </span>
                {total > 0 && selected.id !== UNALIGNED_NODE && (
                  <Button
                    size="sm"
                    color="primary"
                    variant="outline"
                    className="text-nowrap"
                    onClick={() => setSequenceShown(true)}
                  >
                    {t('exercizer.catalog.sequence.open')}
                  </Button>
                )}
              </div>
            )}
            {results.isError ? (
              <Alert type="danger">{t('exercizer.error')}</Alert>
            ) : results.isPending ? (
              <LoadingScreen position={false} />
            ) : subjects.length === 0 ? (
              programme && selected && selected.count === 0 && isObjective(selected.type) && !q ? (
                <ContributeCall objective={selected} referential={referential.data} />
              ) : (
                <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.catalog.empty')} size={200} />
              )
            ) : (
              <>
                <div className="d-flex flex-wrap align-items-center gap-8 mb-8">
                  <p className="small text-muted m-0 flex-fill" aria-live="polite">
                    {t('exercizer.catalog.count', { count: total })}
                  </p>
                  <SortSelect sort={sort} onChange={setSort} />
                </div>
                <div className="grid gap-16">
                  {subjects.map((subject) => (
                    <div key={subject.id} className="g-col-12 g-col-lg-6">
                      <CatalogCard
                        subject={subject}
                        referential={referential.data}
                        onOpen={() => setOpenedId(subject.id)}
                        onAlignment={(alignment) =>
                          go({ org: programmeOrg(alignment.programme), view: 'tree', node: alignment.id })
                        }
                      />
                    </div>
                  ))}
                </div>
                {total > PAGE_SIZE && (
                  <Pagination
                    className="mt-24"
                    current={page}
                    total={total}
                    pageSize={PAGE_SIZE}
                    onChange={setPage}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {sequenceShown && selected && (
        <CreateSequenceDialog node={selected} search={searchUnder(node)} onClose={() => setSequenceShown(false)} />
      )}

      {openedId !== null && (
        <CatalogPreview
          subjectId={openedId}
          referential={referential.data}
          onClose={() => setOpenedId(null)}
        />
      )}
    </section>
  );
}

/** Le tri des résultats : ordre de la scolarité, les plus copiés ou les mieux notés. */
function SortSelect({ sort, onChange }: { sort: CatalogSort; onChange: (sort: CatalogSort) => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  return (
    <div className="d-flex align-items-center gap-8">
      <label htmlFor={id} className="small text-muted text-nowrap">
        {t('exercizer.catalog.sort')}
      </label>
      <select
        id={id}
        className="form-select form-select-sm w-auto"
        value={sort}
        onChange={(event) => onChange(event.target.value as CatalogSort)}
      >
        <option value="level">{t('exercizer.catalog.sort.level')}</option>
        <option value="usage">{t('exercizer.catalog.sort.usage')}</option>
        <option value="rating">{t('exercizer.catalog.sort.rating')}</option>
      </select>
    </div>
  );
}

/** « Organiser par » : chaque programme publié, puis niveau et matière. */
function OrgSelect({
  org,
  programmes,
  onChange,
}: {
  org: CatalogOrg;
  programmes: Programme[];
  onChange: (org: CatalogOrg) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  return (
    <div className="d-flex align-items-center gap-8">
      <label htmlFor={`${id}-org`} className="small text-nowrap">
        {t('exercizer.catalog.org')}
      </label>
      <select
        id={`${id}-org`}
        className="form-select w-auto"
        value={org}
        onChange={(event) => {
          const next = parseOrg(event.target.value);
          if (next) onChange(next);
        }}
      >
        {programmes.length > 0 && (
          <optgroup label={t('exercizer.catalog.org.programmes')}>
            {programmes.map((entry) => (
              <option key={entry.id} value={programmeOrg(entry.id)}>
                {entry.title}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={t('exercizer.catalog.org.classification')}>
          <option value="level">{t('exercizer.catalog.org.level')}</option>
          <option value="discipline">{t('exercizer.catalog.org.discipline')}</option>
        </optgroup>
      </select>
    </div>
  );
}

/** Arbre et résultats, sommaire, ou couverture du programme. */
function ViewSwitch({
  view,
  views,
  onChange,
}: {
  view: CatalogView;
  views: CatalogView[];
  onChange: (view: CatalogView) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <div className="btn-group" role="group" aria-label={t('exercizer.catalog.view')}>
      {views.map((entry) => (
        <Button
          key={entry}
          size="sm"
          color="primary"
          variant={view === entry ? 'filled' : 'outline'}
          aria-pressed={view === entry}
          onClick={() => onChange(entry)}
        >
          {t(`exercizer.catalog.view.${entry}`)}
        </Button>
      ))}
    </div>
  );
}

/**
 * La couverture du programme, domaine par domaine : la part des objectifs qui ont au moins un
 * exercice, pour voir où produire du contenu. Triable, les moins couverts d'abord sur demande ; un
 * domaine s'ouvre dans l'arbre, objectifs vides compris.
 */
function CoverageTable({ rows, onOpen }: { rows: CoverageRow[]; onOpen: (row: CoverageRow) => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [leastFirst, setLeastFirst] = useState(false);
  const sorted = leastFirst
    ? [...rows].sort((a, b) => coverageRatio(a) - coverageRatio(b) || b.objectives - a.objectives)
    : rows;
  const objectives = rows.reduce((sum, row) => sum + row.objectives, 0);
  const covered = rows.reduce((sum, row) => sum + row.covered, 0);
  const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  return (
    <div data-testid="catalog-coverage">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-12 mb-12">
        <p className="m-0" aria-live="polite">
          {t('exercizer.catalog.coverage.summary', {
            covered,
            objectives,
            percent: percent(covered, objectives),
          })}
        </p>
        <Checkbox
          checked={leastFirst}
          onChange={(event) => setLeastFirst(event.target.checked)}
          label={t('exercizer.catalog.coverage.leastFirst')}
        />
      </div>
      <p className="small text-muted mb-12">{t('exercizer.catalog.coverage.help')}</p>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('exercizer.catalog.coverage.domain')}</Table.Th>
            <Table.Th>{t('exercizer.catalog.coverage.objectives')}</Table.Th>
            <Table.Th style={{ minWidth: 160 }}>{t('exercizer.catalog.coverage.rate')}</Table.Th>
            <Table.Th>{t('exercizer.catalog.coverage.exercises')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sorted.map((row) => {
            const rate = percent(row.covered, row.objectives);
            return (
              <Table.Tr key={row.id}>
                <Table.Td>
                  {row.path.length > 0 && <div className="small text-muted">{row.path.join(' › ')}</div>}
                  <button
                    type="button"
                    // Sans la classe `btn`, dont certains thèmes changent la police et la casse.
                    className="p-0 border-0 bg-transparent text-start text-primary text-decoration-underline"
                    onClick={() => onOpen(row)}
                  >
                    {row.code && <strong className="me-8">{row.code}</strong>}
                    {row.label}
                  </button>
                </Table.Td>
                <Table.Td className="text-nowrap">
                  {row.covered} / {row.objectives}
                </Table.Td>
                <Table.Td>
                  {/* Le socle n'a pas de barre de progression : deux blocs aux couleurs du thème. */}
                  <div className="d-flex align-items-center gap-8">
                    <div
                      className="flex-fill rounded-pill overflow-hidden bg-gray-300"
                      style={{ height: 8 }}
                      role="progressbar"
                      aria-label={row.label}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={rate}
                    >
                      <div
                        className={`h-100 ${rate === 0 ? '' : rate < 50 ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="small text-nowrap">{rate} %</span>
                  </div>
                </Table.Td>
                <Table.Td>{row.exercises}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </div>
  );
}

/**
 * Un objectif du programme sans exercice : on invite l'enseignant à proposer le sien. Le sujet est
 * créé dans « Mes sujets », titré de l'objectif, rattaché à lui et classé à ses niveaux, puis
 * l'éditeur s'ouvre ; il le publiera au catalogue une fois prêt.
 */
function ContributeCall({
  objective,
  referential,
}: {
  objective: CatalogTreeItem;
  referential: CatalogReferential | undefined;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme } = useEdificeTheme();

  const contribute = useMutation({
    mutationFn: async () => {
      const subject = await createSubject({
        title: objective.name.slice(0, 255),
        type: 'interactive',
        folder_id: null,
        // Comme à la création d'un sujet : le grand format d'office au premier degré.
        large_display: !!theme?.is1d,
      });
      const levelIds = (referential?.levels ?? [])
        .filter((level) => !!level.code && (objective.levels ?? []).includes(level.code))
        .map((level) => level.id);
      await setClassification(subject.id, {
        level_ids: levelIds,
        discipline_ids: [],
        alignment_ids: [objective.id],
      });
      return subject;
    },
    onSuccess: (subject) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
      navigate(`/subject/edit/${subject.id}/`);
    },
  });

  return (
    <div className="text-center py-24" data-testid="catalog-contribute">
      <img src={illuExercizer} alt="" width={200} className="mb-16" />
      <p className="fw-bold mb-8">{t('exercizer.catalog.contribute.empty')}</p>
      <p className="text-muted mb-16">{t('exercizer.catalog.contribute.help')}</p>
      {contribute.isError && (
        <Alert type="danger" className="mb-16">
          {t('exercizer.error')}
        </Alert>
      )}
      <Button color="primary" variant="filled" isLoading={contribute.isPending} onClick={() => contribute.mutate()}>
        {t('exercizer.catalog.contribute.action')}
      </Button>
    </div>
  );
}

function FullProgrammeToggle({ full, onChange }: { full: boolean; onChange: (full: boolean) => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <div className="mb-8">
      <Checkbox
        checked={full}
        onChange={(event) => onChange(event.target.checked)}
        label={t('exercizer.catalog.tree.full')}
      />
    </div>
  );
}

/** L'état de chargement de l'arbre, puis l'arbre lui-même. */
function TreeState({
  query,
  empty,
  children,
}: {
  query: { isError: boolean; isPending: boolean };
  empty: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  if (query.isError) return <Alert type="danger">{t('exercizer.error')}</Alert>;
  if (query.isPending) return <LoadingScreen position={false} />;
  if (empty) return <p className="small text-muted">{t('exercizer.catalog.empty')}</p>;
  return <>{children}</>;
}

function Filters({
  referential,
  levelId,
  disciplineId,
  showLevels,
  showDisciplines,
  onLevel,
  onDiscipline,
}: {
  referential: CatalogReferential;
  levelId: number | null;
  disciplineId: number | null;
  showLevels: boolean;
  showDisciplines: boolean;
  onLevel: (id: number | null) => void;
  onDiscipline: (id: number | null) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const translate = (key: string) => t(key);
  return (
    <>
      {showLevels && (
        <>
      <label htmlFor={`${id}-level`} className="visually-hidden">
        {t('exercizer.catalog.levels')}
      </label>
      <select
        id={`${id}-level`}
        className="form-select w-auto"
        value={levelId ?? ''}
        onChange={(event) => onLevel(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">{t('exercizer.catalog.levels.all')}</option>
        {groupLevels(referential.levels).map(({ group, levels }) => (
          <optgroup key={group} label={t(`exercizer.catalog.group.${group}`)}>
            {levels.map((level) => (
              <option key={level.id} value={level.id}>
                {t(level.label)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
        </>
      )}
      {showDisciplines && (
        <>
      <label htmlFor={`${id}-discipline`} className="visually-hidden">
        {t('exercizer.catalog.disciplines')}
      </label>
      <select
        id={`${id}-discipline`}
        className="form-select w-auto"
        value={disciplineId ?? ''}
        onChange={(event) => onDiscipline(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">{t('exercizer.catalog.disciplines.all')}</option>
        {sortDisciplines(referential.disciplines, translate).map((discipline) => (
          <option key={discipline.id} value={discipline.id}>
            {t(discipline.label)}
          </option>
        ))}
      </select>
        </>
      )}
    </>
  );
}

/**
 * Les pastilles de niveaux, de matières, puis des énoncés du programme que le sujet travaille ; un
 * clic sur un énoncé range le catalogue selon son programme et ouvre son nœud.
 */
function ClassificationBadges({
  subject,
  referential,
  onAlignment,
}: {
  subject: Pick<CatalogSubject, 'level_ids' | 'discipline_ids' | 'alignments'>;
  referential: CatalogReferential | undefined;
  onAlignment?: (alignment: Alignment) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  if (!referential) return null;
  const translate = (key: string) => t(key);
  return (
    <div className="d-flex flex-wrap gap-4">
      {labelsOf(subject.level_ids, referential.levels, translate).map((label) => (
        <Badge key={`l-${label}`} variant={{ type: 'content', level: 'info', background: true }}>
          {label}
        </Badge>
      ))}
      {labelsOf(subject.discipline_ids, referential.disciplines, translate).map((label) => (
        <Badge key={`d-${label}`} variant={{ type: 'content', level: 'success', background: true }}>
          {label}
        </Badge>
      ))}
      {(subject.alignments ?? []).map((alignment) =>
        onAlignment ? (
          <button
            key={`a-${alignment.id}`}
            type="button"
            // Au-dessus du bouton transparent (z-1) que le socle étend sur toute la carte cliquable ;
            // sans la classe `btn`, dont certains thèmes changent la police et la casse.
            className="p-0 border-0 bg-transparent position-relative z-2"
            title={alignment.label}
            aria-label={t('exercizer.catalog.align.open', { code: alignment.code ?? '', label: alignment.label })}
            onClick={(event) => {
              // La carte entière ouvre l'aperçu : le clic sur l'énoncé ne doit pas l'atteindre.
              event.stopPropagation();
              onAlignment(alignment);
            }}
          >
            <Badge variant={{ type: 'content', level: 'warning', background: true }}>
              {alignment.code ?? alignment.label}
            </Badge>
          </button>
        ) : (
          <span key={`a-${alignment.id}`} title={alignment.label}>
            <Badge variant={{ type: 'content', level: 'warning', background: true }}>
              {alignment.code ?? alignment.label}
            </Badge>
          </span>
        ),
      )}
    </div>
  );
}

function CatalogCard({
  subject,
  referential,
  onOpen,
  onAlignment,
}: {
  subject: CatalogSubject;
  referential: CatalogReferential | undefined;
  onOpen: () => void;
  onAlignment: (alignment: Alignment) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const description = plainText(subject.description);
  return (
    // Sans `isSelectable={false}`, le socle pose un bouton « ⋯ » sans menu : les actions
    // (copier, retirer) sont dans l'aperçu qu'ouvre le clic sur la carte.
    <Card isSelectable={false} isClickable onClick={onOpen} className="h-100">
      <Card.Body>
        <div className="d-flex flex-column gap-8 flex-fill">
          <Card.Title>{subject.title}</Card.Title>
          <ClassificationBadges subject={subject} referential={referential} onAlignment={onAlignment} />
          {description && <Card.Text className="text-muted">{description}</Card.Text>}
          <Card.Text className="small text-muted">
            {subject.type === 'simple'
              ? t('exercizer.simple.subject')
              : t('exercizer.catalog.questions', { count: subject.question_count })}
            {' · '}
            {subject.authors_contributors || subject.owner_username}
          </Card.Text>
          <UsageLine subject={subject} />
        </div>
      </Card.Body>
    </Card>
  );
}

/** Aperçu d'un sujet du catalogue, réponses attendues comprises, et sa copie dans « Mes sujets ». */
function CatalogPreview({
  subjectId,
  referential,
  onClose,
}: {
  subjectId: number;
  referential: CatalogReferential | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useEdificeClient();
  const isModerator = useHasWorkflow(WORKFLOW.catalogManage) as boolean | undefined;
  const [confirmRemove, setConfirmRemove] = useState(false);
  /** Rattachement au programme en cours d'édition (auteur ou modérateur), dans l'aperçu même. */
  const [aligning, setAligning] = useState<string[] | null>(null);

  const detail = useQuery({
    queryKey: ['exercizer', 'catalog', 'subject', subjectId],
    queryFn: () => getCatalogSubject(subjectId),
  });

  const copy = useMutation({
    mutationFn: () => copyCatalogSubject(subjectId, null),
    onSuccess: ({ id: newId }) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
      // La copie compte dans les signaux d'usage des cartes et de l'aperçu.
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'catalog'] });
      const simple = detail.data?.subject.type === 'simple';
      navigate(simple ? `/subject/edit/simple/${newId}/` : `/subject/edit/${newId}/`);
    },
  });

  const remove = useMutation({
    mutationFn: () => removeCatalogSubject(subjectId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'catalog', 'search'] });
      onClose();
    },
  });

  const realign = useMutation({
    mutationFn: (alignmentIds: string[]) =>
      reclassifyCatalogSubject(subjectId, {
        level_ids: detail.data?.subject.level_ids ?? [],
        discipline_ids: detail.data?.subject.discipline_ids ?? [],
        alignment_ids: alignmentIds,
      }),
    onSuccess: () => {
      setAligning(null);
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'catalog'] });
    },
  });

  const subject = detail.data?.subject;
  const grains = detail.data?.grains ?? [];
  const canManage = subject ? canManageCatalogSubject(subject, user?.userId, !!isModerator) : false;

  return (
    <>
      <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
        <Modal.Header onModalClose={onClose}>{subject?.title ?? t('exercizer.catalog.title')}</Modal.Header>
        <Modal.Body>
          {(copy.isError || remove.isError || realign.isError) && (
            <Alert type="danger" className="mb-16">
              {t('exercizer.error')}
            </Alert>
          )}
          {detail.isError ? (
            <Alert type="danger">{t('exercizer.error')}</Alert>
          ) : !subject ? (
            <LoadingScreen position={false} />
          ) : (
            <>
              <ClassificationBadges subject={subject} referential={referential} />
              <p className="small text-muted mt-8">
                {t('exercizer.catalog.by')} {subject.authors_contributors || subject.owner_username}
              </p>
              {subject.description && (
                <div className="mb-16" dangerouslySetInnerHTML={{ __html: sanitizeHtml(subject.description) }} />
              )}
              {aligning !== null && referential ? (
                <div className="border rounded p-12 mb-16">
                  {!isModerator && (
                    <Alert type="info" className="mb-12">
                      {t('exercizer.catalog.align.proposed')}
                    </Alert>
                  )}
                  <AlignmentPicker
                    referential={referential}
                    value={aligning}
                    onChange={setAligning}
                    levelIds={subject.level_ids}
                    disciplineIds={subject.discipline_ids}
                    text={`${subject.title} ${plainText(subject.description)}`}
                  />
                  <div className="d-flex justify-content-end gap-8 mt-12">
                    <Button color="tertiary" variant="ghost" onClick={() => setAligning(null)}>
                      {t('exercizer.cancel')}
                    </Button>
                    <Button
                      color="primary"
                      variant="filled"
                      isLoading={realign.isPending}
                      onClick={() => realign.mutate(aligning)}
                    >
                      {t('exercizer.update')}
                    </Button>
                  </div>
                </div>
              ) : (
                (!!subject.alignments?.length || (canManage && !!subject.pending_alignments?.length)) && (
                  <div className="mb-16">
                    <div className="small text-muted mb-4">{t('exercizer.catalog.align.title')}</div>
                    <ul className="list-unstyled m-0 d-flex flex-column gap-4">
                      {(subject.alignments ?? []).map((alignment) => (
                        <li key={alignment.id} className="small">
                          {alignment.code && <strong className="me-8">{alignment.code}</strong>}
                          {alignment.label}
                        </li>
                      ))}
                      {/* Proposés, pas encore validés : seuls l'auteur et les modérateurs les voient. */}
                      {canManage &&
                        (subject.pending_alignments ?? []).map((alignment) => (
                          <li key={alignment.id} className="small text-muted" data-testid="catalog-pending-alignment">
                            {alignment.code && <strong className="me-8">{alignment.code}</strong>}
                            {alignment.label}{' '}
                            <Badge variant={{ type: 'content', level: 'warning', background: false }}>
                              {t('exercizer.catalog.align.pending')}
                            </Badge>
                          </li>
                        ))}
                    </ul>
                  </div>
                )
              )}
              <UsagePanel subjectId={subjectId} userId={user?.userId} isModerator={!!isModerator} />
              <Alert type="info" className="mb-16">
                {t('exercizer.catalog.preview.help')}
              </Alert>
              {grains.map((grain) => (
                <PrintedGrain key={grain.id} grain={grain} grains={grains} showResponses />
              ))}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {/* La confirmation du retrait reste DANS l'aperçu : une seconde fenêtre modale par-dessus
              prendrait chacun de ses clics pour un clic hors de l'aperçu, qui se refermerait avant. */}
          {confirmRemove ? (
            <>
              <span className="me-auto small">{t('exercizer.catalog.remove.confirm')}</span>
              <Button color="tertiary" variant="ghost" onClick={() => setConfirmRemove(false)}>
                {t('exercizer.cancel')}
              </Button>
              <Button
                color="danger"
                variant="filled"
                isLoading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                {t('exercizer.catalog.remove')}
              </Button>
            </>
          ) : (
            <>
              {canManage && (
                <Button color="danger" variant="outline" onClick={() => setConfirmRemove(true)}>
                  {t('exercizer.catalog.remove')}
                </Button>
              )}
              {canManage && aligning === null && subject && (
                <Button
                  color="secondary"
                  variant="outline"
                  // Les propositions en attente font partie du rattachement voulu : les garder cochées.
                  onClick={() =>
                    setAligning(
                      [...(subject.alignments ?? []), ...(subject.pending_alignments ?? [])].map(
                        (alignment) => alignment.id,
                      ),
                    )
                  }
                >
                  {t('exercizer.catalog.align.edit')}
                </Button>
              )}
              <Button color="tertiary" variant="ghost" onClick={onClose}>
                {t('exercizer.cancel')}
              </Button>
              <Button
                color="primary"
                variant="filled"
                isLoading={copy.isPending}
                disabled={!subject}
                onClick={() => copy.mutate()}
              >
                {t('exercizer.catalog.copy')}
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default Catalog;
