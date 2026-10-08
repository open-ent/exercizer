import { Badge, Button, Card } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  canCreateTraining,
  copyState,
  copyStateColorClass,
  copyStateKey,
  DominoAction,
  dominoAction,
  isPerformDisabled,
  isTooLate,
  cannotStartYet,
} from '../copies';
import { SubjectCopy, SubjectScheduled } from '../types';
import { formatDateTime } from '../utils';

/**
 * Niveau d'alerte de la pastille d'état. L'IHM AngularJS posait des classes de couleur
 * (`color-corrected`, `color-is-submitted`, …) propres au module ; on les traduit vers les
 * niveaux du socle pour ne pas réintroduire une feuille de styles parallèle.
 */
function badgeLevel(copy: SubjectCopy): 'success' | 'warning' | 'info' {
  switch (copyState(copy)) {
    case 'is_corrected':
    case 'is_done':
      return 'success';
    case 'is_correction_on_going':
    case 'is_on_going':
      return 'warning';
    default:
      return 'info';
  }
}

export interface CopyCardProps {
  copy: SubjectCopy;
  scheduled?: SubjectScheduled;
  /** Ouverture de la copie : la nature de l'action est décidée ici et transmise à l'appelant. */
  onOpen: (action: DominoAction, copy: SubjectCopy, scheduled: SubjectScheduled) => void;
  /** Création d'une copie d'entraînement, quand le sujet l'autorise. */
  onCreateTraining?: (scheduled: SubjectScheduled) => void;
}

/**
 * La vignette d'une copie, côté élève — le « domino » de l'IHM AngularJS
 * (`subject-copy-domino`), rebâti sur la carte du socle.
 *
 * Elle porte l'état de la copie, l'échéance (ou la date d'ouverture quand le sujet n'est pas
 * encore accessible), le score quand il est consultable, et l'entrée vers l'entraînement.
 * Tout ce qui RELÈVE D'UNE RÈGLE est délégué à `copies.ts` : ce composant ne décide rien.
 */
export function CopyCard({ copy, scheduled, onOpen, onCreateTraining }: CopyCardProps) {
  const { t } = useTranslation(['exercizer', 'common']);

  // Une copie dont le sujet distribué n'est pas (encore) chargé n'est pas affichable : son titre,
  // ses dates et son barème vivent sur le sujet, pas sur la copie.
  if (!scheduled) return null;

  const at = t('exercizer.at');
  const action = dominoAction(scheduled, copy);
  const stateKey = copyStateKey(copy);
  const notYetOpen = cannotStartYet(scheduled);
  const late = isTooLate(scheduled, copy);
  const disabled = action === 'text' || (action === 'perform' && isPerformDisabled(copy));
  const trainingAvailable = canCreateTraining(scheduled, copy);
  // L'IHM AngularJS n'affichait le score que pour les sujets « interactifs » (à grains).
  const showScore = scheduled.type === 'interactive';
  const scoreReadable = copy.is_corrected === true;
  const score = copy.is_training_copy ? copy.calculated_score : copy.final_score;

  return (
    <Card
      className="mb-16"
      isClickable={!disabled}
      onClick={disabled ? undefined : () => onOpen(action, copy, scheduled)}
    >
      <Card.Body>
        <Card.Image imageSrc={scheduled.picture || illuExercizer} variant="small" />
        <div className="d-flex flex-column gap-4 flex-fill">
          <div className="d-flex align-items-center gap-8 flex-wrap">
            {stateKey && (
              <Badge
                variant={{ type: 'content', level: badgeLevel(copy), background: true }}
                // Classe d'origine conservée en crochet de test : les specs e2e et la
                // documentation s'appuient dessus pour reconnaître un état sans lire le libellé.
                className={copyStateColorClass(copy) ?? undefined}
              >
                {t(stateKey)}
              </Badge>
            )}
            <Card.Title>{scheduled.title || t('exercizer.domino.default.title')}</Card.Title>
          </div>

          <Card.Text>
            {t('exercizer.domino.by')}{' '}
            <a href={`/userbook/annuaire#${scheduled.owner}`}>{scheduled.owner_username}</a>
          </Card.Text>

          {/* Échéances. Avant l'ouverture, c'est la date d'accès qui compte ; ensuite, la date de
              rendu tant que la copie n'est pas rendue, puis le rendu et la mise à disposition du
              corrigé. Même enchaînement que le gabarit d'origine. */}
          {notYetOpen ? (
            <Card.Text className="text-muted">
              {t('exercizer.domino.access')} {formatDateTime(scheduled.begin_date, at)}
            </Card.Text>
          ) : copy.is_training_copy ? (
            <Card.Text className="text-muted">
              {copy.submitted_date
                ? `${t('exercizer.copy.last.training')} ${formatDateTime(copy.submitted_date, at)}`
                : t('exercizer.copy.no.score.yet')}
            </Card.Text>
          ) : copy.submitted_date ? (
            <>
              <Card.Text className="text-muted">
                {t('exercizer.domino.delivered')} {formatDateTime(copy.submitted_date, at)}
              </Card.Text>
              <Card.Text className="text-muted">
                {t('exercizer.corrected.available')}{' '}
                {formatDateTime(scheduled.corrected_date || scheduled.due_date, at)}
              </Card.Text>
            </>
          ) : (
            <Card.Text className={late ? 'text-danger' : 'text-muted'}>
              {t('exercizer.domino.todelivered')} {formatDateTime(scheduled.due_date, at)}
            </Card.Text>
          )}
        </div>

        {showScore && (
          <div className="d-flex align-items-center px-16 fw-bold text-nowrap">
            {scoreReadable && score !== null && score !== undefined
              ? `${formatScore(score)}/${scheduled.max_score ?? 0}`
              : `-/${scheduled.max_score ?? 0}`}
          </div>
        )}
      </Card.Body>

      {/* L'entraînement n'est proposé qu'après rendu, et seulement sur les sujets qui l'autorisent.
          Quand il n'est pas encore possible, le motif est dit plutôt que le bouton masqué. */}
      {copy.submitted_date && !copy.is_training_copy && (
        <Card.Footer>
          {trainingAvailable ? (
            <Button
              color="primary"
              variant="outline"
              onClick={(event) => {
                // La carte entière est cliquable : sans cela, demander un entraînement ouvrirait
                // aussi la copie.
                event.stopPropagation();
                onCreateTraining?.(scheduled);
              }}
            >
              {t('exercizer.scheduled.subject.training.get.full')}
            </Button>
          ) : (
            <small className="text-muted">
              {scheduled.is_training_permitted
                ? t('exercizer.scheduled.subject.training.get.soon.full')
                : t('exercizer.scheduled.subject.training.get.unavailable.full')}
            </small>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}

/** Deux décimales au plus, sans arrondi trompeur — reprend le filtre `truncateNumber`. */
function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default CopyCard;
