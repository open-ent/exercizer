import { Button, Modal } from '@open-ent/react';
import {
  IconBulletList,
  IconRafterDown,
  IconRafterLeft,
  IconRafterRight,
} from '@open-ent/react/icons';
import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { copyQuestionNumber, isQuestion } from '../../grains';
import { referenceStatement, statementBlocks } from '../../navigation';
import { SectionGroup, sectionProgress } from '../../sections';
import { GrainCopy, ScheduledSection } from '../../types';
import { GrainCopyDocuments, GrainCopyStatement } from './GrainCopyHeader';

type CopyGroup = SectionGroup<ScheduledSection, GrainCopy>;

export interface CopyNavigatorProps {
  groups: CopyGroup[];
  grainCopies: GrainCopy[];
  /** Les grains de la page affichée : un seul en mode question, toute une partie en mode section. */
  currentIds: number[];
  /** En mode section, la page est la partie entière : aucun grain n'est surligné. */
  highlight?: boolean;
  onSelect: (grainCopy: GrainCopy) => void;
  /** Pastille « répondu » et avancement des blocs ; absent, rien n'est compté. */
  hasAnswer?: (grainCopy: GrainCopy) => boolean;
  /** Entrée « Résumé » en tête du sommaire (passation élève). */
  summary?: { current: boolean; onSelect: () => void };
  onPrevious?: () => void;
  onNext?: () => void;
  /** La page affichée : questions, résumé… */
  children: ReactNode;
}

/**
 * Le sommaire d'une copie et la page affichée — commun à la passation et à son aperçu.
 *
 * Un sujet de 60 grains faisait un sommaire bien plus haut que la question : on cliquait la
 * 29e tout en bas, et la question s'affichait en haut, hors de vue. D'où :
 * - sur grand écran, le sommaire reste à l'écran et défile seul, l'entrée courante toujours
 *   visible ; à chaque changement de page, la page remonte au début de la question ;
 * - sur petit écran, le sommaire, qui passait AU-DESSUS de la question, devient une barre
 *   (« Question 29 sur 62 », ‹ ›) qui l'ouvre dans une fenêtre ;
 * - chaque énoncé et ses questions forment un bloc, replié tant qu'on n'y est pas.
 */
export function CopyNavigator({
  groups,
  grainCopies,
  currentIds,
  highlight = true,
  onSelect,
  hasAnswer,
  summary,
  onPrevious,
  onNext,
  children,
}: CopyNavigatorProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Blocs dépliés à la main ; celui de la page affichée l'est toujours. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const stageRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const onSummary = !!summary?.current;
  const pageKey = onSummary ? 'summary' : currentIds.join(',');

  // Changement de page : on remonte au début de la page si elle a quitté l'écran — on venait de
  // cliquer tout en bas du sommaire, ou sur « Suivant » sous une longue question. Le focus suit,
  // pour qu'un lecteur d'écran enchaîne sur la question.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    const bar = barRef.current;
    const covered = bar && bar.offsetParent ? bar.getBoundingClientRect().bottom : 0;
    if (stage.getBoundingClientRect().top < covered) {
      window.scrollBy({ top: stage.getBoundingClientRect().top - covered - 16 });
    }
    stage.focus({ preventScroll: true });
  }, [pageKey]);

  // Le sommaire défile seul : l'entrée courante y reste visible.
  useEffect(() => {
    const nav = navRef.current;
    const item = nav?.querySelector<HTMLElement>('[aria-current]');
    if (!nav || !item) return;
    const box = nav.getBoundingClientRect();
    const rect = item.getBoundingClientRect();
    if (rect.top < box.top || rect.bottom > box.bottom) {
      nav.scrollTop += rect.top - box.top - box.height / 3;
    }
  }, [pageKey]);

  const isCurrent = (grainCopy: GrainCopy) => !onSummary && currentIds.includes(grainCopy.id);
  const current = grainCopies.find((grainCopy) => grainCopy.id === currentIds[0]);
  const questions = grainCopies.filter((grainCopy) => isQuestion(grainCopy.grain_type_id));
  const position = current ? grainCopies.indexOf(current) + 1 : 0;

  const label = (grainCopy: GrainCopy) =>
    isQuestion(grainCopy.grain_type_id)
      ? `${copyQuestionNumber(grainCopy, grainCopies)}) ${grainCopy.grain_copy_data.title ?? ''}`
      : grainCopy.grain_copy_data.title || t('exercizer.statement');

  const currentLabel = (() => {
    if (onSummary) return t('exercizer.summary');
    if (!current) return '';
    if (!highlight) {
      return groups.find((group) => group.grains.includes(current))?.section?.title ?? label(current);
    }
    return label(current);
  })();
  const currentPosition =
    !onSummary && highlight && current && isQuestion(current.grain_type_id)
      ? t('exercizer.nav.question.position', {
          current: copyQuestionNumber(current, grainCopies),
          total: questions.length,
          defaultValue: 'Question [[current]] sur [[total]]',
        })
      : null;

  const toggle = (key: string) =>
    setExpanded((keys) => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderList = (select: (grainCopy: GrainCopy) => void, onSelectSummary?: () => void) => (
    <div className="d-flex flex-column gap-16">
      {summary && (
        <button
          type="button"
          data-nav-summary
          className={`btn btn-sm w-100 text-start ${onSummary ? 'btn-filled btn-secondary' : 'btn-ghost btn-tertiary'}`}
          aria-current={onSummary ? 'step' : undefined}
          onClick={onSelectSummary}
        >
          {t('exercizer.summary')}
        </button>
      )}
      {groups.map((group) => {
        const groupKey = group.section ? `section-${group.section.id}` : 'ungrouped';
        const progress = hasAnswer ? sectionProgress(group.grains, hasAnswer) : null;
        return (
          <div key={groupKey}>
            {group.section && (
              <button
                type="button"
                className="btn btn-ghost btn-tertiary btn-sm w-100 text-start fw-bold d-flex justify-content-between gap-8"
                onClick={() => select(group.grains[0])}
              >
                <span className="text-truncate">{group.section.title}</span>
                {progress && progress.total > 0 && (
                  <small
                    className={progress.answered === progress.total ? 'text-success' : 'text-muted'}
                    aria-label={`${progress.answered}/${progress.total} ${t('exercizer.copy.answered')}`}
                  >
                    {progress.answered}/{progress.total}
                  </small>
                )}
              </button>
            )}
            <ol className={`list-unstyled d-flex flex-column gap-4 m-0 ${group.section ? 'ps-16' : ''}`}>
              {statementBlocks(group.grains).map((block) => {
                const key = block.statement ? `statement-${block.statement.id}` : `${groupKey}-head`;
                const here = [...(block.statement ? [block.statement] : []), ...block.questions].some(isCurrent);
                const collapsible = !!block.statement && block.questions.length > 0 && !here;
                const open = !collapsible || expanded.has(key);
                const answered = hasAnswer ? block.questions.filter(hasAnswer).length : null;
                return (
                  <li key={key} data-nav-block>
                    {block.statement && (
                      <div className="d-flex align-items-center gap-4">
                        {item(block.statement, select, 'fw-bold flex-fill')}
                        {collapsible && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-tertiary btn-sm d-flex align-items-center gap-4 text-nowrap"
                            aria-expanded={open}
                            aria-label={t(open ? 'exercizer.nav.collapse' : 'exercizer.nav.expand', {
                              defaultValue: open ? 'Masquer les questions' : 'Afficher les questions',
                            })}
                            data-nav-toggle
                            onClick={() => toggle(key)}
                          >
                            <small className={answered === block.questions.length ? 'text-success' : 'text-muted'}>
                              {answered === null
                                ? block.questions.length
                                : `${answered}/${block.questions.length}`}
                            </small>
                            {open ? <IconRafterDown width={16} height={16} /> : <IconRafterRight width={16} height={16} />}
                          </button>
                        )}
                      </div>
                    )}
                    {open && block.questions.length > 0 && (
                      <ol className={`list-unstyled d-flex flex-column gap-4 m-0 mt-4 ${block.statement ? 'ps-16' : ''}`}>
                        {block.questions.map((grainCopy) => (
                          <li key={grainCopy.id}>{item(grainCopy, select)}</li>
                        ))}
                      </ol>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );

  function item(grainCopy: GrainCopy, select: (grainCopy: GrainCopy) => void, extra = '') {
    const here = isCurrent(grainCopy);
    return (
      <button
        type="button"
        className={`btn btn-sm w-100 text-start ${extra} ${
          here && highlight ? 'btn-filled btn-secondary' : 'btn-ghost btn-tertiary'
        }`}
        aria-current={here ? 'step' : undefined}
        onClick={() => select(grainCopy)}
      >
        {label(grainCopy)}
        {hasAnswer && isQuestion(grainCopy.grain_type_id) && hasAnswer(grainCopy) && (
          <span className="text-success ms-4" aria-hidden="true">
            ✓
          </span>
        )}
      </button>
    );
  }

  const modalId = useId();
  const closeAnd = (action: () => void) => () => {
    setDrawerOpen(false);
    action();
  };

  return (
    <div className="exercizer-copy-layout">
      {/* Petit écran : une barre à la place du sommaire, qui l'ouvre à la demande. */}
      <div ref={barRef} className="exercizer-copy-bar d-lg-none card p-8 mb-16" data-nav-bar>
        <div className="d-flex align-items-center gap-8">
          <Button
            color="tertiary"
            variant="ghost"
            size="sm"
            aria-label={t('exercizer.previous')}
            disabled={!onPrevious}
            onClick={onPrevious}
          >
            <IconRafterLeft width={20} height={20} />
          </Button>
          <button
            type="button"
            className="btn btn-ghost btn-tertiary flex-fill text-start d-flex align-items-center gap-8 overflow-hidden"
            aria-haspopup="dialog"
            data-nav-open
            onClick={() => setDrawerOpen(true)}
          >
            <IconBulletList width={20} height={20} className="flex-shrink-0" />
            <span className="d-flex flex-column overflow-hidden">
              {currentPosition && <small className="text-muted">{currentPosition}</small>}
              <span className="text-truncate">{currentLabel}</span>
            </span>
          </button>
          <Button
            color="tertiary"
            variant="ghost"
            size="sm"
            aria-label={t('exercizer.next')}
            disabled={!onNext}
            onClick={onNext}
          >
            <IconRafterRight width={20} height={20} />
          </Button>
        </div>
        {grainCopies.length > 1 && (
          <div
            className="exercizer-copy-progress mt-8"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={grainCopies.length}
            aria-valuenow={onSummary ? 0 : position}
            aria-label={t('exercizer.nav.contents', { defaultValue: 'Sommaire' })}
          >
            <span style={{ width: `${((onSummary ? 0 : position) / grainCopies.length) * 100}%` }} />
          </div>
        )}
      </div>

      <div className="grid gap-24">
        <aside className="d-none d-lg-block g-col-lg-3">
          <nav
            ref={navRef}
            aria-label={t('exercizer.rank')}
            className="exercizer-copy-nav"
            data-nav-sidebar
          >
            {renderList(onSelect, summary?.onSelect)}
          </nav>
        </aside>

        <section ref={stageRef} tabIndex={-1} className="exercizer-copy-stage g-col-12 g-col-lg-9">
          {children}
        </section>
      </div>

      {drawerOpen && (
        <Modal id={modalId} isOpen onModalClose={() => setDrawerOpen(false)} size="md" scrollable>
          <Modal.Header onModalClose={() => setDrawerOpen(false)}>
            {t('exercizer.nav.contents', { defaultValue: 'Sommaire' })}
          </Modal.Header>
          <Modal.Body>
            <nav aria-label={t('exercizer.rank')} data-nav-drawer>
              {renderList(
                (grainCopy) => closeAnd(() => onSelect(grainCopy))(),
                summary ? closeAnd(summary.onSelect) : undefined,
              )}
            </nav>
          </Modal.Body>
        </Modal>
      )}
    </div>
  );
}

/**
 * L'énoncé auquel se rapporte la question affichée, rappelé au-dessus d'elle : sans lui, à la
 * 29e question d'un questionnaire, il fallait revenir en arrière pour relire le texte.
 *
 * Déplié sur la première question qui le suit, replié ensuite — il reste à un clic.
 */
export function ReferenceStatement({
  grainCopy,
  groupGrains,
}: {
  grainCopy: GrainCopy;
  /** Les grains de la partie de la question, dans l'ordre où l'élève les voit. */
  groupGrains: GrainCopy[];
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const reference = referenceStatement(grainCopy, groupGrains);
  if (!reference) return null;
  const { statement, first } = reference;
  const hasContent =
    !!statement.grain_copy_data.custom_copy_data?.statement ||
    (statement.grain_copy_data.document_list ?? []).length > 0;
  if (!hasContent) return null;
  return (
    // La clé suit la question : chaque question repart de son état par défaut.
    <details key={grainCopy.id} open={first} className="exercizer-reference card mb-16" data-reference-statement>
      <summary className="p-12 fw-bold">
        {t('exercizer.nav.reference', { defaultValue: 'Texte de référence' })}
        {statement.grain_copy_data.title ? ` — ${statement.grain_copy_data.title}` : ''}
      </summary>
      <div className="px-16 pb-4">
        <GrainCopyStatement grainCopy={statement} />
        <GrainCopyDocuments grainCopy={statement} />
      </div>
    </details>
  );
}
