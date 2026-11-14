import {
  Alert,
  Badge,
  Button,
  Checkbox,
  FormControl,
  Heading,
  Input,
  Label,
  LoadingScreen,
  TextArea,
  useHasWorkflow,
} from '@open-ent/react';
import { IconCheck } from '@open-ent/react/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { importSubject, setClassification, updateSubject, uploadWorkspaceImage } from '../api';
import { useCatalogReferential } from '../components/CatalogDialogs';
import { Unauthorized } from '../components/Unauthorized';
import { isClassified } from '../catalog';
import { GRAIN } from '../grains';
import { allImages, applyImageLinks, ImportedGrain, MoodleXmlError, parseMoodleXml } from '../moodleImport';
import {
  analysePackage,
  assetBlob,
  classificationFromCodes,
  ConversionNotice,
  htmlToText,
  normaliseGrains,
  PACKAGE_ACCEPT,
  PACKAGE_FORMATS,
  PackageAnalysis,
  PackageImportError,
  previewGrains,
  replaceAssetRefs,
  sortNotices,
  suggestedTitle,
} from '../packageImport';
import { WORKFLOW } from '../rights';
import { Subject } from '../types';
import { PrintedGrain } from './PrintSubject';

/** Les trois temps du parcours, montrés en tête d'écran. */
type Step = 'pick' | 'review' | 'done';
const STEPS: Step[] = ['pick', 'review', 'done'];

const NOTICE_TYPES: Record<ConversionNotice['level'], 'danger' | 'warning' | 'info'> = {
  error: 'danger',
  dropped: 'warning',
  degraded: 'warning',
  info: 'info',
};

/**
 * Une banque Moodle XML relue dans le navigateur : c'est l'importeur le plus complet (images,
 * cloze, marqueurs, calculée simple). Pour l'aperçu, les images pointent sur le fichier local ;
 * à la création, elles sont déposées dans l'espace documentaire.
 */
async function moodleXmlPreview(
  file: File,
  truefalse: (value: string) => string,
  forCreation: boolean,
): Promise<{ grains: ImportedGrain[]; unsupported: string[]; total: number }> {
  const parsed = parseMoodleXml(await file.text(), truefalse);
  if (parsed.grains.length === 0) throw new MoodleXmlError('exercizer.import.xml.empty');
  await Promise.all(
    allImages(parsed.images).map(async (image) => {
      if (!forCreation) {
        image.link = URL.createObjectURL(image.blob);
        return;
      }
      try {
        image.link = `/workspace/document/${await uploadWorkspaceImage(image.blob, image.name)}`;
      } catch {
        image.link = '';
      }
    }),
  );
  applyImageLinks(parsed.grains, parsed.images);
  return { grains: parsed.grains, unsupported: parsed.unsupported, total: parsed.total };
}

/**
 * « Importer depuis un autre format » — créer un sujet interactif à partir d'un fichier produit
 * par une autre plateforme, en trois temps : déposer le fichier, vérifier sa conversion (les
 * grains tels que l'élève les verra, et ce qui s'est perdu en route), puis créer le sujet et
 * l'essayer comme un élève. `?folder=<id>` range le sujet dans le dossier courant.
 */
export function ImportPackageSubject() {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const folderId = params.get('folder') ? Number(params.get('folder')) : null;
  const canImport = useHasWorkflow(WORKFLOW.import) as boolean | undefined;
  const referential = useCatalogReferential();
  const input = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<PackageAnalysis | null>(null);
  // Les grains montrés (images en liens locaux) et ceux à créer (identifiants d'images).
  const [grains, setGrains] = useState<ImportedGrain[]>([]);
  const [rawGrains, setRawGrains] = useState<ImportedGrain[]>([]);
  const [showResponses, setShowResponses] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [largeDisplay, setLargeDisplay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Subject | null>(null);
  // Les sujets d'un paquet OEIP déjà créés, par rang : on peut en importer un autre du même paquet.
  const [createdItems, setCreatedItems] = useState<number[]>([]);

  const truefalse = (value: string) => t(`exercizer.import.truefalse.${value}`);

  const analyse = useMutation({
    mutationFn: async ({ picked, item }: { picked: File; item: number }) => {
      const result = await analysePackage(picked, item);
      if (result.format !== 'moodle-xml') {
        const converted = normaliseGrains(result.preview?.grains ?? []);
        // Les images citées sont montrées depuis le poste ; elles ne sont déposées qu'à la création.
        const local = new Map(
          (result.assets ?? []).map((asset) => [asset.id, URL.createObjectURL(assetBlob(asset))] as const),
        );
        return { result, grains: replaceAssetRefs(converted, local), raw: converted };
      }
      // Banque Moodle XML : l'aperçu et le bilan viennent de l'importeur du navigateur.
      const local = await moodleXmlPreview(picked, truefalse, false);
      const notices: ConversionNotice[] = local.unsupported.map((name) => ({
        level: 'dropped',
        code: 'exercizer.import.unsupported',
        message: t('exercizer.package.notice.unsupported', { name }),
      }));
      return {
        result: {
          ...result,
          fidelity: notices.length ? 'partial' : 'full',
          notices,
          counts: { ...result.counts, questions: local.total, grains: local.grains.length },
        } as PackageAnalysis,
        grains: local.grains,
        raw: local.grains,
      };
    },
    onSuccess: ({ result, grains: converted, raw }, { picked }) => {
      setAnalysis(result);
      setGrains(converted);
      setRawGrains(raw);
      setTitle(suggestedTitle(result, picked.name));
      // La description d'un sujet se saisit en texte : celle d'un paquet peut être du HTML.
      setDescription(htmlToText(result.preview?.subject?.description));
      setStep('review');
    },
    onError: (cause) => {
      setStep('pick');
      setError(
        t(
          cause instanceof PackageImportError || cause instanceof MoodleXmlError
            ? cause.message
            : 'exercizer.package.error.unreadable',
        ),
      );
    },
  });

  const pick = (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    setFile(picked);
    setCreatedItems([]);
    analyse.mutate({ picked, item: 0 });
  };

  const classification = useMemo(
    () => classificationFromCodes(referential.data, analysis?.levels, analysis?.disciplines),
    [referential.data, analysis],
  );

  const create = useMutation({
    mutationFn: async () => {
      let toCreate: ImportedGrain[];
      if (analysis?.format === 'moodle-xml') {
        toCreate = (await moodleXmlPreview(file!, truefalse, true)).grains;
      } else {
        // Chaque image citée est déposée dans l'espace documentaire ; un dépôt qui échoue ne fait
        // pas échouer l'import, l'image manque simplement (comme pour Moodle XML).
        const links = new Map<string, string>();
        await Promise.all(
          (analysis?.assets ?? []).map(async (asset) => {
            try {
              links.set(asset.id, `/workspace/document/${await uploadWorkspaceImage(assetBlob(asset), asset.fileName)}`);
            } catch {
              links.set(asset.id, '');
            }
          }),
        );
        toCreate = replaceAssetRefs(rawGrains, links);
      }
      const imported = await importSubject(
        { title: title.trim(), description: description || undefined, folder_id: folderId },
        toCreate,
      );
      // Le schéma d'import n'a pas la clé : le grand format se pose ensuite, comme une propriété.
      const subject = largeDisplay ? await updateSubject({ ...imported, large_display: true }) : imported;
      // Le sujet existe déjà : un échec du classement ne doit pas le faire recréer.
      if (isClassified(classification)) await setClassification(subject.id, classification).catch(() => undefined);
      return subject;
    },
    onSuccess: (subject) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
      setCreated(subject);
      if (analysis?.selected !== undefined) setCreatedItems((items) => [...items, analysis.selected!]);
      setStep('done');
    },
    onError: () => setError(t('exercizer.error')),
  });

  // Les liens locaux des images de l'aperçu ne survivent pas à l'écran.
  useEffect(
    () => () => {
      grains.forEach((grain) => {
        const html = JSON.stringify(grain.grain_data);
        (html.match(/blob:[^"\\]+/g) ?? []).forEach((url) => URL.revokeObjectURL(url));
      });
    },
    [grains],
  );

  const shown = useMemo(() => previewGrains(grains), [grains]);
  const questions = shown.filter((grain) => grain.grain_type_id !== GRAIN.STATEMENT).length;
  const notices = useMemo(() => sortNotices(analysis?.notices ?? []), [analysis]);

  if (canImport === undefined) return <LoadingScreen position={false} />;
  if (!canImport) return <Unauthorized text={t('exercizer.unauthorized')} />;

  const leave = () => navigate('/dashboard/teacher');
  const restart = () => {
    setStep('pick');
    setFile(null);
    setAnalysis(null);
    setGrains([]);
    setRawGrains([]);
    setCreated(null);
    setError(null);
  };
  const chooseItem = (item: number) => {
    if (!file) return;
    setError(null);
    analyse.mutate({ picked: file, item });
  };

  return (
    <div className="mt-16" data-testid="import-package">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {t('exercizer.package.title')}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          <Button color="tertiary" variant="ghost" onClick={leave}>
            {t(step === 'done' ? 'exercizer.close' : 'exercizer.cancel')}
          </Button>
          {step === 'review' && (
            <>
              <Button color="tertiary" variant="outline" onClick={restart} disabled={create.isPending}>
                {t('exercizer.package.other')}
              </Button>
              <Button
                color="primary"
                variant="filled"
                isLoading={create.isPending}
                disabled={grains.length === 0 || analyse.isPending}
                data-testid="import-package-create"
                onClick={() => {
                  if (!title.trim()) return setError(t('exercizer.check.title'));
                  setError(null);
                  create.mutate();
                }}
              >
                {t('exercizer.package.create')}
              </Button>
            </>
          )}
        </div>
      </div>

      <ol className="exercizer-stepper list-unstyled mb-24" aria-label={t('exercizer.package.steps')}>
        {STEPS.map((name, index) => {
          const current = STEPS.indexOf(step);
          const state = index < current ? 'is-done' : index === current ? 'is-current' : 'is-todo';
          return (
            <li key={name} className={state} aria-current={index === current ? 'step' : undefined}>
              <span className="exercizer-stepper-dot" aria-hidden="true">
                {index < current ? <IconCheck width={16} height={16} /> : index + 1}
              </span>
              <span className="exercizer-stepper-label">{t(`exercizer.package.step.${name}`)}</span>
            </li>
          );
        })}
      </ol>

      {error && (
        <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
          {error}
        </Alert>
      )}

      {step === 'pick' && (
        <section className="card p-24">
          <p>{t('exercizer.package.intro')}</p>
          <div className="grid gap-16 mb-24">
            {PACKAGE_FORMATS.map((format) => (
              <div key={format.key} className="g-col-12 g-col-md-6 g-col-lg-4 border rounded p-12">
                <strong>{format.label}</strong>
                <p className="small mb-0 text-gray-700">{t(`exercizer.package.format.${format.key}`)}</p>
              </div>
            ))}
          </div>
          <div
            className={`border border-2 rounded p-32 text-center ${dragging ? 'border-primary bg-primary-200' : ''}`}
            style={{ borderStyle: dragging ? 'solid' : 'dashed' }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pick(event.dataTransfer.files?.[0]);
            }}
          >
            {analyse.isPending ? (
              <p className="mb-0" role="status">
                <strong>{t('exercizer.package.analysing', { name: file?.name ?? '' })}</strong>
              </p>
            ) : (
              <>
                <p className="mb-16 fst-italic">{t('exercizer.package.drop')}</p>
                <Button color="primary" variant="filled" onClick={() => input.current?.click()}>
                  {t('exercizer.package.choose')}
                </Button>
              </>
            )}
            <input
              ref={input}
              id={`${id}-file`}
              data-testid="import-package-file"
              type="file"
              accept={PACKAGE_ACCEPT}
              hidden
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <p className="small text-gray-700 mt-16 mb-0">{t('exercizer.package.detection')}</p>
          </div>
        </section>
      )}

      {step === 'review' && analysis && (
        <div className="grid gap-24">
          <aside className="g-col-12 g-col-lg-4 d-flex flex-column gap-16">
            <section className="card p-16" data-testid="import-package-summary">
              <Heading level="h3" headingStyle="h5" className="mb-12">
                {t('exercizer.package.summary')}
              </Heading>
              <dl className="mb-0">
                <dt>{t('exercizer.package.format')}</dt>
                <dd data-testid="import-package-format">{analysis.formatLabel}</dd>
                {analysis.sourceSystem && (
                  <>
                    <dt>{t('exercizer.package.source')}</dt>
                    <dd>
                      {analysis.sourceSystem}
                      {analysis.sourceVersion && analysis.format !== 'oeip' ? ` ${analysis.sourceVersion}` : ''}
                    </dd>
                  </>
                )}
                <dt>{t('exercizer.package.result')}</dt>
                <dd>{t('exercizer.package.counts', { grains: grains.length, questions })}</dd>
                <dt>{t('exercizer.package.fidelity')}</dt>
                <dd>
                  <Badge
                    variant={{
                      type: 'content',
                      level: analysis.fidelity === 'full' ? 'success' : 'warning',
                      background: true,
                    }}
                    data-testid="import-package-fidelity"
                  >
                    {t(`exercizer.package.fidelity.${analysis.fidelity}`)}
                  </Badge>
                </dd>
              </dl>
            </section>

            {analysis.subjects && analysis.subjects.length > 1 && (
              <section className="card p-16" data-testid="import-package-subjects">
                <Heading level="h3" headingStyle="h5" className="mb-8">
                  {t('exercizer.package.subjects', { count: analysis.subjects.length })}
                </Heading>
                <p className="small text-gray-700">{t('exercizer.package.subjects.help')}</p>
                <ul className="list-unstyled mb-0 d-flex flex-column gap-4">
                  {analysis.subjects.map((subject) => (
                    <li key={subject.index}>
                      <label className="d-flex align-items-center gap-8">
                        <input
                          type="radio"
                          name={`${id}-subject`}
                          checked={analysis.selected === subject.index}
                          disabled={analyse.isPending}
                          onChange={() => chooseItem(subject.index)}
                        />
                        <span>
                          {subject.title}{' '}
                          <small className="text-gray-700">
                            ({t('exercizer.package.subject.grains', { count: subject.grains })})
                          </small>
                          {createdItems.includes(subject.index) && (
                            <small className="text-success"> — {t('exercizer.package.subject.created')}</small>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card p-16">
              <Heading level="h3" headingStyle="h5" className="mb-12">
                {t('exercizer.package.properties')}
              </Heading>
              <FormControl id={`${id}-title`} className="mb-12" isRequired>
                <Label>{t('exercizer.subject.title')}</Label>
                <Input
                  type="text"
                  size="md"
                  maxLength={200}
                  value={title}
                  data-testid="import-package-title"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </FormControl>
              <FormControl id={`${id}-description`} className="mb-12">
                <Label>{t('exercizer.subject.desc')}</Label>
                <TextArea size="md" value={description} onChange={(event) => setDescription(event.target.value)} />
              </FormControl>
              <Checkbox
                label={t('exercizer.subject.large.display')}
                checked={largeDisplay}
                onChange={(event) => setLargeDisplay(event.target.checked)}
              />
              {isClassified(classification) && (
                <p className="small text-gray-700 mt-12 mb-0">{t('exercizer.package.classified')}</p>
              )}
            </section>

            {notices.length > 0 && (
              <section className="card p-16" data-testid="import-package-notices">
                <Heading level="h3" headingStyle="h5" className="mb-12">
                  {t('exercizer.package.notices', { count: notices.length })}
                </Heading>
                <div className="d-flex flex-column gap-8">
                  {notices.map((notice, index) => (
                    <Alert key={index} type={NOTICE_TYPES[notice.level] ?? 'info'}>
                      {notice.message}
                    </Alert>
                  ))}
                </div>
              </section>
            )}
          </aside>

          <section className="g-col-12 g-col-lg-8" data-testid="import-package-preview" aria-busy={analyse.isPending}>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-8 mb-16">
              <Heading level="h3" headingStyle="h5" className="m-0">
                {t('exercizer.package.preview')}
              </Heading>
              <div className="d-flex gap-8" role="group" aria-label={t('exercizer.package.preview')}>
                <Button
                  size="sm"
                  color="primary"
                  variant={showResponses ? 'filled' : 'outline'}
                  aria-pressed={showResponses}
                  onClick={() => setShowResponses(true)}
                >
                  {t('exercizer.package.preview.answers')}
                </Button>
                <Button
                  size="sm"
                  color="primary"
                  variant={showResponses ? 'outline' : 'filled'}
                  aria-pressed={!showResponses}
                  onClick={() => setShowResponses(false)}
                >
                  {t('exercizer.package.preview.student')}
                </Button>
              </div>
            </div>
            {shown.length === 0 ? (
              <Alert type="warning">{t('exercizer.package.empty')}</Alert>
            ) : (
              shown.map((grain) => (
                <PrintedGrain key={grain.id} grain={grain} grains={shown} showResponses={showResponses} />
              ))
            )}
          </section>
        </div>
      )}

      {step === 'done' && created && (
        <section className="card p-24" data-testid="import-package-done">
          <Alert type="success" className="mb-16">
            {t('exercizer.package.done', { title: created.title, count: grains.length })}
          </Alert>
          <p>{t('exercizer.package.done.next')}</p>
          <div className="d-flex flex-wrap gap-8">
            <Button
              color="primary"
              variant="filled"
              data-testid="import-package-try"
              onClick={() => navigate(`/subject/copy/preview/perform/${created.id}/`)}
            >
              {t('exercizer.package.try')}
            </Button>
            <Button color="primary" variant="outline" onClick={() => navigate(`/subject/edit/${created.id}/`)}>
              {t('exercizer.package.edit')}
            </Button>
            {analysis?.subjects && analysis.subjects.length > createdItems.length && (
              <Button
                color="tertiary"
                variant="outline"
                onClick={() => {
                  const next = analysis.subjects!.find((subject) => !createdItems.includes(subject.index));
                  if (next) chooseItem(next.index);
                }}
              >
                {t('exercizer.package.next.subject')}
              </Button>
            )}
            <Button color="tertiary" variant="ghost" onClick={restart}>
              {t('exercizer.package.other')}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

export default ImportPackageSubject;
