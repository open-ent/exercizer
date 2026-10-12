import { Alert, Button, FormControl, Heading, Input, SearchBar } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  createGrain,
  ExternalResource,
  externalResourceUrl,
  getExternalResources,
  getGrains,
  getSubjects,
  importExternalResource,
  removeExternalResource,
  renameExternalResource,
} from '../api';
import { byOrder, grainDisplayName, isUndecided } from '../grains';
import { Grain, GrainType, Subject } from '../types';

/**
 * Ressources externes d'un sujet — portage de la directive `subjectExternalResources`.
 *
 * L'enseignant donne l'adresse d'un document (PDF, image…) et un titre ; c'est le SERVEUR qui le
 * télécharge et le range dans le stockage de l'ENT. Le document reste ainsi disponible même si
 * l'adresse d'origine disparaît, et les élèves n'ont pas à sortir de la plateforme.
 */
export function ExternalResources({ subjectId }: { subjectId: number }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [renaming, setRenaming] = useState<{ id: ExternalResource['id']; title: string } | null>(
    null,
  );
  const [message, setMessage] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);

  const key = ['exercizer', 'external-resources', subjectId];
  const query = useQuery({ queryKey: key, queryFn: () => getExternalResources(subjectId) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: () => importExternalResource(subjectId, url.trim(), title.trim()),
    onSuccess: () => {
      setUrl('');
      setTitle('');
      setMessage({ type: 'success', text: t('exercizer.external.resource.imported') });
      void refresh();
    },
    onError: () =>
      setMessage({ type: 'danger', text: t('exercizer.external.resource.import.failed') }),
  });
  const rename = useMutation({
    mutationFn: (target: { id: ExternalResource['id']; title: string }) =>
      renameExternalResource(subjectId, target.id, target.title.trim()),
    onSuccess: () => {
      setRenaming(null);
      void refresh();
    },
    onError: () =>
      setMessage({ type: 'danger', text: t('exercizer.external.resource.rename.failed') }),
  });
  const remove = useMutation({
    mutationFn: (resourceId: ExternalResource['id']) => removeExternalResource(subjectId, resourceId),
    onSuccess: () => void refresh(),
    onError: () =>
      setMessage({ type: 'danger', text: t('exercizer.external.resource.remove.failed') }),
  });

  const resources = query.data ?? [];

  return (
    <section className="card p-16 mb-24">
      <Heading level="h3" headingStyle="h5" className="mb-8">
        {t('exercizer.external.resource.title')}
      </Heading>
      {message && (
        <Alert type={message.type} isDismissible onClose={() => setMessage(null)} className="mb-8">
          {message.text}
        </Alert>
      )}

      {resources.length === 0 ? (
        <p className="text-muted small">{t('exercizer.external.resource.emptyscreen')}</p>
      ) : (
        <ul className="list-unstyled d-flex flex-column gap-8">
          {resources.map((resource) => (
            <li key={resource.id} className="d-flex flex-wrap align-items-center gap-8">
              {renaming?.id === resource.id ? (
                <>
                  <FormControl id={`${id}-rename-${resource.id}`} className="flex-fill">
                    <Input
                      type="text"
                      size="sm"
                      aria-label={t('exercizer.external.resource.title.placeholder')}
                      value={renaming.title}
                      onChange={(event) => setRenaming({ ...renaming, title: event.target.value })}
                    />
                  </FormControl>
                  <Button
                    size="sm"
                    color="primary"
                    variant="outline"
                    disabled={!renaming.title.trim()}
                    onClick={() => rename.mutate(renaming)}
                  >
                    {t('exercizer.validate')}
                  </Button>
                  <Button size="sm" color="tertiary" variant="ghost" onClick={() => setRenaming(null)}>
                    {t('exercizer.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <a
                    className="flex-fill"
                    href={externalResourceUrl(subjectId, resource.id)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {resource.title}
                  </a>
                  <Button
                    size="sm"
                    color="tertiary"
                    variant="ghost"
                    onClick={() => setRenaming({ id: resource.id, title: resource.title })}
                  >
                    {t('exercizer.external.resource.rename')}
                  </Button>
                  <Button
                    size="sm"
                    color="danger"
                    variant="ghost"
                    onClick={() => remove.mutate(resource.id)}
                  >
                    {t('exercizer.external.resource.remove')}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="d-flex flex-wrap align-items-end gap-8">
        <FormControl id={`${id}-url`} className="flex-fill">
          <Input
            type="url"
            size="md"
            aria-label={t('exercizer.external.resource.url.placeholder')}
            placeholder={t('exercizer.external.resource.url.placeholder')}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </FormControl>
        <FormControl id={`${id}-title`}>
          <Input
            type="text"
            size="md"
            aria-label={t('exercizer.external.resource.title.placeholder')}
            placeholder={t('exercizer.external.resource.title.placeholder')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FormControl>
        <Button
          color="primary"
          variant="outline"
          disabled={!url.trim() || !title.trim()}
          isLoading={add.isPending}
          onClick={() => add.mutate()}
        >
          {t('exercizer.external.resource.import')}
        </Button>
      </div>
    </section>
  );
}

/**
 * « Réutiliser des questions » — portage de `subjectEditSubjectList`.
 *
 * On cherche un autre de ses sujets, et l'on en recopie les questions une à une dans celui qu'on
 * édite. L'ancienne IHM les faisait glisser dans la page ; un bouton « Ajouter » fait la même
 * copie, au clavier comme à la souris.
 */
export function ReuseGrains({
  subject,
  grainTypes,
  nextOrder,
  onAdded,
}: {
  subject: Subject;
  grainTypes: GrainType[];
  /** Le rang à donner à la prochaine question ajoutée. */
  nextOrder: () => number;
  onAdded: (grain: Grain) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<Subject | null>(null);

  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });
  const matches = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return [];
    return (subjectsQuery.data ?? [])
      .filter((item) => item.id !== subject.id && item.type !== 'simple')
      .filter((item) => (item.title ?? '').toLowerCase().includes(text))
      .slice(0, 8);
  }, [search, subjectsQuery.data, subject.id]);

  const grainsQuery = useQuery({
    queryKey: ['exercizer', 'grains', source?.id],
    queryFn: () => getGrains(source as Subject),
    enabled: !!source,
  });
  const grains = byOrder(grainsQuery.data ?? []).filter(
    (grain) => !isUndecided(grain.grain_type_id),
  );

  const copy = useMutation({
    mutationFn: async (grain: Grain) => {
      const next = {
        subject_id: subject.id,
        grain_type_id: grain.grain_type_id,
        order_by: nextOrder(),
        grain_data: grain.grain_data,
      };
      const created = await createGrain(next);
      return { ...next, id: created.id } as Grain;
    },
    onSuccess: onAdded,
  });

  const publicName = (grain: Grain) =>
    t(grainTypes.find((type) => type.id === grain.grain_type_id)?.public_name ?? '');

  return (
    <section className="card p-16 mt-16">
      <Heading level="h3" headingStyle="h5" className="mb-4">
        {t('exercizer.subject.search')}
      </Heading>
      <p className="text-muted small">{t('exercizer.subject.search.info')}</p>
      <SearchBar
        isVariant
        size="md"
        clearable
        placeholder={t('exercizer.subject.search.placeholder')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {matches.length > 0 && (
        <ul className="list-unstyled d-flex flex-column gap-4 mt-8 mb-0">
          {matches.map((item) => (
            <li key={item.id}>
              <Button
                size="sm"
                color="tertiary"
                variant="ghost"
                onClick={() => {
                  setSource(item);
                  setSearch('');
                }}
              >
                {item.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {source && (
        <div className="mt-16">
          <p className="fw-bold mb-8">{source.title}</p>
          <ul className="list-unstyled d-flex flex-column gap-4 mb-0">
            {grains.map((grain) => (
              <li key={grain.id} className="d-flex align-items-center gap-8">
                <span className="flex-fill text-truncate">
                  {grainDisplayName(grain, publicName(grain))}
                </span>
                <Button
                  size="sm"
                  color="primary"
                  variant="outline"
                  disabled={copy.isPending}
                  onClick={() => copy.mutate(grain)}
                >
                  {t('add')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
