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
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  createSubject,
  EXPORT_FORMATS,
  ExportFormat,
  exportSubject,
  setClassification,
  updateSubject,
} from '../api';
import { isClassified } from '../catalog';
import { WORKFLOW } from '../rights';
import { Classification, Subject } from '../types';
import {
  ClassificationFields,
  EMPTY_CLASSIFICATION,
  subjectText,
  useCatalogReferential,
} from './CatalogDialogs';

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
  onImportPackage,
}: {
  folderId: number | null;
  onClose: () => void;
  onCreated: (subject: Subject) => void;
  onGenerate: () => void;
  onDigitize: () => void;
  /** Créer le sujet à partir d'un fichier d'une autre plateforme (Moodle, QTI, OEIP…). */
  onImportPackage?: () => void;
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
  // Niveaux, matières et programme dès la création : ils suivront le sujet jusqu'au catalogue (la
  // publication les reprend) et jusqu'aux badges (les résultats sont alignés sur ses énoncés).
  const referential = useCatalogReferential();
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassificationDraft] = useState<Classification>(EMPTY_CLASSIFICATION);

  const create = useMutation({
    mutationFn: async () => {
      const subject = await createSubject({
        title: fields.title.trim(),
        description: fields.description,
        picture: fields.picture || undefined,
        large_display: fields.large_display,
        folder_id: folderId,
      });
      // Le sujet existe déjà : un échec du classement ne doit pas le faire recréer. Il se reprend
      // depuis « Niveaux et matières » de la liste.
      if (isClassified(classification)) await setClassification(subject.id, classification).catch(() => undefined);
      return subject;
    },
    onSuccess: onCreated,
    onError: () => setError(t('exercizer.error')),
  });

  // Le sujet interactif d'abord : c'est le parcours par défaut, mis en avant (la première carte).
  // La création assistée suit ; le sujet à rendre ferme la marche : il renvoie vers Casier.
  const choices = [
    {
      key: 'interactive',
      title: t('exercizer.choose.interactive.title'),
      info: t('exercizer.choose.interactive.info'),
      action: t('exercizer.create'),
      onClick: () => setStep('subject'),
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
    // Même droit que la numérisation : le sujet est créé par la route d'import.
    ...(canDigitize && onImportPackage
      ? [
          {
            key: 'import-package',
            title: t('exercizer.choose.package.title'),
            info: t('exercizer.choose.package.info'),
            action: t('exercizer.choose.package.button'),
            onClick: onImportPackage,
          },
        ]
      : []),
    {
      key: 'simple',
      title: t('exercizer.choose.simple.title'),
      info: t('exercizer.choose.simple.info'),
      action: t('exercizer.choose.simple.button'),
      onClick: () => {
        window.location.href = '/rack';
      },
    },
  ];

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
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
            {choices.map((choice, index) => (
              <Card
                key={choice.key}
                className={`g-col-12 ${choices.length === 3 ? 'g-col-md-4' : 'g-col-md-6'}${
                  index === 0 ? ' border-2 border-primary bg-primary-200' : ''
                }`}
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
                      <Button
                        color="primary"
                        variant={index === 0 ? 'filled' : 'outline'}
                        onClick={choice.onClick}
                      >
                        {choice.action}
                      </Button>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            ))}
          </div>
        ) : (
          <>
            <SubjectFields value={fields} onChange={setFields} />
            <div className="mt-24 border-top pt-16">
              <Button
                color="tertiary"
                variant="ghost"
                aria-expanded={classifying}
                onClick={() => setClassifying((open) => !open)}
              >
                {t('exercizer.subject.classify.toggle')}
                {isClassified(classification) &&
                  ` (${t('exercizer.subject.classify.count', {
                    count:
                      classification.level_ids.length +
                      classification.discipline_ids.length +
                      (classification.alignment_ids?.length ?? 0),
                  })})`}
              </Button>
              {classifying && (
                <div className="mt-12" data-testid="new-subject-classification">
                  <p className="small text-muted mb-12">{t('exercizer.subject.classify.help')}</p>
                  {referential.data ? (
                    <ClassificationFields
                      text={subjectText(fields)}
                      referential={referential.data}
                      value={classification}
                      onChange={setClassificationDraft}
                    />
                  ) : referential.isError ? (
                    <Alert type="danger">{t('exercizer.error')}</Alert>
                  ) : null}
                </div>
              )}
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="primary" variant="outline" onClick={onClose}>
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
        <Button color="primary" variant="outline" onClick={onClose}>
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
        <Button color="primary" variant="outline" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          onClick={() => {
            window.open(
              `/exercizer#/subject/print/${subject.id}?responses=${responses}`,
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

/**
 * Export d'un sujet interactif : choix du format d'échange (Moodle .mbz ou banque XML, SCORM, cmi5,
 * xAPI, QTI, Common Cartridge, LearnHouse), puis téléchargement. Si la conversion a dû laisser
 * quelque chose de côté, la modale reste ouverte pour le dire.
 */
export function ExportSubjectDialog({
  subject,
  onClose,
}: {
  subject: Subject;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [format, setFormat] = useState<ExportFormat>('moodle');
  const [partial, setPartial] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: () => exportSubject(subject, format),
    onSuccess: ({ blob, fileName, fidelity, notices }) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (fidelity === 'partial') setPartial(notices);
      else onClose();
    },
  });

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>
        {t('exercizer.export.title')} {subject.title}
      </Modal.Header>
      <Modal.Body>
        <p>{t('exercizer.export.choose')}</p>
        <div className="d-flex flex-column gap-8">
          {EXPORT_FORMATS.map((f) => (
            <Radio
              key={f}
              name={`${id}-format`}
              value={f}
              model={format}
              label={t(`exercizer.export.format.${f}`)}
              onChange={() => {
                setFormat(f);
                setPartial(null);
                mutation.reset();
              }}
            />
          ))}
        </div>
        {format === 'moodle-xml' && (
          <Alert type="warning" className="mt-16">
            {t('exercizer.export.desc')} :
            <ul className="mb-0">
              {[1, 2, 3].map((n) => (
                <li key={n}>{t(`exercizer.unsup.export.type${n}`)}</li>
              ))}
            </ul>
          </Alert>
        )}
        {partial !== null && (
          <Alert type="info" className="mt-16">
            {t('exercizer.export.partial', { count: partial })}
          </Alert>
        )}
        {mutation.isError && (
          <Alert type="danger" className="mt-16">
            {t('exercizer.export.error')}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="primary" variant="outline" onClick={onClose}>
          {partial !== null ? t('exercizer.close') : t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          isLoading={mutation.isPending}
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
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
