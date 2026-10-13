import { Alert, Button, FormControl, Input, Label, LoadingScreen, Modal } from '@open-ent/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getCatalogReferential, getClassification, publishToCatalog, setClassification } from '../api';
import { isPublishable } from '../catalog';
import { ClassificationPicker } from '../features/ClassificationPicker';
import { Classification, Subject } from '../types';

const EMPTY: Classification = { level_ids: [], discipline_ids: [] };

/** Le référentiel des niveaux et matières : il ne change qu'avec une migration, on le garde. */
export const useCatalogReferential = () =>
  useQuery({
    queryKey: ['exercizer', 'catalog', 'referential'],
    queryFn: getCatalogReferential,
    staleTime: Infinity,
  });

/** Le classement d'un de mes sujets, et l'état de saisie qu'il amorce. */
function useClassificationDraft(subjectId: number) {
  const query = useQuery({
    queryKey: ['exercizer', 'classification', subjectId],
    queryFn: () => getClassification(subjectId),
  });
  const [draft, setDraft] = useState<Classification>(EMPTY);
  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);
  return { query, draft, setDraft };
}

/**
 * « Niveaux et matières » d'un de mes sujets. Le classement suit le sujet quand on le duplique ou
 * qu'on le publie au catalogue.
 */
export function ClassificationDialog({
  subject,
  onClose,
  onSaved,
}: {
  subject: Subject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const referential = useCatalogReferential();
  const { query, draft, setDraft } = useClassificationDraft(subject.id);

  const save = useMutation({
    mutationFn: () => setClassification(subject.id, draft),
    onSuccess: onSaved,
  });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>
        {t('exercizer.catalog.classify.title')} - {subject.title}
      </Modal.Header>
      <Modal.Body>
        {save.isError && (
          <Alert type="danger" className="mb-16">
            {t('exercizer.error')}
          </Alert>
        )}
        <p className="text-muted mb-16">{t('exercizer.catalog.classify.help')}</p>
        {referential.data && query.isSuccess ? (
          <ClassificationPicker referential={referential.data} value={draft} onChange={setDraft} />
        ) : referential.isError || query.isError ? (
          <Alert type="danger">{t('exercizer.error')}</Alert>
        ) : (
          <LoadingScreen position={false} />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          isLoading={save.isPending}
          disabled={!query.isSuccess}
          onClick={() => save.mutate()}
        >
          {t('exercizer.update')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/**
 * « Publier au catalogue » : une COPIE du sujet part dans le catalogue partagé entre tous les
 * établissements. Le sujet d'origine reste à son auteur, qui peut le modifier sans toucher à la
 * copie publiée. Le classement est obligatoire : sans niveau ni matière, le sujet serait
 * introuvable. Il est pré-rempli avec celui du sujet, et enregistré sur le sujet aussi.
 */
export function PublishToCatalogDialog({
  subject,
  onClose,
  onPublished,
}: {
  subject: Subject;
  onClose: () => void;
  onPublished: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const referential = useCatalogReferential();
  const { query, draft, setDraft } = useClassificationDraft(subject.id);
  const [authors, setAuthors] = useState(subject.owner_username ?? '');
  const [error, setError] = useState<string | null>(null);

  const publish = useMutation({
    mutationFn: async () => {
      await setClassification(subject.id, draft);
      return publishToCatalog(subject.id, { ...draft, authors: authors.trim() });
    },
    onSuccess: onPublished,
    onError: () => setError(t('exercizer.error')),
  });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>{t('exercizer.catalog.publish.title')}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}
        <Alert type="info" className="mb-16">
          {t('exercizer.catalog.publish.help')}
        </Alert>
        <FormControl id={`${id}-authors`} className="mb-16">
          <Label>{t('exercizer.catalog.publish.authors')}</Label>
          <Input
            type="text"
            size="md"
            value={authors}
            maxLength={255}
            onChange={(event) => setAuthors(event.target.value)}
          />
        </FormControl>
        {referential.data && query.isSuccess ? (
          <ClassificationPicker
            referential={referential.data}
            value={draft}
            onChange={(next) => {
              setDraft(next);
              setError(null);
            }}
          />
        ) : referential.isError || query.isError ? (
          <Alert type="danger">{t('exercizer.error')}</Alert>
        ) : (
          <LoadingScreen position={false} />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          isLoading={publish.isPending}
          disabled={!query.isSuccess}
          onClick={() => {
            if (!isPublishable(draft)) return setError(t('exercizer.catalog.publish.classification.required'));
            setError(null);
            publish.mutate();
          }}
        >
          {t('exercizer.catalog.publish.action')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
