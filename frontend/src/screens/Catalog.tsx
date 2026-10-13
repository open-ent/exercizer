import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyScreen,
  Heading,
  LoadingScreen,
  Modal,
  Pagination,
  SearchBar,
  useEdificeClient,
  useHasWorkflow,
} from '@open-ent/react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import { copyCatalogSubject, getCatalogSubject, removeCatalogSubject, searchCatalog } from '../api';
import { canManageCatalogSubject, groupLevels, labelsOf, sortDisciplines } from '../catalog';
import { useCatalogReferential } from '../components/CatalogDialogs';
import { WORKFLOW } from '../rights';
import { CatalogReferential, CatalogSubject } from '../types';
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

/**
 * Catalogue d'exercices partagé entre TOUS les établissements de l'ENT. Un enseignant y cherche par
 * niveau, matière et mots-clés, prévisualise un sujet avec ses réponses attendues, puis le copie
 * dans « Mes sujets » pour l'adapter et le distribuer. Le sujet du catalogue n'est jamais
 * distribué en place : chacun travaille sur sa copie.
 */
export function Catalog() {
  const { t } = useTranslation(['exercizer', 'common']);
  const referential = useCatalogReferential();
  const [search, setSearch] = useState('');
  const [levelId, setLevelId] = useState<number | null>(null);
  const [disciplineId, setDisciplineId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [openedId, setOpenedId] = useState<number | null>(null);
  const q = useDebounced(search);

  // Un nouveau critère ramène à la première page.
  useEffect(() => setPage(1), [q, levelId, disciplineId]);

  const results = useQuery({
    queryKey: ['exercizer', 'catalog', 'search', q, levelId, disciplineId, page],
    queryFn: () =>
      searchCatalog({
        q,
        levels: levelId ? [levelId] : [],
        disciplines: disciplineId ? [disciplineId] : [],
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });

  const total = results.data?.total ?? 0;
  const subjects = results.data?.subjects ?? [];

  return (
    <section className="py-16">
      <Heading level="h1" headingStyle="h3" className="mb-8">
        {t('exercizer.catalog.title')}
      </Heading>
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
        {referential.data && (
          <Filters
            referential={referential.data}
            levelId={levelId}
            disciplineId={disciplineId}
            onLevel={setLevelId}
            onDiscipline={setDisciplineId}
          />
        )}
      </div>

      {results.isError ? (
        <Alert type="danger">{t('exercizer.error')}</Alert>
      ) : results.isPending ? (
        <LoadingScreen position={false} />
      ) : subjects.length === 0 ? (
        <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.catalog.empty')} size={200} />
      ) : (
        <>
          <p className="small text-muted mb-8" aria-live="polite">
            {t('exercizer.catalog.count', { count: total })}
          </p>
          <div className="grid gap-16">
            {subjects.map((subject) => (
              <div key={subject.id} className="g-col-12 g-col-md-6 g-col-xl-4">
                <CatalogCard
                  subject={subject}
                  referential={referential.data}
                  onOpen={() => setOpenedId(subject.id)}
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

function Filters({
  referential,
  levelId,
  disciplineId,
  onLevel,
  onDiscipline,
}: {
  referential: CatalogReferential;
  levelId: number | null;
  disciplineId: number | null;
  onLevel: (id: number | null) => void;
  onDiscipline: (id: number | null) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const translate = (key: string) => t(key);
  return (
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
  );
}

/** Les pastilles de niveaux puis de matières d'un sujet. */
function ClassificationBadges({
  subject,
  referential,
}: {
  subject: Pick<CatalogSubject, 'level_ids' | 'discipline_ids'>;
  referential: CatalogReferential | undefined;
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
    </div>
  );
}

function CatalogCard({
  subject,
  referential,
  onOpen,
}: {
  subject: CatalogSubject;
  referential: CatalogReferential | undefined;
  onOpen: () => void;
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
          <ClassificationBadges subject={subject} referential={referential} />
          {description && <Card.Text className="text-muted">{description}</Card.Text>}
          <Card.Text className="small text-muted">
            {subject.type === 'simple'
              ? t('exercizer.simple.subject')
              : t('exercizer.catalog.questions', { count: subject.question_count })}
            {' · '}
            {subject.authors_contributors || subject.owner_username}
          </Card.Text>
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

  const detail = useQuery({
    queryKey: ['exercizer', 'catalog', 'subject', subjectId],
    queryFn: () => getCatalogSubject(subjectId),
  });

  const copy = useMutation({
    mutationFn: () => copyCatalogSubject(subjectId, null),
    onSuccess: ({ id: newId }) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
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

  const subject = detail.data?.subject;
  const grains = detail.data?.grains ?? [];
  const canManage = subject ? canManageCatalogSubject(subject, user?.userId, !!isModerator) : false;

  return (
    <>
      <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
        <Modal.Header onModalClose={onClose}>{subject?.title ?? t('exercizer.catalog.title')}</Modal.Header>
        <Modal.Body>
          {(copy.isError || remove.isError) && (
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
