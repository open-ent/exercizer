import { Alert, Button, Heading, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
import { ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';

import { getGrains, getSubjects, getSubjectsScheduledAsTeacher } from '../api';
import { blockStyle, ZoneCanvas } from '../features/zones/ZoneParts';
import { byOrder, GRAIN, isQuestion, isUndecided, questionNumber, statementOf } from '../grains';
import { Grain, GrainAnswer, GrainZone, Subject } from '../types';
import { formatDateTime } from '../utils';
import { answersTypeOf, printableFillText, sanitizeHtml } from '../zones';

/**
 * Un HTML d'énoncé mis en forme pour le papier — `PrintSubjectController#formatHtml` : les
 * images sont bornées en largeur, et l'adresse d'un lien est écrite en clair après son texte,
 * puisqu'on ne clique pas sur une feuille.
 */
export function printableHtml(html: string | undefined): string {
  if (!html) return '';
  const root = new DOMParser().parseFromString(`<body>${sanitizeHtml(html)}</body>`, 'text/html')
    .body;
  root.querySelectorAll('img').forEach((image) => {
    image.style.maxWidth = image.classList.contains('smiley') ? '40px' : '300px';
    image.style.height = 'auto';
  });
  root.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    link.after(` [${href}] `);
  });
  return root.innerHTML;
}

const OPTION_LABELS: Record<string, string> = {
  text: 'exercizer.grain.option1',
  list: 'exercizer.grain.option2',
  drag: 'exercizer.grain.option3',
};

const TYPE_LABELS: Record<number, string> = {
  [GRAIN.STATEMENT]: 'exercizer.grain.type.statement',
  [GRAIN.SIMPLE_ANSWER]: 'exercizer.grain.type.simpleanswer',
  [GRAIN.OPEN_ANSWER]: 'exercizer.grain.type.openanswer',
  [GRAIN.MULTIPLE_ANSWERS]: 'exercizer.grain.type.multipleanswers',
  [GRAIN.QCM]: 'exercizer.grain.type.qcm',
  [GRAIN.ASSOCIATION]: 'exercizer.grain.type.association',
  [GRAIN.ORDER_BY]: 'exercizer.grain.type.orderby',
  [GRAIN.TEXT_TO_FILL]: 'exercizer.grain.type.texttofill',
  [GRAIN.AREA_SELECT]: 'exercizer.grain.type.areaselect',
  [GRAIN.AREA_SELECT_IMAGE]: 'exercizer.grain.type.areaselectimage',
};

/** Une ligne vide à compléter à la main. */
const Blank = ({ lines = 1 }: { lines?: number }) => (
  <div className="border rounded" style={{ minHeight: 40 * lines }} />
);

const Html = ({ html }: { html: string }) => (
  <div dangerouslySetInnerHTML={{ __html: printableHtml(html) }} />
);

/**
 * Impression d'un sujet — portage de `PrintSubjectController` et `print-subject.html`.
 *
 * La page s'ouvre dans son propre onglet, sans bandeau ni navigation (cf. `routes.tsx`), et
 * lance l'impression d'elle-même une fois ses images chargées. Deux versions, choisies avant
 * d'arriver ici : le sujet à compléter, ou le sujet avec ses réponses et ses explications.
 */
export function PrintSubject() {
  const { subjectId: param } = useParams();
  const subjectId = Number(param);
  const [searchParams] = useSearchParams();
  const showResponses = searchParams.get('responses') === 'true';
  const { t } = useTranslation(['exercizer', 'common']);
  const page = useRef<HTMLDivElement>(null);

  const subjectsQuery = useQuery({ queryKey: ['exercizer', 'subjects'], queryFn: getSubjects });
  const subject = (subjectsQuery.data ?? []).find((item) => item.id === subjectId);
  const grainsQuery = useQuery({
    queryKey: ['exercizer', 'grains', subjectId],
    queryFn: () => getGrains(subject as Subject),
    enabled: !!subject,
  });
  // Si le sujet a été distribué, l'en-tête rappelle l'échéance et la durée prévue.
  const scheduledQuery = useQuery({
    queryKey: ['exercizer', 'scheduled', 'teacher'],
    queryFn: getSubjectsScheduledAsTeacher,
  });
  const scheduled = (scheduledQuery.data ?? []).find((item) => item.subject_id === subjectId);

  const ready = !!subject && !grainsQuery.isLoading && !scheduledQuery.isLoading;

  // L'impression attend les images : lancée trop tôt, la feuille sortirait avec des cadres vides.
  const printed = useRef(false);
  useEffect(() => {
    if (!ready || printed.current) return;
    const images = Array.from(page.current?.querySelectorAll('img') ?? []);
    let cancelled = false;
    const pending = images
      .filter((image) => !image.complete)
      .map(
        (image) =>
          new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
      );
    void Promise.all(pending).then(() => {
      if (cancelled || printed.current) return;
      printed.current = true;
      // Un dernier délai laisse le navigateur poser les zones sur leur image de fond.
      window.setTimeout(() => window.print(), 300);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (subjectsQuery.isLoading || (subject && !ready)) return <LoadingScreen position={false} />;
  if (!subject) return <Alert type="warning">{t('exercizer.empty.subjects')}</Alert>;

  const grains = byOrder(grainsQuery.data ?? []).filter(
    (grain) => !isUndecided(grain.grain_type_id),
  );
  const at = t('exercizer.at');

  return (
    <div ref={page} className="bg-white p-16" id="print-subject">
      <div className="d-flex align-items-center justify-content-between gap-16 mb-16">
        <Heading level="h1" headingStyle="h2" className="m-0">
          {subject.title}
        </Heading>
        {/* Le bouton ne s'imprime pas : il sert à relancer l'impression si on l'a annulée. */}
        <Button
          className="d-print-none"
          color="primary"
          variant="outline"
          onClick={() => window.print()}
        >
          {t('exercizer.instructer.toaster.print')}
        </Button>
      </div>

      <section className="border rounded p-16 mb-16">
        <Heading level="h2" headingStyle="h4" className="mb-8">
          {t('exercizer.summary')}
        </Heading>
        {scheduled ? (
          <>
            <p className="fw-bold mb-4">
              {t('exercizer.summary.date')}{' '}
              {scheduled.due_date
                ? formatDateTime(scheduled.due_date, at)
                : `: ${t('exercizer.summary.nodate')}`}
            </p>
            <p className="fw-bold mb-8">
              {t('exercizer.summary.make')} :{' '}
              {scheduled.estimated_duration
                ? `${scheduled.estimated_duration} ${t('exercizer.minute')}`
                : t('exercizer.summary.nomake')}
            </p>
            <Html html={scheduled.description ?? ''} />
          </>
        ) : (
          <Html html={subject.description ?? ''} />
        )}
      </section>

      {grains.map((grain) => (
        <PrintedGrain key={grain.id} grain={grain} grains={grains} showResponses={showResponses} />
      ))}
    </div>
  );
}

export function PrintedGrain({
  grain,
  grains,
  showResponses,
}: {
  grain: Grain;
  grains: Grain[];
  showResponses: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const data = grain.grain_data;
  const custom = data.custom_data ?? {};
  const answers = custom.correct_answer_list ?? [];
  const zones = custom.zones ?? [];
  const type = grain.grain_type_id;
  const hasMode = type === GRAIN.TEXT_TO_FILL || type === GRAIN.AREA_SELECT;

  if (type === GRAIN.STATEMENT) {
    return (
      <article className="border rounded p-16 mb-16">
        <Heading level="h2" headingStyle="h4" className="mb-8 text-primary">
          {data.title}
        </Heading>
        <p className="fw-bold">
          {t('exercizer.type')} : {t(TYPE_LABELS[type])}
        </p>
        <Html html={statementOf(data)} />
      </article>
    );
  }

  let body: ReactNode = null;
  switch (type) {
    case GRAIN.SIMPLE_ANSWER:
      body = showResponses ? (
        <div className="border rounded p-8">{custom.correct_answer}</div>
      ) : (
        <Blank />
      );
      break;
    case GRAIN.OPEN_ANSWER:
      body = <Blank lines={4} />;
      break;
    case GRAIN.MULTIPLE_ANSWERS:
      body = (
        <div className="d-flex flex-column gap-8">
          {answers.map((answer, index) =>
            showResponses ? (
              <div key={index} className="border rounded p-8">
                {answer.text}
              </div>
            ) : (
              <Blank key={index} />
            ),
          )}
        </div>
      );
      break;
    case GRAIN.QCM:
      body = (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 150 }}>
                {showResponses ? t('exercizer.grain.qcm.responses.header1') : ''}
              </th>
              <th>{t('exercizer.grain.qcm.responses.header2')}</th>
            </tr>
          </thead>
          <tbody>
            {answers.map((answer, index) => (
              <tr key={index}>
                <td>
                  <input
                    type="checkbox"
                    readOnly
                    checked={showResponses && answer.isChecked === true}
                    aria-label={answer.text}
                  />
                </td>
                <td>{answer.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    case GRAIN.ASSOCIATION:
      body = <PrintedAssociation answers={answers} showLeft={custom.show_left_column === true} showResponses={showResponses} />;
      break;
    case GRAIN.ORDER_BY:
      body = (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 150 }}>{t('exercizer.grain.type.order')}</th>
              <th>{t('exercizer.grain.asso.responses.header1')}</th>
            </tr>
          </thead>
          <tbody>
            {/* Trié par TEXTE : l'ordre d'enregistrement est la solution, on ne l'imprime pas. */}
            {[...answers]
              .sort((a, b) => (a.text ?? '').localeCompare(b.text ?? '', 'fr'))
              .map((answer, index) => (
                <tr key={index}>
                  <td>{showResponses ? answer.order_by : ''}</td>
                  <td>{answer.text}</td>
                </tr>
              ))}
          </tbody>
        </table>
      );
      break;
    case GRAIN.TEXT_TO_FILL:
      body = (
        <>
          <div
            className="border rounded p-8"
            dangerouslySetInnerHTML={{
              __html: printableHtml(printableFillText(custom, showResponses)),
            }}
          />
          {answersTypeOf(custom) === 'drag' && <Options options={custom.options ?? []} />}
        </>
      );
      break;
    case GRAIN.AREA_SELECT:
      body = (
        <>
          <PrintedZones
            image={custom._guideImage}
            zones={zones}
            kind="text"
            render={(zone, index) =>
              showResponses
                ? zone.answer
                : answersTypeOf(custom) === 'list'
                  ? `${t('exercizer.grain.filltext.editor.text.answer')} ${index + 1}`
                  : ' '
            }
          />
          {answersTypeOf(custom) === 'drag' && <Options options={custom.options ?? []} />}
          {answersTypeOf(custom) === 'list' && (
            <Options
              options={zones.map(
                (zone, index) =>
                  `${t('exercizer.grain.filltext.editor.text.answer')} ${index + 1} : ${(zone.options ?? []).join(' / ')}`,
              )}
            />
          )}
        </>
      );
      break;
    case GRAIN.AREA_SELECT_IMAGE:
      body = (
        <>
          <PrintedZones
            image={custom._guideImage}
            zones={zones}
            kind="image"
            render={(zone) =>
              showResponses ? (
                <img src={zone.answer} alt="" style={{ maxWidth: 100, maxHeight: 100 }} />
              ) : null
            }
          />
          <div className="d-flex flex-wrap gap-8 mt-16">
            {zones.map((zone, index) => (
              <img key={index} src={zone.answer} alt="" style={{ maxWidth: 100, maxHeight: 100 }} />
            ))}
          </div>
        </>
      );
      break;
    default:
      body = null;
  }

  return (
    <article className="border rounded p-16 mb-16" style={{ breakInside: 'avoid' }}>
      <Heading level="h2" headingStyle="h4" className="mb-8 text-primary">
        {isQuestion(type) ? `${questionNumber(grain, grains)}) ` : ''}
        {data.title} - {data.max_score ?? 0} {t('exercizer.score')}
      </Heading>
      <p className="fw-bold">
        {t('exercizer.type')} : {t(TYPE_LABELS[type] ?? '')}
        {hasMode && `, ${t(OPTION_LABELS[answersTypeOf(custom)])}`}
      </p>
      <p className="fw-bold mb-4">{t('exercizer.grain.type.statement')} :</p>
      <div className="mb-16">
        <Html html={data.statement ?? ''} />
      </div>
      {custom.no_error_allowed && (
        <Alert type="warning" className="mb-8">
          {t('exercizer.grain.no.error.allowed')}
        </Alert>
      )}
      {body}
      {/* L'explication est une partie du corrigé : elle ne sort que sur la version « avec les
          réponses ». L'indice, lui, est destiné à l'élève et s'imprime toujours. */}
      {showResponses && data.answer_explanation && (
        <p className="mt-16 mb-0 fst-italic">{data.answer_explanation}</p>
      )}
      {data.answer_hint && <p className="mt-8 mb-0 text-muted">{data.answer_hint}</p>}
    </article>
  );
}

function Options({ options }: { options: string[] }) {
  if (options.length === 0) return null;
  return (
    <ul className="list-unstyled d-flex flex-wrap gap-8 mt-16 mb-0">
      {options.map((option, index) => (
        <li key={index} className="border rounded px-8">
          {option}
        </li>
      ))}
    </ul>
  );
}

/**
 * Une association sur le papier : la colonne de gauche n'est remplie que si l'élève doit la voir
 * (ou sur le corrigé), celle de droite seulement sur le corrigé ; les étiquettes à placer sont
 * listées dessous, triées pour ne rien trahir.
 */
function PrintedAssociation({
  answers,
  showLeft,
  showResponses,
}: {
  answers: GrainAnswer[];
  showLeft: boolean;
  showResponses: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const left = answers.map((answer) => answer.text_left ?? '');
  const right = answers.map((answer) => answer.text_right ?? '');
  const labels = (showLeft ? right : [...left, ...right]).sort((a, b) => a.localeCompare(b, 'fr'));
  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: '50%' }}>{t('exercizer.grain.asso.responses.header1')}</th>
            <th style={{ width: '50%' }}>{t('exercizer.grain.asso.responses.header2')}</th>
          </tr>
        </thead>
        <tbody>
          {answers.map((answer, index) => (
            <tr key={index}>
              <td>{showLeft || showResponses ? answer.text_left : ' '}</td>
              <td>{showResponses ? answer.text_right : ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Options options={labels} />
    </>
  );
}

function PrintedZones({
  image,
  zones,
  kind,
  render,
}: {
  image: string | undefined;
  zones: GrainZone[];
  kind: 'text' | 'image';
  render: (zone: GrainZone, index: number) => ReactNode;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <ZoneCanvas image={image} alt={t('exercizer.grain.background')}>
      {(geometry) =>
        zones.map((zone, index) => (
          <div
            key={index}
            className="border rounded bg-white px-4"
            style={{
              ...blockStyle(zone.position, geometry, kind),
              ...(kind === 'image' ? { width: 100, height: 100 } : { width: 150, minHeight: 40 }),
            }}
          >
            {render(zone, index)}
          </div>
        ))
      }
    </ZoneCanvas>
  );
}

export default PrintSubject;
