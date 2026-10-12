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
  useHasWorkflow,
  useMediaLibrary,
} from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { createSubject, generateSubject, updateSubject } from '../api';
import { WORKFLOW } from '../rights';
import { Subject } from '../types';
import { Unauthorized } from '../components/Unauthorized';

/** Le document choisi dans l'espace documentaire : seule une image est acceptée. */
interface PickedFile {
  _id: string;
  name?: string;
  metadata?: { filename?: string; 'content-type'?: string };
}

/** Ce que le service de génération répond, traduit en message — `SubjectService#generate`. */
const GENERATION_ERRORS: Record<string, string> = {
  '400': 'exercizer.error.invalid.image',
  '401': 'exercizer.error.auth.token',
  '403': 'exercizer.error.permission',
  '404': 'exercizer.error.resource.notfound',
  '407': 'exercizer.error.invalid.token.format',
  '415': 'exercizer.error.unsupported.generation',
  '429': 'exercizer.error.too.many.requests',
  '501': 'exercizer.error.unsupported.format',
};

export function generationErrorKey(status: string | undefined): string {
  return (status && GENERATION_ERRORS[status]) || 'exercizer.error';
}

/** Seules les photos et captures (JPEG, PNG) sont lisibles par le convertisseur. */
export function isAcceptedImage(file: PickedFile | null): boolean {
  const type = file?.metadata?.['content-type']?.toLowerCase() ?? '';
  return type.startsWith('image/jpeg') || type.startsWith('image/jpg') || type.startsWith('image/png');
}

/**
 * « Création assistée » — portage du gabarit `generate-subject` et de la branche `generate`
 * d'`EditSimpleSubjectController`.
 *
 * L'enseignant donne la photo d'un énoncé ; un service de la plateforme en tire les questions
 * d'un sujet interactif. Le sujet est créé VIDE à l'ouverture de l'écran — c'est lui que le
 * service remplit — puis la génération tourne côté serveur : elle aboutit même si l'on quitte la
 * page, d'où le bouton pour repartir sans attendre.
 */
export function GenerateSubject() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { appCode } = useEdificeClient();
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();
  const canGenerate = useHasWorkflow(WORKFLOW.generate) as boolean | undefined;

  const [subject, setSubject] = useState<Subject | null>(null);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => createSubject({ title: '', type: 'interactive', folder_id: null }),
    onSuccess: setSubject,
    onError: () => setError(t('exercizer.error')),
  });

  const started = useState(() => ({ done: false }))[0];
  useEffect(() => {
    if (!canGenerate || started.done) return;
    started.done = true;
    create.mutate();
    // Le drapeau garantit qu'un seul sujet est créé, même sous le double rendu de StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canGenerate]);

  const generate = useMutation({
    mutationFn: async () => {
      const current = subject as Subject;
      // Le titre saisi est enregistré d'abord : le service complète le sujet, il ne le nomme pas.
      if (title.trim()) await updateSubject({ ...current, title: title.trim() });
      await generateSubject(current.id, (file as PickedFile)._id);
      return current;
    },
    onSuccess: (current) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
      navigate(`/subject/edit/${current.id}/`);
    },
    onError: (cause) =>
      setError(t(generationErrorKey(cause instanceof Error ? cause.message : undefined))),
  });

  if (canGenerate === false) return <Unauthorized text={t('exercizer.unauthorized')} />;

  const leave = () => {
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
    navigate('/dashboard/teacher');
  };

  if (generate.isPending) {
    return (
      <div className="d-flex flex-column align-items-center gap-16 mt-24 text-center" role="status">
        <LoadingScreen position={false} />
        <Heading level="h2" headingStyle="h4">
          {t('exercizer.genrete.loader')}
        </Heading>
        <p className="text-muted mb-0">{t('exercizer.genrete.timer')}</p>
        <p className="mb-0">{t('exercizer.genrete.out.page')}</p>
        <Button color="tertiary" variant="ghost" onClick={leave}>
          {t('exercizer.generate.out.button')}
        </Button>
      </div>
    );
  }

  if (!subject && !error) return <LoadingScreen position={false} />;

  const launch = () => {
    if (!file?._id) return setError(t('exercizer.simple.error.file.empty'));
    if (!isAcceptedImage(file)) return setError(t('exercizer.simple.error.file.type'));
    setError(null);
    generate.mutate();
  };

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {title || t('exercizer.generate')}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          <Button color="tertiary" variant="ghost" onClick={leave}>
            {t('exercizer.update.quit')}
          </Button>
          <Button color="primary" variant="filled" disabled={!subject} onClick={launch}>
            {t('exercizer.generate')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
          {error}
        </Alert>
      )}

      <FormControl id="generate-title" className="mb-24">
        <Label>{t('exercizer.subject.title')}</Label>
        <Input
          type="text"
          size="md"
          maxLength={200}
          value={title}
          placeholder={t('exercizer.simple.default.placeholder')}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FormControl>

      <section className="card p-16">
        <Heading level="h3" headingStyle="h5" className="mb-16">
          {t('exercizer.generate.file')}
        </Heading>
        {file ? (
          <>
            <Alert type="info" className="mb-16">
              {t('exercizer.file.limit1')}
            </Alert>
            <div className="d-flex align-items-center gap-8">
              <span className="flex-fill text-truncate">
                {file.metadata?.filename ?? file.name ?? file._id}
              </span>
              <Button size="sm" color="danger" variant="ghost" onClick={() => setFile(null)}>
                {t('exercizer.remove')}
              </Button>
            </div>
          </>
        ) : (
          <div className="border rounded p-16 text-center">
            <p className="mb-8 fst-italic">{t('exercizer.drop.help3')}</p>
            <Button
              color="primary"
              variant="outline"
              onClick={() => mediaLibraryRef.current?.show('attachment')}
            >
              {t('library.file.choose')}
            </Button>
          </div>
        )}

        <Alert type="warning" className="mt-16">
          <p className="mb-8">{t('exercizer.generate.alert')}</p>
          <ul className="mb-0">
            <li>{t('exercizer.grain.type.qcm')}</li>
            <li>{t('exercizer.grain.type.simpleanswer')}</li>
            <li>{t('exercizer.grain.type.multipleanswers')}</li>
            <li>{t('exercizer.grain.type.texttofill')}</li>
          </ul>
        </Alert>
      </section>

      <MediaLibrary
        appCode={appCode}
        ref={mediaLibraryRef}
        multiple={false}
        visibility="protected"
        {...mediaLibraryHandlers}
        onSuccess={(result) => {
          const picked = (Array.isArray(result) ? result[0] : result) as PickedFile | undefined;
          if (picked?._id) setFile(picked);
          mediaLibraryHandlers.onSuccess(result);
        }}
      />
    </div>
  );
}

export default GenerateSubject;
