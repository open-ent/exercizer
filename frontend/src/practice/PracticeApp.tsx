import { Alert, Badge, Heading, LoadingScreen } from '@open-ent/react';
import { useQuery } from '@tanstack/react-query';
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
  getAttempts,
  getConnectedUser,
  getPublicSubject,
  PracticeBoot,
  PracticeDetail,
  savePending,
  takePending,
} from './api';
import { bestBySubject } from './results';

/**
 * Îlots React du site public d'entraînement : les pages elles-mêmes sont rendues par le serveur
 * (PracticePages). Ici : l'encart du compte dans l'en-tête, « Mes résultats » sur l'accueil, et le lecteur
 * d'exercice (passation, correction PAR LE SERVEUR, invitation à créer un compte).
 *
 * Rien ici ne suppose une session : pas de fournisseur edifice, pas de droits. Un usager connecté est
 * seulement reconnu (pour lui dire que son résultat est enregistré).
 */
const PAGE = '/exercizer/practice';

const useConnectedUser = () =>
  useQuery({ queryKey: ['practice', 'me'], queryFn: getConnectedUser, staleTime: Infinity });

const loginUrl = () => `/auth/login?callback=${encodeURIComponent(window.location.href)}`;

// ── En-tête ─────────────────────────────────────────────────────────────────

export function Account({ boot }: { boot: PracticeBoot }) {
  const user = useConnectedUser();
  if (user.data) {
    return (
      <>
        <span className="ps-account__name" data-testid="practice-connected">
          Bonjour {user.data.firstName ?? user.data.username ?? ''}
        </span>
        <a className="ps-btn ps-btn--soft" href="/">
          Mon espace
        </a>
      </>
    );
  }
  return (
    <>
      <a className="ps-btn ps-btn--ghost" href={loginUrl()}>
        Se connecter
      </a>
      <a className="ps-btn ps-btn--primary" href={boot.config.signupUrl}>
        Créer un compte
      </a>
    </>
  );
}

// ── Accueil ─────────────────────────────────────────────────────────────────

export function MyResults() {
  const { t } = useTranslation(['exercizer', 'common']);
  const user = useConnectedUser();
  const attempts = useQuery({
    queryKey: ['practice', 'attempts'],
    queryFn: getAttempts,
    retry: false,
    enabled: !!user.data,
  });
  const rows = useMemo(() => bestBySubject(attempts.data ?? []).slice(0, 6), [attempts.data]);
  if (!rows.length) return null;
  return (
    <section className="ps-mine" data-testid="practice-my-results">
      <h2>{t('exercizer.practice.my.results')}</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.subject_id}>
            <a href={`${PAGE}/exercice/${row.subject_id}`}>
              <span>{row.title}</span>
              <small>
                {t('exercizer.practice.my.best', {
                  score: formatScore(row.score),
                  max: formatScore(row.max_score),
                  tries: row.tries,
                })}
              </small>
            </a>
          </li>
        ))}
      </ul>
    </section>
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

export function Player({ subjectId, boot }: { subjectId: number; boot: PracticeBoot }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const user = useConnectedUser();
  const connected = !!user.data;
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
      document.getElementById('ps-player')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  };

  // Retour d'inscription ou de connexion : les réponses mises de côté sont rejouées, et enregistrées
  // cette fois si l'usager est connecté.
  useEffect(() => {
    if (!detail.data || user.isLoading || replayed.current) return;
    replayed.current = true;
    const pending = takePending(subjectId);
    if (pending) {
      setAnswers(pending);
      if (connected) void submit(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, user.isLoading, connected]);

  const leaveFor = (url: string) => {
    savePending(subjectId, answers);
    window.location.href = url;
  };

  if (detail.isError) return <Alert type="danger">{t('exercizer.practice.notfound')}</Alert>;
  if (!detail.data) return <LoadingScreen position={false} />;

  const resultOf = (grainId: number) => result?.grains.find((item) => item.grain_id === grainId);
  const sectionOf = (grain: PublicGrain) => detail.data.sections.find((section) => section.id === grain.section_id);
  const ratio = result && result.max_score > 0 ? result.score / result.max_score : 0;

  return (
    <article>
      {result && (
        <section className="ps-result" aria-live="polite" data-testid="practice-result">
          <p className="ps-result__score">
            {formatScore(result.score)} / {formatScore(result.max_score)}
            <small>{ratio >= 0.8 ? 'Excellent !' : ratio >= 0.5 ? 'Bien joué, encore un effort.' : 'Relisez les corrections, puis recommencez.'}</small>
          </p>
          <p className="ps-visually-hidden">
            {t('exercizer.practice.score', { score: formatScore(result.score), max: formatScore(result.max_score) })}
          </p>
          {result.recorded ? (
            <p>{t('exercizer.practice.recorded')}</p>
          ) : connected ? (
            <p>{t('exercizer.practice.not.recorded')}</p>
          ) : (
            <div data-testid="practice-signup">
              <p>{t('exercizer.practice.signup.pitch')}</p>
              <div className="ps-result__actions">
                <button type="button" className="ps-btn ps-btn--primary" onClick={() => leaveFor(boot.config.signupUrl)}>
                  {t('exercizer.practice.signup')}
                </button>
                <button type="button" className="ps-btn ps-btn--soft" onClick={() => leaveFor(loginUrl())}>
                  {t('exercizer.practice.login.keep')}
                </button>
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
      <div className="ps-player__actions">
        {result ? (
          <button type="button" className="ps-btn ps-btn--soft" onClick={() => window.location.reload()}>
            {t('exercizer.practice.retry')}
          </button>
        ) : (
          <button
            type="button"
            className="ps-btn ps-btn--primary ps-btn--lg"
            disabled={checking}
            aria-busy={checking}
            onClick={() => submit(answers)}
            data-testid="practice-check"
          >
            {t('exercizer.practice.check')}
          </button>
        )}
      </div>
    </article>
  );
}
