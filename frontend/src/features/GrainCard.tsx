import { Alert, Button, FormControl, IconButton, Input, Label, Modal, TextArea } from '@open-ent/react';
import { IconCopy, IconDelete, IconRafterDown, IconRafterUp } from '@open-ent/react/icons';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmModal } from '../components/ConfirmModal';
import {
  convertGrainData,
  GRAIN,
  isScorm,
  isZoneType,
  isQuestion,
  isUndecided,
  questionNumber,
  sanitizeScore,
  statementOf,
  withEditableAnswers,
} from '../grains';
import { Grain, GrainCustomData, GrainData, GrainType } from '../types';
import { GrainTypeIcon } from './GrainTypeIcon';
import { GrainTypePicker } from './GrainTypePicker';
import { AssociationEditor, MultipleAnswerEditor, OrderEditor, QcmEditor } from './grains/ListTypes';
import { OpenAnswerEditor, SimpleAnswerEditor } from './grains/SimpleTypes';
import { ScormGrainNotice } from './grains/ScormGrainNotice';
import { ZoneEditor } from './zones/ZoneEditors';
import { RichTextEditor } from './RichTextEditor';

export interface GrainCardProps {
  grain: Grain;
  grains: Grain[];
  grainTypes: GrainType[];
  /** Modification locale, enregistrée au bout d'un instant (cf. `useGrainSave`). */
  onChange: (grain: Grain) => void;
  /** L'enseignant a choisi le type d'un grain neuf : enregistré tout de suite. */
  onPickType: (grain: Grain, grainTypeId: number) => void;
  /** L'enseignant change le type d'un grain déjà décidé : contenu converti, enregistré tout de suite. */
  onChangeType: (grain: Grain, grainTypeId: number) => void;
  onDuplicate: (grain: Grain) => void;
  onRemove: (grain: Grain) => void;
  /**
   * Sujet à sections : les sections où l'on peut ranger le grain (`id` nul = hors section), et le
   * rangement demandé. Absent sur un sujet sans section — l'action n'est alors pas proposée.
   */
  sectionTargets?: Array<{ id: number | null; label: string }>;
  onMoveToSection?: (grain: Grain, sectionId: number | null) => void;
  /** Rang du grain dans la partie affichée, et nombre de grains qu'elle compte (« 2 / 15 »). */
  position?: { index: number; total: number };
  /** Grain replié : seul son en-tête reste visible. */
  collapsed?: boolean;
  onToggleCollapsed?: (grain: Grain) => void;
  /** Grain en cours d'édition : encadré, et surligné dans le plan. */
  active?: boolean;
  onActivate?: (grain: Grain) => void;
}

/**
 * Un grain dans l'éditeur de sujet — portage du gros `ng-repeat` de `edit-subject.html`.
 *
 * Trois visages selon le type :
 *  - 1 et 2 : le grain n'est pas encore décidé, on propose d'abord « énoncé ou question », puis
 *    le type de question ;
 *  - 3 : un énoncé — un titre et du texte riche, sans barème ni correction ;
 *  - au-delà : une question — titre, barème, énoncé, contenu propre au type, puis l'aide et
 *    l'explication.
 */
export function GrainCard({
  grain,
  grains,
  grainTypes,
  onChange,
  onPickType,
  onChangeType,
  onDuplicate,
  onRemove,
  sectionTargets,
  onMoveToSection,
  position,
  collapsed = false,
  onToggleCollapsed,
  active = false,
  onActivate,
}: GrainCardProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const type = grainTypes.find((item) => item.id === grain.grain_type_id);
  const typeName = type ? t(type.public_name) : '';
  const changeTypeId = useId();
  const [choosingType, setChoosingType] = useState(false);
  /** Type choisi dont la conversion perdrait du contenu : en attente de confirmation. */
  const [lossyTypeId, setLossyTypeId] = useState<number | null>(null);
  // Un paquet SCORM ne se convertit pas, et un grain illisible ne se réécrit pas.
  const canChangeType = !isScorm(grain.grain_type_id) && !grain.unreadable;

  const chooseType = (grainTypeId: number) => {
    setChoosingType(false);
    if (convertGrainData(grain.grain_type_id, grainTypeId, grain.grain_data).lost) {
      setLossyTypeId(grainTypeId);
    } else {
      onChangeType(grain, grainTypeId);
    }
  };

  const patchData = (patch: Partial<GrainData>) =>
    onChange({ ...grain, grain_data: { ...grain.grain_data, ...patch } });
  const patchCustom = (custom_data: GrainCustomData) => patchData({ custom_data });

  // Complété des lignes vides nécessaires à la saisie : l'enregistrement écarte celles qu'on n'a
  // pas remplies, un grain à peine commencé reviendrait donc sans aucune ligne.
  const customData = withEditableAnswers(grain.grain_type_id, grain.grain_data.custom_data ?? {});

  return (
    <article
      className={`card exercizer-grain mb-16${active ? ' is-active' : ''}`}
      id={`grain-edit-${grain.id}`}
      onFocusCapture={() => onActivate?.(grain)}
      onMouseDownCapture={() => onActivate?.(grain)}
    >
      {/* ── En-tête : le type (et de quoi le changer), le titre, la position, les actions ── */}
      <header className="exercizer-grain-header d-flex flex-wrap align-items-center gap-8 px-16 py-8">
        {isUndecided(grain.grain_type_id) ? (
          <span className="fw-bold">{t('exercizer.grain.new', { defaultValue: 'Nouveau bloc' })}</span>
        ) : canChangeType ? (
          <Button
            color="secondary"
            variant="ghost"
            size="sm"
            className="exercizer-grain-type"
            leftIcon={type ? <GrainTypeIcon name={type.name} size={18} /> : undefined}
            rightIcon={<IconRafterDown style={{ width: 12, height: 12 }} />}
            aria-label={`${typeName} — ${t('exercizer.grain.type.change')}`}
            title={t('exercizer.grain.type.change')}
            onClick={() => setChoosingType(true)}
          >
            {typeName}
          </Button>
        ) : (
          <span className="d-inline-flex align-items-center gap-8 small fw-bold text-gray-700">
            {type && <GrainTypeIcon name={type.name} size={18} />}
            {typeName}
          </span>
        )}
        {/* Le numéro ne compte que les QUESTIONS : intercaler un énoncé ne décale rien. */}
        {isQuestion(grain.grain_type_id) && (
          <small className="fw-bold text-gray-700">
            {t('exercizer.grain.question.number', {
              n: questionNumber(grain, grains),
              defaultValue: 'Question [[n]]',
            })}
          </small>
        )}
        {(grain.grain_type_id === GRAIN.STATEMENT || isQuestion(grain.grain_type_id)) && (
          <FormControl
            id={`grain-${grain.grain_type_id === GRAIN.STATEMENT ? 'statement-' : ''}title-${grain.id}`}
            className="flex-fill exercizer-grain-title"
          >
            <Input
              type="text"
              size="md"
              maxLength={255}
              aria-label={
                grain.grain_type_id === GRAIN.STATEMENT
                  ? t('exercizer.grain.type.statement.title.placeholder')
                  : t('exercizer.grain.title')
              }
              placeholder={
                grain.grain_type_id === GRAIN.STATEMENT
                  ? t('exercizer.grain.type.statement.title.placeholder')
                  : t('exercizer.grain.title')
              }
              value={grain.grain_data.title ?? ''}
              onChange={(event) => patchData({ title: event.target.value })}
            />
          </FormControl>
        )}
        <div className="d-flex align-items-center gap-4 ms-auto">
          {position && (
            <small className="text-gray-700 text-nowrap me-4">
              {position.index} / {position.total}
            </small>
          )}
          {!isUndecided(grain.grain_type_id) && (
            <IconButton
              color="tertiary"
              variant="ghost"
              size="sm"
              icon={<IconCopy />}
              aria-label={t('exercizer.duplicate')}
              title={t('exercizer.duplicate')}
              onClick={() => onDuplicate(grain)}
            />
          )}
          <IconButton
            color="danger"
            variant="ghost"
            size="sm"
            icon={<IconDelete />}
            aria-label={t('exercizer.remove')}
            title={t('exercizer.remove')}
            onClick={() => onRemove(grain)}
          />
          {onToggleCollapsed && (
            <IconButton
              color="tertiary"
              variant="ghost"
              size="sm"
              icon={collapsed ? <IconRafterDown /> : <IconRafterUp />}
              aria-expanded={!collapsed}
              aria-controls={`grain-body-${grain.id}`}
              aria-label={
                collapsed
                  ? t('exercizer.grain.expand', { defaultValue: 'Déplier le bloc' })
                  : t('exercizer.grain.collapse', { defaultValue: 'Replier le bloc' })
              }
              title={
                collapsed
                  ? t('exercizer.grain.expand', { defaultValue: 'Déplier le bloc' })
                  : t('exercizer.grain.collapse', { defaultValue: 'Replier le bloc' })
              }
              onClick={() => onToggleCollapsed(grain)}
            />
          )}
        </div>
      </header>

      <div className="p-16" id={`grain-body-${grain.id}`} hidden={collapsed}>
        {/* Données illisibles : toute modification serait refusée (jamais d'écrasement de l'original) ; on le dit d'emblée. */}
        {grain.unreadable && (
          <div data-unreadable>
            <Alert type="danger" className="mb-16">
            {t('exercizer.grain.unreadable.teacher', { defaultValue: "Les données de cette question sont illisibles : elle ne peut pas être modifiée, pour ne pas écraser l'original. Supprimez-la ou recréez-la." })}
          </Alert>
          </div>
        )}

        {/* ── Premier pas : énoncé ou question ? ── */}
        {grain.grain_type_id === GRAIN.CHOOSE && (
          <div className="d-flex flex-wrap gap-8">
            <Button
              color="primary"
              variant="outline"
              onClick={() => onPickType(grain, GRAIN.STATEMENT)}
            >
              {t('exercizer.statement.new')}
            </Button>
            <Button
              color="primary"
              variant="outline"
              onClick={() => onPickType(grain, GRAIN.CHOOSE_ANSWER)}
            >
              {t('exercizer.question.new')}
            </Button>
          </div>
        )}

        {/* ── Second pas : quel type de question ? ── */}
        {grain.grain_type_id === GRAIN.CHOOSE_ANSWER && (
          <GrainTypePicker
            grainTypes={grainTypes}
            onPick={(grainTypeId) => onPickType(grain, grainTypeId)}
          />
        )}

        {/* ── Énoncé (type 3) ── */}
        {grain.grain_type_id === GRAIN.STATEMENT && (
          <div className="d-flex flex-column gap-16">
            {/* Lecture tolérante : certains grains anciens portent l'énoncé à plat sur
                `grain_data`. L'écriture, elle, va toujours dans `custom_data`. */}
            <RichTextEditor
              id={`grain-statement-${grain.id}`}
              content={statementOf(grain.grain_data)}
              placeholder={t('exercizer.grain.type.statement.description.placeholder')}
              onChange={(statement) => patchCustom({ ...customData, statement })}
            />
          </div>
        )}

        {/* ── Question (types 4 et au-delà) ── */}
        {isQuestion(grain.grain_type_id) && (
          <div className="d-flex flex-column gap-16">
            <div className="d-flex flex-wrap align-items-end gap-16">
              <div style={{ width: '10rem' }}>
                <FormControl id={`grain-score-${grain.id}`}>
                  <Label>{t('exercizer.score')}</Label>
                  <Input
                    type="text"
                    size="md"
                    inputMode="decimal"
                    // Le barème reste une CHAÎNE pendant la saisie : forcer un nombre empêcherait
                    // de taper « 1, » puis « 5 ». Il est assaini à l'enregistrement.
                    value={String(grain.grain_data.max_score ?? '')}
                    onChange={(event) => patchData({ max_score: event.target.value })}
                  />
                </FormControl>
                {sanitizeScore(grain.grain_data.max_score) === 0 && (
                  // Un barème à zéro n'est pas une erreur, mais rend la question sans effet sur la
                  // note : l'ancienne IHM le signalait par une bordure orange, on le dit en mots.
                  <small className="text-warning">{t('exercizer.grain.score.zero')}</small>
                )}
              </div>
            </div>

            <FormControl id={`grain-statement-${grain.id}`}>
              <Label>{t('exercizer.statement')}</Label>
              <RichTextEditor
                content={grain.grain_data.statement}
                placeholder={t('exercizer.grain.statement.placeholder')}
                onChange={(statement) => patchData({ statement })}
              />
            </FormControl>

            {/* Documents attachés : conservés pour les grains anciens, plus proposés à l'ajout. */}
            {(grain.grain_data.document_list?.length ?? 0) > 0 && (
              <section>
                {/* Un `Label` du socle exige lui aussi un `FormControl` ; ici il n'y a pas de champ
                    à étiqueter, seulement un intitulé de liste. */}
                <p className="form-label">{t('exercizer.grain.document')}</p>
                <ul>
                  {grain.grain_data.document_list?.map((doc) => (
                    <li key={doc.id}>
                      <a href={doc.path ?? `/workspace/document/${doc.id}`} target="_blank" rel="noreferrer">
                        {doc.name ?? doc.title ?? doc.id}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Contenu propre au type ── */}
            {grain.grain_type_id === GRAIN.SCORM ? (
              // Un module SCORM n'a rien à éditer ici : on remplace le paquet, on ne retouche pas
              // son contenu.
              <ScormGrainNotice grain={grain} />
            ) : isZoneType(grain.grain_type_id) ? (
              <ZoneEditor
                grainTypeId={grain.grain_type_id}
                customData={customData}
                onChange={patchCustom}
              />
            ) : grain.grain_type_id === GRAIN.SIMPLE_ANSWER ? (
              <SimpleAnswerEditor customData={customData} onChange={patchCustom} />
            ) : grain.grain_type_id === GRAIN.OPEN_ANSWER ? (
              <OpenAnswerEditor customData={customData} onChange={patchCustom} />
            ) : grain.grain_type_id === GRAIN.MULTIPLE_ANSWERS ? (
              <MultipleAnswerEditor customData={customData} onChange={patchCustom} />
            ) : grain.grain_type_id === GRAIN.QCM ? (
              <QcmEditor customData={customData} onChange={patchCustom} />
            ) : grain.grain_type_id === GRAIN.ASSOCIATION ? (
              <AssociationEditor customData={customData} onChange={patchCustom} />
            ) : grain.grain_type_id === GRAIN.ORDER_BY ? (
              <OrderEditor customData={customData} onChange={patchCustom} />
            ) : null}

            {/* ── Aide et explication ── */}
            <div className="grid gap-16">
              <FormControl id={`grain-hint-${grain.id}`} className="g-col-12 g-col-md-6">
                <Label>{t('exercizer.grain.help')}</Label>
                <small className="d-block text-muted mb-4">
                  {t('exercizer.grain.help.tooltip')}
                </small>
                <TextArea
                  size="md"
                  value={grain.grain_data.answer_hint ?? ''}
                  onChange={(event) => patchData({ answer_hint: event.target.value })}
                />
              </FormControl>
              <FormControl id={`grain-explanation-${grain.id}`} className="g-col-12 g-col-md-6">
                <Label>{t('exercizer.grain.explanation')}</Label>
                <small className="d-block text-muted mb-4">
                  {t('exercizer.grain.explanation.tooltip')}
                </small>
                <TextArea
                  size="md"
                  value={grain.grain_data.answer_explanation ?? ''}
                  onChange={(event) => patchData({ answer_explanation: event.target.value })}
                />
              </FormControl>
            </div>
          </div>
        )}

        {/* ── Rangement dans une autre partie ── */}
        {sectionTargets && onMoveToSection && sectionTargets.length > 1 && (
          <footer className="d-flex flex-wrap align-items-center gap-8 mt-16">
            <label className="d-flex align-items-center gap-8">
              <small className="text-gray-700">{t('exercizer.section.move.to')}</small>
              <select
                className="form-select form-select-sm w-auto"
                value={grain.section_id ?? ''}
                onChange={(event) =>
                  onMoveToSection(grain, event.target.value === '' ? null : Number(event.target.value))
                }
              >
                {sectionTargets.map((target) => (
                  <option key={target.id ?? 'none'} value={target.id ?? ''}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
          </footer>
        )}
      </div>

      {choosingType && (
        <Modal id={changeTypeId} isOpen onModalClose={() => setChoosingType(false)} size="lg" scrollable>
          <Modal.Header onModalClose={() => setChoosingType(false)}>
            {t('exercizer.grain.type.change.title')}
          </Modal.Header>
          <Modal.Body>
            <GrainTypePicker
              grainTypes={grainTypes}
              currentTypeId={grain.grain_type_id}
              onPick={chooseType}
            />
          </Modal.Body>
        </Modal>
      )}
      {lossyTypeId !== null && (
        <ConfirmModal
          title={t('exercizer.grain.type.change.title')}
          confirmLabel={t('exercizer.grain.type.change.confirm')}
          onClose={() => setLossyTypeId(null)}
          onConfirm={() => {
            onChangeType(grain, lossyTypeId);
            setLossyTypeId(null);
          }}
        >
          <p>{t('exercizer.grain.type.change.lost')}</p>
        </ConfirmModal>
      )}
    </article>
  );
}

export default GrainCard;
