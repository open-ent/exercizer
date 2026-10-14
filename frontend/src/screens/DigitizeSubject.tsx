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
  Select,
  TextArea,
  useHasWorkflow,
} from '@open-ent/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import {
  createSection,
  getGrains,
  importSubject,
  saveStructure,
  updateSubject,
  uploadWorkspaceImage,
} from '../api';
import { Unauthorized } from '../components/Unauthorized';
import {
  buildDraft,
  Draft,
  DraftAnswer,
  DraftItem,
  DRAFT_TYPES,
  draftToImport,
  missingAnswer,
  retypeItem,
} from '../digitize';
import {
  cropExcerpt,
  excerptPreview as pageExcerpt,
  readDocument,
  type ReadPage,
  type ReadProgress,
} from '@open-ent/react/digitize';
import { GRAIN } from '../grains';
import { WORKFLOW } from '../rights';

/** Nom i18n de chaque type proposé — ceux de `exercizer.grain_type.public_name`. */
const TYPE_LABELS: Record<number, string> = {
  [GRAIN.STATEMENT]: 'exercizer.grain.type.statement',
  [GRAIN.SIMPLE_ANSWER]: 'exercizer.grain.type.simpleanswer',
  [GRAIN.OPEN_ANSWER]: 'exercizer.grain.type.openanswer',
  [GRAIN.QCM]: 'exercizer.grain.type.qcm',
  [GRAIN.ASSOCIATION]: 'exercizer.grain.type.association',
  [GRAIN.ORDER_BY]: 'exercizer.grain.type.orderby',
  [GRAIN.TEXT_TO_FILL]: 'exercizer.grain.type.texttofill',
};

type Step = 'pick' | 'reading' | 'review';

/** Les paragraphes d'un élément, tels qu'on les édite : séparés par une ligne vide. */
const joinParagraphs = (paragraphs: string[]) => paragraphs.join('\n\n');
const splitParagraphs = (text: string) => text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);

/**
 * « Numériser un devoir » — un PDF ou une photo devient un sujet interactif.
 *
 * Le document est lu DANS LE NAVIGATEUR (`digitizeReader.ts`) : texte du PDF quand il en porte,
 * reconnaissance de caractères pour un scan. Les règles de `digitize.ts` en tirent un BROUILLON —
 * parties, énoncés, questions et leur type — que l'enseignant relit et complète (bonnes réponses,
 * paires, ordre attendu) avant que rien ne soit créé. La création passe ensuite par l'import
 * (`POST /subject/import`), puis les parties sont posées sur les questions créées.
 *
 * Rien ne quitte le poste tant que l'enseignant n'a pas validé : ni le document, ni son texte.
 */
export function DigitizeSubject() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const folderId = params.get('folder') ? Number(params.get('folder')) : null;
  const canImport = useHasWorkflow(WORKFLOW.import) as boolean | undefined;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [pages, setPages] = useState<ReadPage[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [title, setTitle] = useState('');
  const [largeDisplay, setLargeDisplay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async (picked: File) => {
    setError(null);
    setStep('reading');
    try {
      const result = await readDocument(picked, setProgress);
      const built = buildDraft(
        result.pages.flatMap((page) => page.lines),
        result.pages.flatMap((page) => page.figures),
      );
      if (!built.sections.some((section) => section.items.length)) {
        throw new Error('exercizer.digitize.error.empty');
      }
      setPages(result.pages);
      setTruncated(result.truncated);
      setDraft(built);
      setTitle(built.title || picked.name.replace(/\.[^.]+$/, ''));
      setStep('review');
    } catch (cause) {
      // La cause technique (PDF illisible, moteur introuvable…) reste visible dans la console.
      console.error(`[exercizer] numérisation : ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}`);
      // La bibliothèque lève des clés `digitize.error.*` ; ce module a les siennes, préfixées.
      const message = cause instanceof Error ? cause.message : '';
      const key = message.startsWith('exercizer.')
        ? message
        : message.startsWith('digitize.')
          ? `exercizer.${message}`
          : 'exercizer.digitize.error.read';
      setError(t(key));
      setStep('pick');
    }
  };

  const pick = (picked: File | undefined | null) => {
    if (!picked) return;
    setFile(picked);
    void read(picked);
  };

  const create = useMutation({
    mutationFn: async () => {
      const current = draft as Draft;
      // Les extraits choisis sont déposés d'abord : la question les référence par leur lien.
      const excerpts: Record<string, string> = {};
      for (const section of current.sections) {
        for (const item of section.items) {
          if (!item.include || !item.attachExcerpt) continue;
          const page = pages.find((candidate) => candidate.number === item.region.page);
          const blob = page && (await cropExcerpt(page.canvas, item.region.y0, item.region.y1));
          if (!blob) continue;
          try {
            excerpts[item.key] = `/workspace/document/${await uploadWorkspaceImage(blob, `${title || 'devoir'}-${item.label || item.key}.png`)}`;
          } catch {
            // Un extrait qui ne se dépose pas ne fait pas échouer la création : la question arrive sans.
          }
        }
      }

      const { grains, sections } = draftToImport(current, excerpts, t('exercizer.question'));
      if (!grains.length) throw new Error('exercizer.digitize.error.nothing');
      const imported = await importSubject({ title: title.trim(), folder_id: folderId }, grains);
      const subject = largeDisplay ? await updateSubject({ ...imported, large_display: true }) : imported;

      // L'import ne sait pas ranger les grains en parties : on les crée, puis on enregistre
      // l'arbre d'un bloc. Les grains sont retrouvés par leur rang, que l'import a gardé.
      if (sections.length) {
        const created = await getGrains(subject);
        const byOrder = new Map(created.map((grain) => [grain.order_by, grain.id]));
        const placed = new Set<number>();
        const structure = [];
        for (const section of sections) {
          const saved = await createSection(subject.id, { title: section.title, description: null });
          const grainIds = section.orders.map((order) => byOrder.get(order)).filter((grainId): grainId is number => grainId !== undefined);
          grainIds.forEach((grainId) => placed.add(grainId));
          structure.push({ id: saved.id, grainIds });
        }
        const ungrouped = [...created].sort((a, b) => a.order_by - b.order_by).map((grain) => grain.id).filter((grainId) => !placed.has(grainId));
        await saveStructure(subject.id, { ungrouped, sections: structure });
      }
      return subject;
    },
    onSuccess: (subject) => {
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'subjects'] });
      navigate(`/subject/edit/${subject.id}/`);
    },
    onError: (cause) =>
      setError(t(cause instanceof Error && cause.message.startsWith('exercizer.') ? cause.message : 'exercizer.error')),
  });

  const items = useMemo(() => draft?.sections.flatMap((section) => section.items) ?? [], [draft]);
  const included = items.filter((item) => item.include);
  const questions = included.filter((item) => item.grainTypeId !== GRAIN.STATEMENT);
  const incomplete = included.filter(missingAnswer);
  const ocrPages = pages.filter((page) => page.ocr).length;

  const updateItem = (key: string, change: (item: DraftItem) => DraftItem) =>
    setDraft((current) =>
      current && {
        ...current,
        sections: current.sections.map((section) => ({
          ...section,
          items: section.items.map((item) => (item.key === key ? change(item) : item)),
        })),
      },
    );

  const renameSection = (key: string, value: string) =>
    setDraft((current) =>
      current && {
        ...current,
        sections: current.sections.map((section) => (section.key === key ? { ...section, title: value } : section)),
      },
    );

  if (canImport === undefined) return <LoadingScreen position={false} />;
  if (!canImport) return <Unauthorized text={t('exercizer.unauthorized')} />;

  const leave = () => navigate('/dashboard/teacher');

  return (
    <div className="mt-16">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-24">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {t('exercizer.digitize.title')}
        </Heading>
        <div className="d-flex flex-wrap gap-8">
          <Button color="tertiary" variant="ghost" onClick={leave}>
            {t('exercizer.cancel')}
          </Button>
          {step === 'review' && (
            <>
              <Button color="tertiary" variant="outline" onClick={() => setStep('pick')} disabled={create.isPending}>
                {t('exercizer.digitize.other')}
              </Button>
              <Button
                color="primary"
                variant="filled"
                isLoading={create.isPending}
                onClick={() => {
                  if (!title.trim()) return setError(t('exercizer.check.title'));
                  setError(null);
                  create.mutate();
                }}
              >
                {t('exercizer.digitize.create')}
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <Alert type="danger" isDismissible onClose={() => setError(null)} className="mb-16">
          {error}
        </Alert>
      )}

      {step === 'pick' && (
        <section className="card p-24">
          <p>{t('exercizer.digitize.intro')}</p>
          <ul>
            <li>{t('exercizer.digitize.intro.pdf')}</li>
            <li>{t('exercizer.digitize.intro.scan')}</li>
            <li>{t('exercizer.digitize.intro.review')}</li>
          </ul>
          <div
            className={`border border-2 rounded p-32 text-center ${dragging ? 'border-primary bg-primary-200' : 'border-dashed'}`}
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
            <p className="mb-16 fst-italic">{t('exercizer.digitize.drop')}</p>
            <Button color="primary" variant="filled" onClick={() => input.current?.click()}>
              {t('exercizer.digitize.choose')}
            </Button>
            <input
              ref={input}
              id={`${id}-file`}
              data-testid="digitize-file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <p className="small text-gray-700 mt-16 mb-0">{t('exercizer.digitize.limits')}</p>
          </div>
          <p className="small text-gray-700 mt-16 mb-0">{t('exercizer.digitize.privacy')}</p>
        </section>
      )}

      {step === 'reading' && (
        <section className="card p-24 text-center" role="status" aria-live="polite">
          <p className="fw-bold mb-8">{file?.name}</p>
          <p className="mb-16">{progressLabel(progress, t)}</p>
          {/* Le socle n'a pas de barre de progression : deux blocs aux couleurs du thème. */}
          <div
            className="mx-auto rounded-pill overflow-hidden bg-gray-300"
            style={{ maxWidth: 480, height: 8 }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressRatio(progress) * 100)}
          >
            <div className="h-100 bg-primary" style={{ width: `${progressRatio(progress) * 100}%`, transition: 'width .3s' }} />
          </div>
        </section>
      )}

      {step === 'review' && draft && (
        <>
          <section className="card p-16 mb-24">
            <div className="grid gap-16">
              <div className="g-col-12 g-col-md-8">
                <FormControl id={`${id}-title`} isRequired>
                  <Label>{t('exercizer.subject.title')}</Label>
                  <Input type="text" size="md" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
                </FormControl>
              </div>
              <div className="g-col-12 g-col-md-4 d-flex align-items-end">
                <Checkbox
                  label={t('exercizer.subject.large.display')}
                  checked={largeDisplay}
                  onChange={(event) => setLargeDisplay(event.target.checked)}
                />
              </div>
            </div>
            <p className="mt-16 mb-0" data-testid="digitize-summary">
              {t('exercizer.digitize.summary', {
                pages: pages.length,
                questions: questions.length,
                sections: draft.sections.filter((section) => section.title !== null).length,
              })}
            </p>
            {ocrPages > 0 && <Alert type="info" className="mt-16">{t('exercizer.digitize.ocr.notice', { count: ocrPages })}</Alert>}
            {truncated && <Alert type="warning" className="mt-16">{t('exercizer.digitize.truncated')}</Alert>}
            {incomplete.length > 0 && (
              <Alert type="warning" className="mt-16">
                {t('exercizer.digitize.incomplete', { count: incomplete.length })}
              </Alert>
            )}
            {draft.ignored.length > 0 && (
              <details className="mt-16">
                <summary>{t('exercizer.digitize.ignored', { count: draft.ignored.length })}</summary>
                <ul className="small text-gray-700 mb-0 mt-8">
                  {draft.ignored.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {draft.sections.map((section) => (
            <section key={section.key} className="mb-24">
              {section.title !== null && (
                <FormControl id={`${id}-${section.key}`} className="mb-16">
                  <Label>{t('exercizer.digitize.section')}</Label>
                  <Input type="text" size="md" value={section.title} onChange={(event) => renameSection(section.key, event.target.value)} />
                </FormControl>
              )}
              <div className="d-flex flex-column gap-16">
                {section.items.map((item) => (
                  <DraftItemCard
                    key={item.key}
                    item={item}
                    page={pages.find((candidate) => candidate.number === item.region.page)}
                    onChange={(change) => updateItem(item.key, change)}
                  />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function progressLabel(progress: ReadProgress | null, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!progress) return t('exercizer.digitize.progress.start');
  switch (progress.step) {
    case 'render':
      return t('exercizer.digitize.progress.render', { page: progress.page, total: progress.total });
    case 'engine':
      return t('exercizer.digitize.progress.engine');
    case 'ocr':
      return t('exercizer.digitize.progress.ocr', {
        page: progress.page,
        total: progress.total,
        percent: Math.round(progress.ratio * 100),
      });
  }
}

function progressRatio(progress: ReadProgress | null): number {
  if (!progress) return 0;
  if (progress.step === 'render') return progress.page / progress.total / 3;
  if (progress.step === 'engine') return 1 / 3;
  return 1 / 3 + ((progress.page - 1 + progress.ratio) / progress.total) * (2 / 3);
}

/** Aperçu de la zone du devoir d'où vient l'élément, réduit pour l'écran. */
function excerptPreview(page: ReadPage | undefined, item: DraftItem): string | null {
  return page ? pageExcerpt(page.canvas, item.region.y0, item.region.y1) : null;
}

/** Un élément du brouillon : son type, son texte, ses réponses, d'où il vient sur la page. */
function DraftItemCard({
  item,
  page,
  onChange,
}: {
  item: DraftItem;
  page: ReadPage | undefined;
  onChange: (change: (item: DraftItem) => DraftItem) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  // L'aperçu ne dépend que de la zone : le recalculer à chaque frappe serait coûteux.
  const preview = useMemo(
    () => excerptPreview(page, item),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, item.region.page, item.region.y0, item.region.y1],
  );
  const isQuestion = item.grainTypeId !== GRAIN.STATEMENT;
  const incomplete = missingAnswer(item);
  const typeOptions = DRAFT_TYPES.map((type) => ({ value: String(type), label: t(TYPE_LABELS[type]) }));

  const setAnswers = (answers: DraftAnswer[]) => onChange((current) => ({ ...current, answers }));
  const setAnswer = (index: number, patch: Partial<DraftAnswer>) =>
    onChange((current) => ({
      ...current,
      answers: current.answers.map((answer, position) => (position === index ? { ...answer, ...patch } : answer)),
    }));

  return (
    <article
      className={`card p-16 ${item.include ? '' : 'opacity-50'}`}
      data-testid="digitize-item"
      aria-label={isQuestion ? `${t('exercizer.question')} ${item.label}` : t('exercizer.grain.type.statement')}
    >
      <div className="d-flex flex-wrap align-items-center gap-12 mb-12">
        <Checkbox
          label={t('exercizer.digitize.include')}
          checked={item.include}
          onChange={(event) => onChange((current) => ({ ...current, include: event.target.checked }))}
        />
        <div style={{ minWidth: 220 }}>
          <Select
            block
            size="md"
            aria-label={t('exercizer.digitize.type')}
            options={typeOptions}
            // Une chaîne serait affichée telle quelle (« 7 ») : le socle n'y cherche pas le libellé.
            selectedValue={typeOptions.find((option) => option.value === String(item.grainTypeId))}
            onValueChange={(option) => {
              const value = Number(typeof option === 'string' ? option : option?.value);
              // Le socle rappelle aussi `onValueChange` au montage, avec la valeur courante.
              if (value && value !== item.grainTypeId) onChange((current) => retypeItem(current, value));
            }}
            placeholderOption={t(TYPE_LABELS[item.grainTypeId])}
          />
        </div>
        {item.label && <Badge>{`${t('exercizer.question')} ${item.label}`}</Badge>}
        {isQuestion && (
          <FormControl id={`${id}-score`} className="d-flex align-items-center gap-8 ms-auto">
            <Label className="mb-0">{t('exercizer.digitize.score')}</Label>
            <Input
              type="number"
              size="sm"
              min={0}
              step={0.5}
              style={{ width: 80 }}
              value={item.score}
              onChange={(event) => onChange((current) => ({ ...current, score: Number(event.target.value) || 0 }))}
            />
          </FormControl>
        )}
      </div>

      {(item.warnings.length > 0 || incomplete) && (
        <ul className="list-unstyled d-flex flex-wrap gap-8 mb-12">
          {incomplete && (
            <li>
              <Badge variant={{ type: 'notification', level: 'warning' }}>{t('exercizer.digitize.warning.missing')}</Badge>
            </li>
          )}
          {item.warnings
            .filter((warning) => warning !== 'answer' && warning !== 'checked' && warning !== 'blanks')
            .map((warning) => (
              <li key={warning}>
                <Badge variant={{ type: 'notification', level: 'info' }}>{t(`exercizer.digitize.warning.${warning}`)}</Badge>
              </li>
            ))}
        </ul>
      )}

      <FormControl id={`${id}-text`} className="mb-12">
        <Label>{isQuestion ? t('exercizer.digitize.text.question') : t('exercizer.statement')}</Label>
        <TextArea
          size="md"
          rows={Math.min(8, Math.max(2, item.paragraphs.join('\n').length / 90 + item.paragraphs.length))}
          value={joinParagraphs(item.paragraphs)}
          onChange={(event) => {
            const paragraphs = splitParagraphs(event.target.value);
            onChange((current) =>
              current.grainTypeId === GRAIN.TEXT_TO_FILL
                ? retypeItem({ ...current, paragraphs }, GRAIN.TEXT_TO_FILL)
                : { ...current, paragraphs },
            );
          }}
        />
        {item.grainTypeId === GRAIN.TEXT_TO_FILL && (
          <small className="d-block text-gray-700 mt-4">{t('exercizer.digitize.blanks.help')}</small>
        )}
      </FormControl>

      {item.grainTypeId === GRAIN.SIMPLE_ANSWER && (
        <FormControl id={`${id}-expected`} className="mb-12">
          <Label>{t('exercizer.digitize.expected')}</Label>
          <Input
            type="text"
            size="md"
            value={item.expected[0] ?? ''}
            onChange={(event) => onChange((current) => ({ ...current, expected: [event.target.value] }))}
          />
        </FormControl>
      )}

      {item.grainTypeId === GRAIN.TEXT_TO_FILL && (
        <div className="grid gap-8 mb-12">
          {item.expected.map((answer, index) => (
            <FormControl key={index} id={`${id}-blank-${index}`} className="g-col-12 g-col-md-4">
              <Label>{t('exercizer.digitize.blank', { number: index + 1 })}</Label>
              <Input
                type="text"
                size="md"
                value={answer}
                onChange={(event) =>
                  onChange((current) => ({
                    ...current,
                    expected: current.expected.map((value, position) => (position === index ? event.target.value : value)),
                  }))
                }
              />
            </FormControl>
          ))}
        </div>
      )}

      {(item.grainTypeId === GRAIN.QCM || item.grainTypeId === GRAIN.ORDER_BY || item.grainTypeId === GRAIN.ASSOCIATION) && (
        <div className="mb-12">
          <p className="small text-gray-700 mb-8">{t(`exercizer.digitize.answers.help.${item.grainTypeId}`)}</p>
          <ol className="list-unstyled d-flex flex-column gap-8 mb-8">
            {item.answers.map((answer, index) => (
              <li key={index} className="d-flex align-items-center gap-8">
                {item.grainTypeId === GRAIN.QCM && (
                  <Checkbox
                    aria-label={t('exercizer.digitize.correct')}
                    checked={!!answer.checked}
                    onChange={(event) => setAnswer(index, { checked: event.target.checked })}
                  />
                )}
                {item.grainTypeId === GRAIN.ORDER_BY && <span className="fw-bold">{index + 1}.</span>}
                <FormControl id={`${id}-answer-${index}`} className="flex-fill">
                  <Input
                    type="text"
                    size="md"
                    aria-label={t('exercizer.digitize.answer', { number: index + 1 })}
                    value={answer.text}
                    onChange={(event) => setAnswer(index, { text: event.target.value })}
                  />
                </FormControl>
                {item.grainTypeId === GRAIN.ASSOCIATION && (
                  <FormControl id={`${id}-right-${index}`} className="flex-fill">
                    <Input
                      type="text"
                      size="md"
                      aria-label={t('exercizer.digitize.answer.right', { number: index + 1 })}
                      value={answer.right ?? ''}
                      onChange={(event) => setAnswer(index, { right: event.target.value })}
                    />
                  </FormControl>
                )}
                {item.grainTypeId === GRAIN.ORDER_BY && (
                  <>
                    <Button
                      size="sm"
                      color="tertiary"
                      variant="ghost"
                      disabled={index === 0}
                      aria-label={t('exercizer.digitize.up')}
                      onClick={() => {
                        const next = [...item.answers];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setAnswers(next);
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      color="tertiary"
                      variant="ghost"
                      disabled={index === item.answers.length - 1}
                      aria-label={t('exercizer.digitize.down')}
                      onClick={() => {
                        const next = [...item.answers];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        setAnswers(next);
                      }}
                    >
                      ↓
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  color="danger"
                  variant="ghost"
                  aria-label={t('exercizer.remove')}
                  onClick={() => setAnswers(item.answers.filter((_, position) => position !== index))}
                >
                  ✕
                </Button>
              </li>
            ))}
          </ol>
          <div className="d-flex flex-wrap align-items-center gap-16">
            <Button size="sm" color="primary" variant="outline" onClick={() => setAnswers([...item.answers, { text: '' }])}>
              {t('exercizer.digitize.answer.add')}
            </Button>
            {item.grainTypeId === GRAIN.QCM && (
              <Checkbox
                label={t('exercizer.digitize.multiple')}
                checked={item.multiple}
                onChange={(event) => onChange((current) => ({ ...current, multiple: event.target.checked }))}
              />
            )}
          </div>
        </div>
      )}

      {preview && (
        <details open={item.attachExcerpt || undefined}>
          <summary className="small">{t('exercizer.digitize.source', { page: item.region.page })}</summary>
          <img src={preview} alt={t('exercizer.digitize.source', { page: item.region.page })} className="border rounded mt-8 mw-100" />
          <div className="mt-8">
            <Checkbox
              label={t('exercizer.digitize.attach')}
              checked={item.attachExcerpt}
              onChange={(event) => onChange((current) => ({ ...current, attachExcerpt: event.target.checked }))}
            />
          </div>
        </details>
      )}
    </article>
  );
}

export default DigitizeSubject;
