import {
  Alert,
  Button,
  Card,
  Checkbox,
  FormControl,
  Heading,
  Input,
  Label,
  MediaLibrary,
  Modal,
  Radio,
  TextArea,
  useEdificeClient,
  useEdificeTheme,
  useHasWorkflow,
  useMediaLibrary,
} from '@open-ent/react';
import { ShareModal, ShareOptions } from '@open-ent/react/modals';
import { useMutation } from '@tanstack/react-query';
import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  createSubject,
  exportMoodleUrl,
  importSubject,
  updateSubject,
  uploadWorkspaceImage,
} from '../api';
import { allImages, applyImageLinks, MoodleXmlError, parseMoodleXml } from '../moodleImport';
import { WORKFLOW } from '../rights';
import { Subject } from '../types';

/** Ce que rend la médiathèque varie selon le type demandé : un lien, un document, ou une liste. */
function pictureUrl(result: unknown): string | null {
  const picked = Array.isArray(result) ? result[0] : result;
  if (!picked) return null;
  if (typeof picked === 'string') return picked;
  const doc = picked as { _id?: string; src?: string };
  if (doc.src) return doc.src;
  return doc._id ? `/workspace/document/${doc._id}` : null;
}

/** Les trois champs d'un sujet : image de couverture, titre, description. */
interface SubjectFieldValues {
  title: string;
  description: string;
  picture: string;
  /** Passation en grand format pour les jeunes élèves (sql/043). */
  large_display: boolean;
}

function SubjectFields({
  value,
  onChange,
}: {
  value: SubjectFieldValues;
  onChange: (next: SubjectFieldValues) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const { appCode } = useEdificeClient();
  const { ref: mediaLibraryRef, ...mediaLibraryHandlers } = useMediaLibrary();

  return (
    <div className="grid gap-16">
      <div className="g-col-12 g-col-md-4 d-flex flex-column align-items-center gap-8">
        <img
          src={value.picture || illuExercizer}
          alt=""
          className="rounded"
          style={{ width: 140, height: 140, objectFit: 'cover' }}
        />
        <Button
          size="sm"
          color="primary"
          variant="outline"
          onClick={() => mediaLibraryRef.current?.show('image')}
        >
          {t('exercizer.subject.picture.choose')}
        </Button>
        {value.picture && (
          <Button
            size="sm"
            color="tertiary"
            variant="ghost"
            onClick={() => onChange({ ...value, picture: '' })}
          >
            {t('exercizer.subject.picture.remove')}
          </Button>
        )}
      </div>
      <div className="g-col-12 g-col-md-8">
        <FormControl id={`${id}-title`} className="mb-16" isRequired>
          <Label>{t('exercizer.subject.title')}</Label>
          <Input
            type="text"
            size="md"
            maxLength={200}
            value={value.title}
            onChange={(event) => onChange({ ...value, title: event.target.value })}
          />
        </FormControl>
        <FormControl id={`${id}-description`}>
          <Label>{t('exercizer.subject.desc')}</Label>
          <TextArea
            size="md"
            value={value.description}
            onChange={(event) => onChange({ ...value, description: event.target.value })}
          />
        </FormControl>
        <div className="mt-16">
          <Checkbox
            label={t('exercizer.subject.large.display')}
            checked={value.large_display}
            onChange={(event) => onChange({ ...value, large_display: event.target.checked })}
          />
          <small className="d-block text-gray-700 mt-4">
            {t('exercizer.subject.large.display.help')}
          </small>
        </div>
      </div>

      <MediaLibrary
        appCode={appCode}
        ref={mediaLibraryRef}
        multiple={false}
        visibility="protected"
        {...mediaLibraryHandlers}
        onSuccess={(result) => {
          const url = pictureUrl(result);
          if (url) onChange({ ...value, picture: url });
          mediaLibraryHandlers.onSuccess(result);
        }}
      />
    </div>
  );
}

/**
 * « Nouveau sujet » — portage de `teacherDashboardSubjectEdit`.
 *
 * Deux temps, comme dans l'ancienne fenêtre : le type de sujet, puis ses propriétés. Les « sujets
 * à rendre » ne se créent plus ici : la plateforme les a déplacés dans l'application Casier, et
 * la carte y mène. Les sujets simples existants restent consultables et distribuables.
 */
export function NewSubjectDialog({
  folderId,
  onClose,
  onCreated,
  onGenerate,
  onDigitize,
}: {
  folderId: number | null;
  onClose: () => void;
  onCreated: (subject: Subject) => void;
  onGenerate: () => void;
  onDigitize: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const canGenerate = useHasWorkflow(WORKFLOW.generate) as boolean | undefined;
  // La numérisation crée le sujet par l'import : elle en demande le droit.
  const canDigitize = useHasWorkflow(WORKFLOW.import) as boolean | undefined;
  const { theme } = useEdificeTheme();
  const [step, setStep] = useState<'choose' | 'subject'>('choose');
  // Un enseignant du premier degré écrit d'abord pour de jeunes élèves : le grand format est
  // proposé d'office, il le décoche pour un sujet destiné aux plus grands.
  const [fields, setFields] = useState<SubjectFieldValues>({
    title: '',
    description: '',
    picture: '',
    large_display: !!theme?.is1d,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createSubject({
        title: fields.title.trim(),
        description: fields.description,
        picture: fields.picture || undefined,
        large_display: fields.large_display,
        folder_id: folderId,
      }),
    onSuccess: onCreated,
    onError: () => setError(t('exercizer.error')),
  });

  const choices = [
    {
      key: 'simple',
      title: t('exercizer.choose.simple.title'),
      info: t('exercizer.choose.simple.info'),
      action: t('exercizer.choose.simple.button'),
      onClick: () => {
        window.location.href = '/rack';
      },
    },
    ...(canGenerate
      ? [
          {
            key: 'generate',
            title: t('exercizer.choose.assist.title'),
            info: t('exercizer.choose.assist.info'),
            action: t('exercizer.create'),
            onClick: onGenerate,
          },
        ]
      : []),
    ...(canDigitize
      ? [
          {
            key: 'digitize',
            title: t('exercizer.choose.digitize.title'),
            info: t('exercizer.choose.digitize.info'),
            action: t('exercizer.choose.digitize.button'),
            onClick: onDigitize,
          },
        ]
      : []),
    {
      key: 'interactive',
      title: t('exercizer.choose.interactive.title'),
      info: t('exercizer.choose.interactive.info'),
      action: t('exercizer.create'),
      onClick: () => setStep('subject'),
    },
  ];

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg">
      <Modal.Header onModalClose={onClose}>
        {step === 'choose'
          ? t('exercizer.choose')
          : `${t('exercizer.create')} - ${t('exercizer.interactive.subject')}`}
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}
        {step === 'choose' ? (
          <div className="grid gap-16">
            {choices.map((choice) => (
              <Card
                key={choice.key}
                className={`g-col-12 ${choices.length === 3 ? 'g-col-md-4' : 'g-col-md-6'}`}
                isSelectable={false}
                isClickable={false}
              >
                <Card.Body>
                  <div className="d-flex flex-column gap-8">
                    <Heading level="h3" headingStyle="h5">
                      {choice.title}
                    </Heading>
                    <p className="mb-0">{choice.info}</p>
                    <div>
                      <Button color="primary" variant="outline" onClick={choice.onClick}>
                        {choice.action}
                      </Button>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            ))}
          </div>
        ) : (
          <SubjectFields value={fields} onChange={setFields} />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        {step === 'subject' && (
          <Button
            color="primary"
            variant="filled"
            isLoading={create.isPending}
            onClick={() => {
              if (!fields.title.trim()) return setError(t('exercizer.check.title'));
              setError(null);
              create.mutate();
            }}
          >
            {t('exercizer.update')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

/** Propriétés d'un sujet interactif existant : image de couverture, titre, description. */
export function SubjectPropertiesDialog({
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
  const [fields, setFields] = useState<SubjectFieldValues>({
    title: subject.title ?? '',
    description: subject.description ?? '',
    picture: subject.picture ?? '',
    large_display: !!subject.large_display,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateSubject({
        ...subject,
        title: fields.title.trim(),
        description: fields.description,
        picture: fields.picture,
        large_display: fields.large_display,
      }),
    onSuccess: onSaved,
    onError: () => setError(t('exercizer.error')),
  });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg">
      <Modal.Header onModalClose={onClose}>
        {t('exercizer.edit')} - {t('exercizer.interactive.subject')}
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}
        <SubjectFields value={fields} onChange={setFields} />
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          isLoading={save.isPending}
          onClick={() => {
            if (!fields.title.trim()) return setError(t('exercizer.check.title'));
            setError(null);
            save.mutate();
          }}
        >
          {t('exercizer.update')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

type ImportStep = 'begin' | 'import' | 'result';

/**
 * Import d'un sujet depuis un fichier Moodle XML — portage de la fenêtre d'import de
 * `teacherDashboardSubjectList`.
 *
 * Trois temps : ce qui s'importe et ce qui ne s'importe pas, le formulaire, puis le bilan. Le
 * fichier est lu ICI, dans le navigateur (`moodleImport.ts`) ; ses images sont déposées une à
 * une dans l'espace documentaire avant que le sujet ne soit créé.
 */
export function ImportSubjectDialog({
  folderId,
  onClose,
  onImported,
  onOpen,
}: {
  folderId: number | null;
  onClose: () => void;
  /** Le sujet est créé : la liste doit se rafraîchir, la fenêtre reste sur son bilan. */
  onImported: () => void;
  onOpen: (subject: Subject) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { theme } = useEdificeTheme();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>('begin');
  const [fields, setFields] = useState<SubjectFieldValues>({
    title: '',
    description: '',
    picture: '',
    large_display: !!theme?.is1d,
  });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    subject: Subject;
    count: string;
    unsupported: string[];
  } | null>(null);

  const run = useMutation({
    mutationFn: async () => {
      const parsed = parseMoodleXml(await file!.text(), (value) =>
        t(`exercizer.import.truefalse.${value}`),
      );
      if (parsed.grains.length === 0) throw new MoodleXmlError('exercizer.import.xml.empty');
      // Une image qui ne se dépose pas ne fait pas échouer l'import : la question arrive sans
      // elle, comme dans l'ancienne IHM.
      await Promise.all(
        allImages(parsed.images).map(async (image) => {
          try {
            image.link = `/workspace/document/${await uploadWorkspaceImage(image.blob, image.name)}`;
          } catch {
            image.link = '';
          }
        }),
      );
      applyImageLinks(parsed.grains, parsed.images);
      const imported = await importSubject(
        {
          title: fields.title.trim(),
          description: fields.description || undefined,
          picture: fields.picture || undefined,
          folder_id: folderId,
        },
        parsed.grains,
      );
      // Le schéma de l'import (`jsonschema/import.json`) n'a pas la clé : la modifier exigerait un
      // redémarrage complet de l'ENT. Le grand format se pose donc ensuite, comme une propriété.
      const subject = fields.large_display
        ? await updateSubject({ ...imported, large_display: true })
        : imported;
      return {
        subject,
        count: `${parsed.grains.length}/${parsed.total}`,
        unsupported: parsed.unsupported,
      };
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('result');
      onImported();
    },
    onError: (cause) =>
      setError(t(cause instanceof MoodleXmlError ? cause.message : 'exercizer.error')),
  });

  const launch = () => {
    if (!fields.title.trim()) return setError(t('exercizer.check.title'));
    if (!file) return setError(t('exercizer.import.check.file'));
    setError(null);
    run.mutate();
  };

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>
        {t('exercizer.title')} - {t('exercizer.import')}
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert type="danger" className="mb-16">
            {error}
          </Alert>
        )}

        {step === 'begin' && (
          <>
            <p>
              <strong>{t('exercizer.import.intro')}</strong>
            </p>
            <p>{t('exercizer.import.feedback')}</p>
            <div className="grid gap-16">
              <div className="g-col-12 g-col-md-6">
                <Heading level="h3" headingStyle="h5">
                  {t('exercizer.import.moodle')}
                </Heading>
                <ul>
                  {/* La nouvelle interface importe aussi le cloze, les marqueurs, la mise en ordre
                      et la calculée simple : ne restent que ces deux-là. L'ancienne IHM garde sa
                      liste (types 1 à 4), elle n'a pas ces conversions. */}
                  <li>{t('exercizer.import.moodle.type1')}</li>
                  <li>{t('exercizer.import.moodle.calculated')}</li>
                </ul>
              </div>
              <div className="g-col-12 g-col-md-6">
                <Heading level="h3" headingStyle="h5">
                  {t('exercizer.import.tdbase')}
                </Heading>
                <ul>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <li key={n}>{t(`exercizer.import.tdbase.type${n}`)}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p>{t('exercizer.import.feedback2')}</p>
            <p className="mb-4">{t('exercizer.import.info')} :</p>
            <ul className="mb-0">
              <li>{t('exercizer.import.info1')}</li>
              <li>{t('exercizer.import.info2')}</li>
              <li>{t('exercizer.import.info.cloze')}</li>
              <li>{t('exercizer.import.info.markers')}</li>
              <li>{t('exercizer.import.info.calculatedsimple')}</li>
            </ul>
          </>
        )}

        {step === 'import' && (
          <>
            <SubjectFields value={fields} onChange={setFields} />
            <div className="d-flex align-items-center gap-8 mt-16">
              <Button color="primary" variant="outline" onClick={() => input.current?.click()}>
                {t('exercizer.import.choose')}
              </Button>
              <span className="text-truncate">{file?.name}</span>
              <input
                ref={input}
                type="file"
                accept=".xml,text/xml,application/xml"
                hidden
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {run.isPending && (
              <p className="mt-16 mb-0" role="status">
                <strong>{t('exercizer.import.loading')}</strong>
              </p>
            )}
          </>
        )}

        {step === 'result' && result && (
          <>
            <p>
              {t('exercizer.import.count')}
              <strong>{result.count}</strong>
            </p>
            {result.unsupported.length > 0 && (
              <>
                <p className="mb-4">{t('exercizer.import.unsupported')} :</p>
                <ul>
                  {result.unsupported.map((title, index) => (
                    <li key={index}>{title}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t(step === 'result' ? 'exercizer.close' : 'exercizer.cancel')}
        </Button>
        {step === 'begin' && (
          <Button color="primary" variant="filled" onClick={() => setStep('import')}>
            {t('exercizer.import.next')}
          </Button>
        )}
        {step === 'import' && (
          <Button color="primary" variant="filled" isLoading={run.isPending} onClick={launch}>
            {t('exercizer.import.launch')}
          </Button>
        )}
        {step === 'result' && result && (
          <Button color="primary" variant="filled" onClick={() => onOpen(result.subject)}>
            {t('exercizer.import.view')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

/**
 * Options d'impression — avec ou sans les réponses. L'impression s'ouvre dans un NOUVEL onglet :
 * la page imprimable n'a ni bandeau ni navigation, et l'enseignant garde sa liste ouverte.
 */
export function PrintDialog({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [responses, setResponses] = useState<'true' | 'false'>('true');

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>{t('exercizer.print.title')}</Modal.Header>
      <Modal.Body>
        <Alert type="warning" className="mb-16">
          {t('exercizer.print.warning')}
        </Alert>
        <p>{t('exercizer.print.choice')}</p>
        <div className="d-flex flex-column gap-8">
          <Radio
            name={`${id}-responses`}
            value="true"
            model={responses}
            label={t('exercizer.print.choice.responses.with')}
            onChange={() => setResponses('true')}
          />
          <Radio
            name={`${id}-responses`}
            value="false"
            model={responses}
            label={t('exercizer.print.choice.responses.without')}
            onChange={() => setResponses('false')}
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          onClick={() => {
            window.open(
              `/exercizer?ui=react#/subject/print/${subject.id}?responses=${responses}`,
              '_blank',
            );
            onClose();
          }}
        >
          {t('exercizer.validate')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/** Export d'un sujet interactif au format Moodle, avec ce que le format ne sait pas porter. */
export function ExportMoodleDialog({
  subject,
  onClose,
}: {
  subject: Subject;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>
        {t('exercizer.export.title')} {subject.title} {t('exercizer.export.format')}
      </Modal.Header>
      <Modal.Body>
        <p>{t('exercizer.export.desc')} :</p>
        <ul className="mb-0">
          {[1, 2, 3].map((n) => (
            <li key={n}>{t(`exercizer.unsup.export.type${n}`)}</li>
          ))}
        </ul>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          onClick={() => {
            window.location.href = exportMoodleUrl(subject);
            onClose();
          }}
        >
          {t('exercizer.export.action')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/**
 * Partage d'un sujet entre enseignants — le panneau de partage du socle, branché sur les routes
 * du module (`/exercizer/subject/share/…`), qui ne suivent pas le gabarit par défaut.
 */
export function ShareSubjectDialog({
  subject,
  onClose,
  onShared,
}: {
  subject: Subject;
  onClose: () => void;
  onShared: () => void;
}) {
  const shareOptions = useMemo<ShareOptions>(
    () => ({
      resourceId: String(subject.id),
      resourceCreatorId: subject.owner,
      resourceCreatorDisplayName: subject.owner_username,
      resourceRights: [],
      shareUrls: {
        getResourceRights: `/exercizer/subject/share/json/${subject.id}?search=`,
        saveResourceRights: `/exercizer/subject/share/resource/${subject.id}`,
        getShareMapping: '/exercizer/rights/sharing',
      },
    }),
    [subject],
  );
  return <ShareModal isOpen shareOptions={shareOptions} onSuccess={onShared} onCancel={onClose} />;
}
