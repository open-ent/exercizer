import { Alert, Badge, Button, Checkbox, FormControl, Input, Label, LoadingScreen, Modal } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import {
  addSubjectSequenceItem,
  CatalogSearch,
  copyCatalogSubject,
  createFolder,
  createSubjectSequence,
  searchCatalog,
} from '../api';
import { CatalogObjective } from '../types';

/**
 * Les énoncés des programmes qui répondent à la recherche, en tête des résultats : « fractions
 * décimales » mène aux objectifs qui les nomment, et de là à leurs exercices. Un objectif encore
 * sans exercice s'ouvre aussi : c'est là qu'on propose le sien.
 */
export function ObjectiveHits({
  objectives,
  q,
  onOpen,
}: {
  objectives: CatalogObjective[];
  q: string;
  onOpen: (objective: CatalogObjective) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  if (objectives.length === 0) return null;
  return (
    <section className="border rounded p-12 mb-16" data-testid="catalog-objectives">
      <p className="small text-muted mb-8">{t('exercizer.catalog.objectives.title', { q })}</p>
      <ul className="list-unstyled m-0 d-flex flex-column gap-8">
        {objectives.map((objective) => (
          <li key={objective.id} className="d-flex flex-wrap align-items-center gap-8">
            <button
              type="button"
              // Sans la classe `btn`, dont certains thèmes changent la police et la casse.
              className="p-0 border-0 bg-transparent text-start text-primary text-decoration-underline"
              title={objective.programme_title}
              onClick={() => onOpen(objective)}
            >
              {objective.code && <strong className="me-8">{objective.code}</strong>}
              {objective.label}
            </button>
            {objective.levels.map((level) => (
              <Badge key={level} variant={{ type: 'content', level: 'info', background: true }}>
                {level}
              </Badge>
            ))}
            <span className="small text-muted">
              {objective.count > 0
                ? t('exercizer.catalog.objectives.count', { count: objective.count })
                : t('exercizer.catalog.objectives.none')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Au-delà, le parcours serait illisible pour l'élève ; c'est aussi la page maximale du serveur. */
const SEQUENCE_MAX = 100;

/**
 * « Créer un parcours avec ces exercices » : les exercices d'un nœud de l'arbre, cochés d'office,
 * sont copiés dans « Mes sujets » — dans un dossier au nom du parcours — puis réunis dans un
 * parcours neuf, dans l'ordre du catalogue. Les sujets du catalogue ne sont jamais distribués en
 * place : le parcours porte les copies, que l'enseignant peut adapter. L'éditeur du parcours
 * s'ouvre ensuite pour réordonner et distribuer.
 */
export function CreateSequenceDialog({
  node,
  search,
  onClose,
}: {
  node: { code?: string | null; name: string };
  /** Les critères de la liste sous le nœud : ce que l'enseignant voit, il le retrouve. */
  search: CatalogSearch;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(() => (node.code ? `${node.code} ${node.name}` : node.name).slice(0, 255));
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['exercizer', 'catalog', 'sequence-from-node', search],
    queryFn: () => searchCatalog({ ...search, limit: SEQUENCE_MAX, offset: 0 }),
  });
  const subjects = list.data?.subjects ?? [];
  const chosen = subjects.filter((subject) => !excluded.has(subject.id));

  // Un nouveau nœud est une nouvelle sélection.
  useEffect(() => setExcluded(new Set()), [list.data]);

  const create = useMutation({
    mutationFn: async () => {
      const label = title.trim();
      const folder = await createFolder({ label, parent_folder_id: null });
      const copies: number[] = [];
      setProgress({ done: 0, total: chosen.length });
      // L'un après l'autre : l'ordre des copies est celui du parcours, et le serveur n'est pas inondé.
      for (const subject of chosen) {
        const copy = await copyCatalogSubject(subject.id, folder.id);
        copies.push(copy.id);
        setProgress({ done: copies.length, total: chosen.length });
      }
      const sequence = await createSubjectSequence({ title: label, description: node.name });
      for (const [index, subjectId] of copies.entries()) {
        await addSubjectSequenceItem(sequence.id, subjectId, index + 1);
      }
      return sequence;
    },
    onSuccess: (sequence) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'folders'] });
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'sequences'] });
      navigate(`/subject-sequence/edit/${sequence.id}/`);
    },
    onError: () => {
      setProgress(null);
      setError(t('exercizer.catalog.sequence.error'));
    },
  });

  const toggle = (subjectId: number) =>
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>{t('exercizer.catalog.sequence.title')}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}
        <p className="text-muted mb-16">{t('exercizer.catalog.sequence.help')}</p>
        <FormControl id={`${id}-title`} className="mb-16" isRequired>
          <Label>{t('exercizer.catalog.sequence.name')}</Label>
          <Input
            type="text"
            size="md"
            maxLength={255}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FormControl>
        {list.isError ? (
          <Alert type="danger">{t('exercizer.error')}</Alert>
        ) : list.isPending ? (
          <LoadingScreen position={false} />
        ) : (
          <fieldset data-testid="sequence-subjects">
            {/* `float-none` : cf. ClassificationPicker. */}
            <legend className="h5 mb-8 float-none">
              {t('exercizer.catalog.sequence.subjects', { count: chosen.length })}
            </legend>
            {(list.data?.total ?? 0) > SEQUENCE_MAX && (
              <p className="small text-muted">{t('exercizer.catalog.sequence.max', { count: SEQUENCE_MAX })}</p>
            )}
            <ul className="list-unstyled m-0 d-flex flex-column gap-4">
              {subjects.map((subject) => (
                <li key={subject.id}>
                  <Checkbox
                    checked={!excluded.has(subject.id)}
                    onChange={() => toggle(subject.id)}
                    label={subject.title}
                  />
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </Modal.Body>
      <Modal.Footer>
        {progress && (
          <span className="me-auto small" aria-live="polite">
            {t('exercizer.catalog.sequence.progress', { done: progress.done, total: progress.total })}
          </span>
        )}
        <Button color="tertiary" variant="ghost" onClick={onClose} disabled={create.isPending}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          isLoading={create.isPending}
          disabled={chosen.length === 0}
          onClick={() => {
            if (!title.trim()) return setError(t('exercizer.check.title'));
            setError(null);
            create.mutate();
          }}
        >
          {t('exercizer.catalog.sequence.action')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
