import {
  Alert,
  Button,
  FormControl,
  Heading,
  Input,
  Label,
  LoadingScreen,
  MediaLibrary,
  useEdificeClient,
  useMediaLibrary,
} from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  addSubjectDoc,
  createSubject,
  getSubjects,
  listSubjectFiles,
  removeSubjectFile,
  updateSubject,
} from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { RichTextEditor } from '../features/RichTextEditor';
import { useDebouncedSave } from '../hooks/useDebouncedSave';
import { Subject, SubjectDocument } from '../types';

/** Le serveur n'accepte pas plus de cinq corrigés par sujet. */
const MAX_FILES = 5;

/**
 * Éditeur d'un sujet « simple » — portage de `EditSimpleSubjectController`.
 *
 * Un sujet simple n'a pas de grains : un titre, une description, et jusqu'à cinq fichiers de
 * corrigé. L'élève y répond en déposant un fichier, et l'enseignant corrige à la main.
 *
 * Deux routes y mènent : `/subject/create/simple/:folderId?` (le sujet est créé à l'ouverture,
 * comme dans l'ancienne IHM — sans identifiant, il n'y aurait nulle part où attacher un fichier)
 * et `/subject/edit/simple/:subjectId/`.
 */
export function SimpleSubjectEditor({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams();
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appCode } = useEdificeClient();
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();

  const [subjectId, setSubjectId] = useState<number | null>(
    mode === 'edit' ? Number(params.subjectId) : null,
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [toRemove, setToRemove] = useState<SubjectDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });
  const subject = (subjectsQuery.data ?? []).find((item) => item.id === subjectId);

  const filesQuery = useQuery({
    queryKey: ['exercizer', 'subject-files', subjectId],
    queryFn: () => listSubjectFiles(subjectId!),
    enabled: subjectId !== null,
  });

  /**
   * Création à l'ouverture, en mode `create`. Le sujet naît SANS titre : c'est le serveur qui
   * donnera son identifiant, et le titre par défaut n'est posé qu'à l'enregistrement — sans quoi
   * « Devoir sans titre » apparaîtrait dans le champ et il faudrait l'effacer pour écrire.
   */
  const create = useMutation({
    mutationFn: () =>
      createSubject({
        title: '',
        type: 'simple',
        folder_id: params.folderId ? Number(params.folderId) : null,
      }),
    onSuccess: (created) => {
      setSubjectId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
      // L'URL suit : un rechargement de page doit retrouver le sujet, et non en créer un second.
      navigate(`/subject/edit/simple/${created.id}/`, { replace: true });
    },
    onError: () => setError(t('exercizer.error')),
  });

  const started = useState(() => ({ done: false }))[0];
  useEffect(() => {
    if (mode !== 'create' || started.done) return;
    started.done = true;
    create.mutate();
    // `create` est stable (useMutation) ; le drapeau garantit l'unicité du premier appel, que le
    // double rendu de StrictMode déclencherait deux fois sinon — et créerait deux sujets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Les champs suivent le sujet dès qu'il est connu, et une seule fois : les resynchroniser à
  // chaque réponse du serveur écraserait la frappe en cours.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!subject || hydrated) return;
    setTitle(subject.title ?? '');
    setDescription(subject.description ?? '');
    setHydrated(true);
  }, [subject, hydrated]);

  const saveSubject = async (next: { title: string; description: string }) => {
    if (!subject) return;
    await updateSubject({
      ...subject,
      // Un sujet sans titre est illisible dans la liste du tableau de bord : le titre par défaut
      // est posé à l'enregistrement, comme le faisait `saveSubjectProperties`.
      title: next.title.trim() || t('exercizer.simple.default.title'),
      description: next.description,
    });
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
  };

  const { schedule, flush, pending } = useDebouncedSave(saveSubject);
  const scheduleSave = (patch: { title?: string; description?: string }) => {
    const next = { title: patch.title ?? title, description: patch.description ?? description };
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.description !== undefined) setDescription(patch.description);
    if (subjectId !== null) schedule(subjectId, next);
  };

  const attach = useMutation({
    mutationFn: async (files: Array<{ _id: string; metadata?: unknown }>) => {
      for (const file of files.slice(0, MAX_FILES - (filesQuery.data?.length ?? 0))) {
        await addSubjectDoc(subjectId!, file);
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exercizer', 'subject-files', subjectId] }),
    onError: () => setError(t('exercizer.error')),
  });

  const detach = useMutation({
    mutationFn: (file: SubjectDocument) => removeSubjectFile(subjectId!, file.doc_id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subject-files', subjectId] });
      setToRemove(null);
    },
    onError: () => setError(t('exercizer.error')),
  });

  const leave = async () => {
    await flush();
    navigate('/dashboard/teacher');
  };

  if (subjectsQuery.isLoading || subjectId === null) return <LoadingScreen position={false} />;
  if (!subject) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24">
        <img src={illuExercizer} alt="" height={160} />
        <p>{t('exercizer.empty.subjects')}</p>
      </div>
    );
  }

  const files = filesQuery.data ?? [];

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {title || t('exercizer.simple.default.title')}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          <span className="align-self-center text-muted" role="status">
            {pending ? t('exercizer.subject.navigation.saving') : t('exercizer.subject.saved')}
          </span>
          <Button color="primary" variant="outline" onClick={leave}>
            {t('exercizer.update.quit')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
          {error}
        </Alert>
      )}

      <FormControl id="simple-subject-title" className="mb-16">
        <Label>{t('exercizer.subject.title')}</Label>
        <Input
          type="text"
          size="md"
          maxLength={200}
          placeholder={t('exercizer.simple.default.placeholder')}
          value={title}
          onChange={(event) => scheduleSave({ title: event.target.value })}
        />
      </FormControl>

      <FormControl id="simple-subject-description" className="mb-24">
        <Label>{t('exercizer.simple.edit.description')}</Label>
        <RichTextEditor
          content={description}
          placeholder={t('exercizer.subject.desc')}
          onChange={(html) => scheduleSave({ description: html })}
        />
      </FormControl>

      <section>
        <Heading level="h3" headingStyle="h4" className="mb-8">
          {t('exercizer.corrected.homework')}{' '}
          <small className="text-muted">({t('exercizer.simple.corrected.optional')})</small>
        </Heading>
        <Alert type="info" className="mb-16">
          {t('exercizer.file.limit5')}
        </Alert>

        <ul className="list-unstyled d-flex flex-column gap-8">
          {files.map((file) => (
            <li key={file.doc_id} className="d-flex align-items-center gap-8">
              <a
                href={`/workspace/document/${file.doc_id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-fill"
              >
                {file.metadata?.filename ?? file.metadata?.name ?? file.doc_id}
              </a>
              <Button color="danger" variant="ghost" onClick={() => setToRemove(file)}>
                {t('exercizer.scheduled.corrected.delete')}
              </Button>
            </li>
          ))}
        </ul>

        {files.length < MAX_FILES && (
          <Button
            className="mt-16"
            color="primary"
            variant="outline"
            onClick={() => mediaLibraryRef.current?.show('attachment')}
          >
            {t('exercizer.file.choose')}
          </Button>
        )}
      </section>

      <MediaLibrary
        appCode={appCode}
        ref={mediaLibraryRef}
        multiple
        visibility="protected"
        {...mediaLibraryHandlers}
        onSuccess={(result) => {
          const picked = Array.isArray(result) ? result : [result];
          attach.mutate(picked as Array<{ _id: string; metadata?: unknown }>);
          mediaLibraryHandlers.onSuccess(result);
        }}
      />

      {toRemove && (
        <ConfirmModal
          title={t('exercizer.scheduled.corrected.delete')}
          confirmLabel={t('exercizer.remove')}
          onClose={() => setToRemove(null)}
          onConfirm={() => detach.mutate(toRemove)}
        >
          <p>{toRemove.metadata?.filename ?? toRemove.doc_id}</p>
        </ConfirmModal>
      )}
    </div>
  );
}

export default SimpleSubjectEditor;
