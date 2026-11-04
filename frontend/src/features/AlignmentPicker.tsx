import { Alert, Badge, Button, Checkbox, LoadingScreen, SearchBar, useEdificeTheme } from '@open-ent/react';
import { IconClose, IconPlus, IconRafterRight } from '@open-ent/react/icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getAlignmentSuggestions,
  getCatalogContext,
  getProgrammes,
  getProgrammeTree,
  getThemeSchoolLevels,
} from '../api';
import { contextLevels, programmesInContext, visibleProgrammeNodes } from '../catalog';
import { CatalogReferential, ProgrammeNode } from '../types';

/** Au-delà, la recherche demande d'être précisée plutôt que d'afficher des centaines d'énoncés. */
const MAX_ROWS = 300;

/** Les programmes publiés : ils ne changent qu'avec un import dans le module case. */
export const useProgrammes = () =>
  useQuery({
    queryKey: ['exercizer', 'catalog', 'programmes'],
    queryFn: getProgrammes,
    staleTime: 5 * 60 * 1000,
  });

/** Les niveaux servis par les établissements de l'usager. */
export const useCatalogContext = () =>
  useQuery({
    queryKey: ['exercizer', 'catalog', 'context'],
    queryFn: getCatalogContext,
    staleTime: 5 * 60 * 1000,
  });

/**
 * Les groupes de niveaux à montrer (cf. `contextLevels`) : ceux des établissements de l'usager,
 * sinon ceux que le thème de l'ENT déclare servir ; null pour tout montrer.
 */
export function useContextLevels(showAll: boolean) {
  const context = useCatalogContext();
  const { theme } = useEdificeTheme();
  // Niveaux servis déclarés par le thème : portés par `theme` quand le socle les transmet, sinon
  // relus dans `/theme` (que le socle a déjà demandé : la réponse est en cache de session).
  const fromProvider = (theme as { schoolLevels?: string[] } | undefined)?.schoolLevels;
  const fromPortal = useQuery({
    queryKey: ['exercizer', 'theme', 'school-levels'],
    queryFn: getThemeSchoolLevels,
    enabled: !fromProvider,
    staleTime: Infinity,
  });
  const themeLevels = fromProvider ?? fromPortal.data;
  return {
    levels: contextLevels(context.data, themeLevels, showAll),
    isPending: context.isPending || (!fromProvider && fromPortal.isPending),
  };
}

/** Tout l'arbre d'un programme (environ 3 000 énoncés pour le primaire), gardé le temps de la session. */
const useFullProgrammeTree = (programme: string | null) =>
  useQuery({
    queryKey: ['exercizer', 'catalog', 'programme-tree', programme, 'full'],
    queryFn: () => getProgrammeTree(programme as string, {}, true),
    enabled: !!programme,
    staleTime: Infinity,
  });

/**
 * Choix des énoncés du programme qu'un sujet travaille (rattachement facultatif). L'arbre est
 * réduit aux niveaux du sujet et se filtre par code ou par texte ; des suggestions, calculées
 * d'après les niveaux, les matières et le texte du sujet, s'ajoutent d'un clic.
 *
 * Sans programme publié (module case absent), le sélecteur ne s'affiche pas.
 */
export function AlignmentPicker({
  referential,
  value,
  onChange,
  levelIds,
  disciplineIds,
  text,
}: {
  referential: CatalogReferential;
  value: string[];
  onChange: (ids: string[]) => void;
  levelIds: number[];
  disciplineIds: number[];
  /** Le titre et la description du sujet, pour les suggestions. */
  text: string;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const allProgrammes = useProgrammes();
  const context = useContextLevels(false);
  // Les programmes des niveaux de l'établissement ; tous si aucun ne les couvre.
  const inContext = programmesInContext(allProgrammes.data ?? [], context.levels);
  const programmeList = inContext.length ? inContext : (allProgrammes.data ?? []);
  const programmes = { isPending: allProgrammes.isPending || context.isPending, data: programmeList };
  const [programme, setProgramme] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [onlySubjectLevels, setOnlySubjectLevels] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!programme && !programmes.isPending && programmes.data.length) setProgramme(programmes.data[0].id);
  }, [programme, programmes.isPending, programmes.data]);

  const tree = useFullProgrammeTree(programme);
  const nodes = tree.data?.nodes ?? [];
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const children = useMemo(() => {
    const map = new Map<string | null, ProgrammeNode[]>();
    for (const node of nodes) map.set(node.parent, [...(map.get(node.parent) ?? []), node]);
    return map;
  }, [nodes]);

  const levelCodes = useMemo(
    () =>
      referential.levels
        .filter((level) => levelIds.includes(level.id) && level.code)
        .map((level) => level.code as string),
    [referential.levels, levelIds],
  );
  const filterLevels = onlySubjectLevels ? levelCodes : [];
  const visible = useMemo(
    () => visibleProgrammeNodes(nodes, search, filterLevels),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, search, filterLevels.join(',')],
  );
  // Une recherche déplie tout ce qu'elle trouve ; sinon, l'usager déplie à la main.
  const searching = search.trim().length > 0;

  const suggestions = useQuery({
    queryKey: ['exercizer', 'catalog', 'suggestions', programme, levelIds, disciplineIds, text],
    queryFn: () =>
      getAlignmentSuggestions(programme as string, { levels: levelIds, disciplines: disciplineIds, text }),
    enabled: !!programme && (levelIds.length > 0 || disciplineIds.length > 0 || !!text.trim()),
    staleTime: 60 * 1000,
  });

  const toggle = (nodeId: string, checked: boolean) =>
    onChange(checked ? [...value, nodeId] : value.filter((selected) => selected !== nodeId));

  if (programmes.isPending) return <LoadingScreen position={false} />;
  if (!programmes.data?.length) return null;

  let rows = 0;
  const renderLevel = (parent: string | null, depth: number) => {
    const list = (children.get(parent) ?? []).filter((node) => !visible || visible.has(node.id));
    if (list.length === 0) return null;
    return (
      <ul role={depth === 0 ? 'tree' : 'group'} className="list-unstyled m-0 p-0">
        {list.map((node) => {
          if (rows >= MAX_ROWS) return null;
          rows += 1;
          const hasChildren = (children.get(node.id) ?? []).some((child) => !visible || visible.has(child.id));
          const open = hasChildren && (searching || expanded.has(node.id));
          const checked = value.includes(node.id);
          return (
            <li key={node.id} role="treeitem" aria-expanded={hasChildren ? open : undefined} aria-selected={checked}>
              <div className="d-flex align-items-start gap-4 py-2" style={{ paddingLeft: depth * 16 }}>
                {hasChildren ? (
                  <button
                    type="button"
                    className="btn btn-sm p-0 border-0 flex-shrink-0"
                    aria-label={t('exercizer.catalog.align.toggle', { label: node.code ?? node.label })}
                    disabled={searching}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      })
                    }
                  >
                    <IconRafterRight
                      width={16}
                      height={16}
                      style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }}
                    />
                  </button>
                ) : (
                  <span className="flex-shrink-0" style={{ width: 16 }} />
                )}
                <Checkbox
                  checked={checked}
                  onChange={(event) => toggle(node.id, event.target.checked)}
                  label={node.code ? `${node.code} — ${node.label}` : node.label}
                />
              </div>
              {open && renderLevel(node.id, depth + 1)}
            </li>
          );
        })}
      </ul>
    );
  };

  const pendingSuggestions = (suggestions.data ?? []).filter((suggestion) => !value.includes(suggestion.id));

  return (
    <div className="d-flex flex-column gap-12">
      {programmes.data.length > 1 && (
        <div>
          <label htmlFor={`${id}-programme`} className="form-label">
            {t('exercizer.catalog.align.programme')}
          </label>
          <select
            id={`${id}-programme`}
            className="form-select"
            value={programme ?? ''}
            onChange={(event) => {
              setProgramme(event.target.value);
              setExpanded(new Set());
            }}
          >
            {programmes.data.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </div>
      )}

      {value.length > 0 && (
        <div>
          <div className="small text-muted mb-4">
            {t('exercizer.catalog.align.selected', { count: value.length })}
          </div>
          <ul className="list-unstyled m-0 d-flex flex-column gap-4">
            {value.map((selected) => {
              const node = byId.get(selected);
              return (
                <li key={selected} className="d-flex align-items-start gap-8">
                  <Badge variant={{ type: 'content', level: 'warning', background: true }}>
                    {node?.code ?? '…'}
                  </Badge>
                  <span className="small flex-fill">{node?.label ?? selected}</span>
                  <Button
                    size="sm"
                    color="tertiary"
                    variant="ghost"
                    leftIcon={<IconClose />}
                    aria-label={t('exercizer.catalog.align.remove', { label: node?.code ?? selected })}
                    onClick={() => toggle(selected, false)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pendingSuggestions.length > 0 && (
        <div>
          <div className="small text-muted mb-4">{t('exercizer.catalog.align.suggestions')}</div>
          <ul className="list-unstyled m-0 d-flex flex-column gap-4">
            {pendingSuggestions.map((suggestion) => (
              <li key={suggestion.id}>
                <Button
                  size="sm"
                  color="secondary"
                  variant="ghost"
                  className="text-start"
                  leftIcon={<IconPlus />}
                  onClick={() => toggle(suggestion.id, true)}
                >
                  {suggestion.code && <strong className="me-4">{suggestion.code}</strong>}
                  {suggestion.label}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="d-flex flex-wrap align-items-center gap-12">
        <div className="flex-fill" style={{ minWidth: 220 }}>
          <SearchBar
            isVariant
            size="md"
            clearable
            placeholder={t('exercizer.catalog.align.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {levelCodes.length > 0 && (
          <Checkbox
            checked={onlySubjectLevels}
            onChange={(event) => setOnlySubjectLevels(event.target.checked)}
            label={t('exercizer.catalog.align.subjectLevels')}
          />
        )}
      </div>

      {tree.isError ? (
        <Alert type="danger">{t('exercizer.error')}</Alert>
      ) : tree.isPending ? (
        <LoadingScreen position={false} />
      ) : (
        <div className="border rounded p-8 overflow-auto" style={{ maxHeight: 360 }}>
          {renderLevel(null, 0) ?? <p className="small text-muted m-0">{t('exercizer.catalog.align.none')}</p>}
          {rows >= MAX_ROWS && <p className="small text-muted m-0 mt-8">{t('exercizer.catalog.align.refine')}</p>}
        </div>
      )}
    </div>
  );
}

export default AlignmentPicker;
