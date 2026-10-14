import { Alert, Button } from '@open-ent/react';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isQuestion } from '../../grains';
import { dateLocale } from '../../locale';
import { canCheckInstantly, instantVerdict, speechText, Verdict } from '../../largeDisplay';
import { GrainCopy, GrainCustomCopyData, GrainScheduled } from '../../types';
import { AnswerFields } from './AnswerFields';
import { GrainCopyDocuments, GrainCopyHeader, GrainCopyStatement } from './GrainCopyHeader';

/**
 * Passation en GRAND FORMAT (sql/043), pour les jeunes élèves : une question à l'écran, sans la
 * liste latérale — une rangée de pastilles la remplace —, gros caractères et grosses cibles, et un
 * bouton « Écouter » qui lit l'énoncé avec la synthèse vocale du navigateur.
 *
 * En entraînement, `reference` porte les grains distribués : l'élève peut alors « Vérifier » chaque
 * réponse et voit tout de suite si elle est juste. Hors entraînement, rien ne se vérifie — les
 * réponses attendues n'arrivent pas dans le navigateur avant l'échéance.
 */
export function LargePerform({
  title,
  grainCopies,
  index,
  onGoTo,
  hasAnswer,
  onAnswerChange,
  readOnly,
  reference,
  banners,
  actions,
}: {
  title: string;
  grainCopies: GrainCopy[];
  index: number;
  onGoTo: (position: number) => void;
  hasAnswer: (grainCopy: GrainCopy) => boolean;
  onAnswerChange: (grainCopy: GrainCopy, next: GrainCustomCopyData) => void;
  readOnly: boolean;
  /** Les grains distribués, en entraînement seulement : sans eux, pas de vérification immédiate. */
  reference?: GrainScheduled[];
  /** Pilotage, alertes : affichés au-dessus de la question. */
  banners: ReactNode;
  /** Précédent / suivant / rendre. */
  actions: ReactNode;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const { speak, stop, speaking, available } = useSpeech();
  // Une lecture en cours ne doit pas déborder sur la question suivante.
  useEffect(() => stop, [index, stop]);
  /** Verdict de chaque grain vérifié ; il s'efface dès que l'élève change sa réponse. */
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({});

  const grainCopy = grainCopies[index];
  const questions = grainCopies.filter((item) => isQuestion(item.grain_type_id));
  const stars = Object.values(verdicts).filter((verdict) => verdict === 'correct').length;
  const model = reference?.find((item) => item.id === grainCopy?.grain_scheduled_id);
  const checkable = !!reference && !!grainCopy && canCheckInstantly(grainCopy.grain_type_id);
  const verdict = grainCopy ? verdicts[grainCopy.id] : undefined;

  const check = () => {
    if (!grainCopy) return;
    const result = instantVerdict(grainCopy, model?.grain_data.custom_data);
    if (!result) return;
    setVerdicts((current) => ({ ...current, [grainCopy.id]: result }));
    playVerdict(result);
  };

  if (!grainCopy) return null;

  return (
    <div className="exercizer-large mt-16">
      <header className="d-flex flex-wrap align-items-center justify-content-between gap-16 mb-16">
        <h1 className="m-0">{title}</h1>
        {reference && (
          <span className="exercizer-large-stars" role="status" aria-label={t('exercizer.large.stars', { count: stars })}>
            <span aria-hidden="true">⭐</span> {stars}
          </span>
        )}
      </header>

      <nav aria-label={t('exercizer.rank')} className="d-flex flex-wrap gap-8 mb-16">
        {grainCopies.map((item, position) => {
          const status = verdicts[item.id] ?? (hasAnswer(item) ? 'answered' : 'empty');
          return (
            <button
              key={item.id}
              type="button"
              className={`exercizer-large-dot is-${status}`}
              aria-current={position === index ? 'step' : undefined}
              aria-label={t('exercizer.large.goto', { number: position + 1 })}
              onClick={() => onGoTo(position)}
            >
              {position + 1}
            </button>
          );
        })}
      </nav>

      {banners}

      <article className="card exercizer-large-stage p-24 mb-16">
        <div className="d-flex justify-content-between align-items-start gap-16 mb-8">
          <span className="text-gray-700">
            {isQuestion(grainCopy.grain_type_id) &&
              t('exercizer.large.question', {
                number: questions.indexOf(grainCopy) + 1,
                total: questions.length,
              })}
          </span>
          {available && (
            <Button
              color="secondary"
              variant="outline"
              size="lg"
              aria-pressed={speaking}
              onClick={() => speak(speechText(grainCopy))}
            >
              <span aria-hidden="true">🔊</span> {t(speaking ? 'exercizer.large.stop' : 'exercizer.large.listen')}
            </Button>
          )}
        </div>

        <GrainCopyHeader grainCopy={grainCopy} grainCopies={grainCopies} showHint />
        <GrainCopyStatement grainCopy={grainCopy} />
        <GrainCopyDocuments grainCopy={grainCopy} />

        <AnswerFields
          grainTypeId={grainCopy.grain_type_id}
          data={grainCopy.grain_copy_data.custom_copy_data ?? {}}
          onChange={(next) => {
            setVerdicts(({ [grainCopy.id]: _dropped, ...rest }) => rest);
            onAnswerChange(grainCopy, next);
          }}
          readOnly={readOnly}
        />

        {checkable && (
          <div className="d-flex flex-column align-items-center gap-16 mt-24">
            {verdict ? (
              <Alert type={verdict === 'correct' ? 'success' : verdict === 'partial' ? 'warning' : 'danger'}>
                <span className="exercizer-large-verdict">{t(`exercizer.large.verdict.${verdict}`)}</span>
              </Alert>
            ) : (
              <Button
                color="primary"
                variant="filled"
                size="lg"
                disabled={readOnly || !hasAnswer(grainCopy)}
                onClick={check}
              >
                {t('exercizer.large.check')}
              </Button>
            )}
          </div>
        )}
      </article>

      <div className="d-flex justify-content-end gap-16 flex-wrap">{actions}</div>
    </div>
  );
}

/**
 * Lecture à voix haute par la synthèse vocale du navigateur, dans la langue de la page. Rien n'est
 * envoyé à un service : la voix est celle du système. Un second appui arrête la lecture.
 */
function useSpeech() {
  const available = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);

  const stop = useCallback(() => {
    if (!available) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [available]);

  const speak = useCallback(
    (text: string) => {
      if (!available) return;
      const synth = window.speechSynthesis;
      if (synth.speaking) return stop();
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      // Repli sur la locale de la session plutôt que sur le français : la synthèse vocale
      // doit lire l'énoncé dans la langue où il est affiché.
      utterance.lang = document.documentElement.lang || dateLocale();
      // Un peu plus lent que la voix par défaut : elle s'adresse à de jeunes enfants.
      utterance.rate = 0.9;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(utterance);
    },
    [available, stop],
  );

  return { speak, stop, speaking, available };
}

/**
 * Deux notes montantes pour une bonne réponse, une note grave sinon — synthétisées sur place, sans
 * fichier son à servir. Silencieux si le navigateur refuse l'audio.
 */
function playVerdict(verdict: Verdict) {
  try {
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const notes = verdict === 'correct' ? [660, 880] : verdict === 'partial' ? [523] : [220];
    notes.forEach((frequency, rank) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + rank * 0.15;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
    window.setTimeout(() => void context.close(), 1000);
  } catch {
    // Pas de son : le verdict reste affiché.
  }
}

export default LargePerform;
