import { Alert, Badge, Button, Heading, LoadingScreen } from '@open-ent/react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatScore } from '../correction';
import { AnswerFields } from '../features/copies/AnswerFields';
import { GrainCopyDocuments, GrainCopyHeader } from '../features/copies/GrainCopyHeader';
import { GRAIN, isQuestion } from '../grains';
import { mediaLabels, playableHtml } from '../media';
import { GrainCopy, GrainCustomCopyData } from '../types';
import { sanitizeHtml } from '../zones';
import {
  checkAnswers,
  CheckResult,
  getConnectedUser,
  getPublicSubject,
  getReferential,
  PracticeBoot,
  PracticeDetail,
  PracticeSubject,
  Referential,
  savePending,
  searchPublic,
  takePending,
} from './api';

/**
 * Site public d'entraînement : l'accueil (recherche parmi les exercices publiés) et la page d'un
 * exercice (passation, correction PAR LE SERVEUR, invitation à créer un compte).
 *
 * Rien ici ne suppose une session : pas de fournisseur edifice, pas de droits. Un usager connecté est
 * seulement reconnu (pour lui dire que son résultat est enregistré).
 */
const PAGE = '/exercizer/practice';

export function PracticeApp({ boot }: { boot: PracticeBoot }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const user = useQuery({ queryKey: ['practice', 'me'], queryFn: getConnectedUser, staleTime: Infinity });
  const callback = encodeURIComponent(window.location.href);

  return (
    <div className="practice-site d-flex flex-column min-vh-100">
      <header className="border-bottom bg-white">
        <div className="container d-flex align-items-center justify-content-between gap-16 py-12 flex-wrap">
          <a href={PAGE} className="h4 m-0 text-decoration-none">
            {boot.config.title}
          </a>
          <nav className="d-flex align-items-center gap-16">
            {boot.config.entUrl && <a href={boot.config.entUrl}>{t('exercizer.practice.discover.ent')}</a>}
            {user.data ? (
              <span className="small text-muted" data-testid="practice-connected">
                {t('exercizer.practice.connected', { name: user.data.firstName ?? user.data.username ?? '' })}
              </span>
            ) : (
              <a href={`/auth/login?callback=${callback}`}>{t('exercizer.practice.login')}</a>
            )}
          </nav>
        </div>
      </header>
      <main className="container py-24 flex-grow-1">
        {boot.page === 'exercise' && boot.subjectId ? (
          <Exercise subjectId={boot.subjectId} boot={boot} connected={!!user.data} />
        ) : (
          <Home />
        )}
      </main>
      <footer className="border-top py-16">
        <div className="container small text-muted">{t('exercizer.practice.footer')}</div>
      </footer>
    </div>
  );
}

// ── Accueil ─────────────────────────────────────────────────────────────────

function Home() {
  const { t } = useTranslation(['exercizer', 'common']);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<number | null>(null);
  const [discipline, setDiscipline] = useState<number | null>(null);
  const referential = useQuery({ queryKey: ['practice', 'referential'], queryFn: getReferential, staleTime: Infinity });

  // La saisie ne relance la recherche qu'après une pause.
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const results = useInfiniteQuery({
    queryKey: ['practice', 'search', query, level, discipline],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      searchPublic({
        q: query,
        levels: level ? [level] : [],
        disciplines: discipline ? [discipline] : [],
        offset: pageParam,
      }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.subjects.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const subjects = results.data?.pages.flatMap((page) => page.subjects) ?? [];

  return (
    <>
      <Heading level="h1" headingStyle="h2" className="mb-8">
        {t('exercizer.practice.home.title')}
      </Heading>
      <p className="text-muted mb-24">{t('exercizer.practice.home.intro')}</p>
      <div className="row g-12 mb-24" role="search">
        <div className="col-12 col-md-6">
          <input
            type="search"
            className="form-control"
            placeholder={t('exercizer.practice.search')}
            aria-label={t('exercizer.practice.search')}
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>
        <div className="col-6 col-md-3">
          <select
            className="form-select"
            aria-label={t('exercizer.practice.level')}
            value={level ?? ''}
            onChange={(event) => setLevel(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">{t('exercizer.practice.level.all')}</option>
            {referential.data?.levels.map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.label)}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-3">
          <select
            className="form-select"
            aria-label={t('exercizer.practice.discipline')}
            value={discipline ?? ''}
            onChange={(event) => setDiscipline(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">{t('exercizer.practice.discipline.all')}</option>
            {referential.data?.disciplines.map((item) => (
              <option key={item.id} value={item.id}>
                {t(item.label)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {results.isError && <Alert type="danger">{t('exercizer.error')}</Alert>}
      {results.isLoading ? (
        <LoadingScreen position={false} />
      ) : subjects.length === 0 ? (
        <Alert type="info">{t('exercizer.practice.empty')}</Alert>
      ) : (
        <ul className="list-unstyled row g-16" data-testid="practice-results">
          {subjects.map((subject) => (
            <li key={subject.id} className="col-12 col-md-6 col-lg-4">
              <SubjectCard subject={subject} referential={referential.data} />
            </li>
          ))}
        </ul>
      )}
      {results.hasNextPage && (
        <div className="text-center mt-16">
          <Button color="tertiary" variant="outline" isLoading={results.isFetchingNextPage} onClick={() => results.fetchNextPage()}>
            {t('exercizer.practice.more')}
          </Button>
        </div>
      )}
    </>
  );
}

/** « CE1 · Mathématiques ». Le référentiel ne porte que des clés i18n : on les traduit. */
function classification(subject: PracticeSubject, t: (key: string) => string, referential?: Referential): string {
  if (!referential) return '';
  const levels = (subject.level_ids ?? [])
    .map((id) => referential.levels.find((level) => level.id === id)?.label)
    .filter((label): label is string => !!label)
    .map((label) => t(label));
  const disciplines = (subject.discipline_ids ?? [])
    .map((id) => referential.disciplines.find((discipline) => discipline.id === id)?.label)
    .filter((label): label is string => !!label)
    .map((label) => t(label));
  return [levels.join(', '), disciplines.join(', ')].filter(Boolean).join(' · ');
}

/** Le texte d'une description HTML (une carte n'affiche pas de mise en forme). */
const plain = (html?: string | null) =>
  html ? (new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '').trim() : '';

function SubjectCard({ subject, referential }: { subject: PracticeSubject; referential?: Referential }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const description = plain(subject.description);
  return (
    <a href={`${PAGE}/exercice/${subject.id}`} className="card h-100 p-16 text-decoration-none text-reset">
      <span className="small text-muted">{classification(subject, t, referential)}</span>
      <strong className="d-block mt-4">{subject.title}</strong>
      {description && <span className="d-block small mt-8">{description.length > 160 ? `${description.slice(0, 159)}…` : description}</span>}
      {!!subject.question_count && (
        <span className="d-block small text-muted mt-8">
          {t('exercizer.practice.questions', { count: subject.question_count })}
        </span>
      )}
    </a>
  );
}

// ── Exercice ────────────────────────────────────────────────────────────────

type PublicGrain = PracticeDetail['grains'][number];

/** Le grain public, sous la forme d'une copie d'élève : c'est ce qu'attendent les composants de passation. */
const asGrainCopy = (grain: PublicGrain, data: GrainCustomCopyData | undefined): GrainCopy => ({
  id: grain.id,
  subject_copy_id: 0,
  grain_type_id: grain.grain_type_id,
  grain_scheduled_id: grain.id,
  order_by: grain.order_by,
  grain_copy_data: { ...grain.grain_copy_data, custom_copy_data: data ?? grain.grain_copy_data.custom_copy_data },
});

function Exercise({ subjectId, boot, connected }: { subjectId: number; boot: PracticeBoot; connected: boolean }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const detail = useQuery({ queryKey: ['practice', 'subject', subjectId], queryFn: () => getPublicSubject(subjectId) });
  const [answers, setAnswers] = useState<Record<number, GrainCustomCopyData>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const replayed = useRef(false);

  const grains = useMemo(
    () => [...(detail.data?.grains ?? [])].sort((a, b) => a.order_by - b.order_by || a.id - b.id),
    [detail.data],
  );
  const grainCopies = useMemo(() => grains.map((grain) => asGrainCopy(grain, answers[grain.id])), [grains, answers]);

  const submit = async (given: Record<number, GrainCustomCopyData>) => {
    setChecking(true);
    setError(false);
    try {
      const body = grains
        .filter((grain) => isQuestion(grain.grain_type_id))
        .map((grain) => ({ grain_id: grain.id, custom_copy_data: given[grain.id] ?? grain.grain_copy_data.custom_copy_data ?? {} }));
      setResult(await checkAnswers(subjectId, body));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  // Retour d'inscription ou de connexion : les réponses mises de côté sont rejouées, et enregistrées
  // cette fois si l'usager est connecté.
  useEffect(() => {
    if (!detail.data || replayed.current) return;
    replayed.current = true;
    const pending = takePending(subjectId);
    if (pending) {
      setAnswers(pending);
      if (connected) void submit(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, connected]);

  const leaveFor = (url: string) => {
    savePending(subjectId, answers);
    window.location.href = url;
  };

  if (detail.isError) return <Alert type="danger">{t('exercizer.practice.notfound')}</Alert>;
  if (!detail.data) return <LoadingScreen position={false} />;

  const subject = detail.data.subject;
  const resultOf = (grainId: number) => result?.grains.find((item) => item.grain_id === grainId);
  const sectionOf = (grain: PublicGrain) => detail.data.sections.find((section) => section.id === grain.section_id);

  return (
    <article>
      <p className="mb-8">
        <a href={PAGE}>{t('exercizer.practice.back')}</a>
      </p>
      <Heading level="h1" headingStyle="h2" className="mb-8">
        {subject.title}
      </Heading>
      {subject.description && (
        <div
          className="mb-16"
          dangerouslySetInnerHTML={{ __html: playableHtml(sanitizeHtml(subject.description), mediaLabels(t)) }}
        />
      )}

      {result && (
        <section className="card p-16 mb-24" aria-live="polite" data-testid="practice-result">
          <Heading level="h2" headingStyle="h3" className="mb-8">
            {t('exercizer.practice.score', { score: formatScore(result.score), max: formatScore(result.max_score) })}
          </Heading>
          {result.recorded ? (
            <p className="m-0">{t('exercizer.practice.recorded')}</p>
          ) : connected ? (
            <p className="m-0">{t('exercizer.practice.not.recorded')}</p>
          ) : (
            <div data-testid="practice-signup">
              <p>{t('exercizer.practice.signup.pitch')}</p>
              <div className="d-flex gap-12 flex-wrap">
                <Button color="primary" variant="filled" onClick={() => leaveFor(boot.config.signupUrl)}>
                  {t('exercizer.practice.signup')}
                </Button>
                <Button
                  color="primary"
                  variant="outline"
                  onClick={() => leaveFor(`/auth/login?callback=${encodeURIComponent(window.location.href)}`)}
                >
                  {t('exercizer.practice.login.keep')}
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {grains.map((grain, index) => {
        const grainCopy = grainCopies[index];
        const section = sectionOf(grain);
        const newSection = section && (index === 0 || grains[index - 1].section_id !== grain.section_id);
        const graded = resultOf(grain.id);
        const html =
          grain.grain_type_id === GRAIN.STATEMENT
            ? grain.grain_copy_data.custom_copy_data?.statement
            : grain.grain_copy_data.statement;
        return (
          <div key={grain.id}>
            {newSection && (
              <Heading level="h2" headingStyle="h4" className="mt-24 mb-12">
                {section.title}
              </Heading>
            )}
            <section className="card p-16 mb-16" data-testid="practice-grain">
              <GrainCopyHeader grainCopy={grainCopy} grainCopies={grainCopies} showHint={!result} />
              {html && (
                <div
                  className="mb-16"
                  dangerouslySetInnerHTML={{ __html: playableHtml(sanitizeHtml(html), mediaLabels(t)) }}
                />
              )}
              <GrainCopyDocuments grainCopy={grainCopy} />
              {grain.grain_type_id === GRAIN.OPEN_ANSWER ? (
                <Alert type="info">{t('exercizer.practice.open.answer')}</Alert>
              ) : (
                isQuestion(grain.grain_type_id) && (
                  <AnswerFields
                    grainTypeId={grain.grain_type_id}
                    data={grainCopy.grain_copy_data.custom_copy_data ?? {}}
                    onChange={(next) => setAnswers((current) => ({ ...current, [grain.id]: next }))}
                    readOnly={!!result}
                  />
                )
              )}
              {graded && (
                <div className={`mt-12 p-12 rounded ${graded.score >= graded.max_score ? 'bg-success-200' : 'bg-warning-200'}`}>
                  <Badge variant={{ type: 'content', level: graded.score >= graded.max_score ? 'success' : 'warning', background: true }}>
                    {formatScore(graded.score)} / {formatScore(graded.max_score)}
                  </Badge>
                  {!graded.answered && <span className="ms-8 small">{t('exercizer.practice.unanswered')}</span>}
                  {graded.answer_explanation && <p className="mt-8 mb-0">{graded.answer_explanation}</p>}
                </div>
              )}
            </section>
          </div>
        );
      })}

      {error && <Alert type="danger" className="mb-16">{t('exercizer.practice.check.error')}</Alert>}
      <div className="d-flex justify-content-end gap-12">
        {result ? (
          <Button color="tertiary" variant="outline" onClick={() => window.location.reload()}>
            {t('exercizer.practice.retry')}
          </Button>
        ) : (
          <Button color="primary" variant="filled" isLoading={checking} onClick={() => submit(answers)} data-testid="practice-check">
            {t('exercizer.practice.check')}
          </Button>
        )}
      </div>
    </article>
  );
}
