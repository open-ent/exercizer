import { Alert, Button, FormControl, Input, Label, TextArea } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import {
  GRAIN,
  isEditableHere,
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
import { ZoneGrainNotice } from './grains/ZoneGrainNotice';
import { RichTextEditor } from './RichTextEditor';

export interface GrainCardProps {
  grain: Grain;
  grains: Grain[];
  grainTypes: GrainType[];
  /** Modification locale, enregistrée au bout d'un instant (cf. `useGrainSave`). */
  onChange: (grain: Grain) => void;
  /** L'enseignant a choisi le type d'un grain neuf : enregistré tout de suite. */
  onPickType: (grain: Grain, grainTypeId: number) => void;
  onDuplicate: (grain: Grain) => void;
  onRemove: (grain: Grain) => void;
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
  onDuplicate,
  onRemove,
}: GrainCardProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const type = grainTypes.find((item) => item.id === grain.grain_type_id);
  const typeName = type ? t(type.public_name) : '';

  const patchData = (patch: Partial<GrainData>) =>
    onChange({ ...grain, grain_data: { ...grain.grain_data, ...patch } });
  const patchCustom = (custom_data: GrainCustomData) => patchData({ custom_data });

  // Complété des lignes vides nécessaires à la saisie : l'enregistrement écarte celles qu'on n'a
  // pas remplies, un grain à peine commencé reviendrait donc sans aucune ligne.
  const customData = withEditableAnswers(grain.grain_type_id, grain.grain_data.custom_data ?? {});

  return (
    <article className="card p-16 mb-16" id={`grain-edit-${grain.id}`}>
      {/* ── En-tête : le type, et le numéro de la question ── */}
      {!isUndecided(grain.grain_type_id) && (
        <header className="d-flex align-items-center gap-8 mb-16">
          {type && <GrainTypeIcon name={type.name} size={20} />}
          <small className="fw-bold text-muted">{typeName}</small>
          {/* Le numéro ne compte que les QUESTIONS : intercaler un énoncé ne décale rien. */}
          {isQuestion(grain.grain_type_id) && (
            <small className="text-muted">{questionNumber(grain, grains)}</small>
          )}
        </header>
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
          <FormControl id={`grain-statement-title-${grain.id}`}>
            <Input
              type="text"
              size="md"
              aria-label={t('exercizer.grain.type.statement.title.placeholder')}
              placeholder={t('exercizer.grain.type.statement.title.placeholder')}
              value={grain.grain_data.title ?? ''}
              onChange={(event) => patchData({ title: event.target.value })}
            />
          </FormControl>
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
            <div className="flex-fill">
              <FormControl id={`grain-title-${grain.id}`}>
                <Label>{t('exercizer.grain.title')}</Label>
                <Input
                  type="text"
                  size="md"
                  maxLength={255}
                  placeholder={t('exercizer.grain.title')}
                  value={grain.grain_data.title ?? ''}
                  onChange={(event) => patchData({ title: event.target.value })}
                />
              </FormControl>
            </div>
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
          {!isEditableHere(grain.grain_type_id) ? (
            <ZoneGrainNotice grain={grain} />
          ) : grain.grain_type_id === GRAIN.SIMPLE_ANSWER ? (
            <SimpleAnswerEditor customData={customData} onChange={patchCustom} />
          ) : grain.grain_type_id === GRAIN.OPEN_ANSWER ? (
            <OpenAnswerEditor />
          ) : grain.grain_type_id === GRAIN.MULTIPLE_ANSWERS ? (
            <MultipleAnswerEditor customData={customData} onChange={patchCustom} />
          ) : grain.grain_type_id === GRAIN.QCM ? (
            <QcmEditor customData={customData} onChange={patchCustom} />
          ) : grain.grain_type_id === GRAIN.ASSOCIATION ? (
            <AssociationEditor customData={customData} onChange={patchCustom} />
          ) : grain.grain_type_id === GRAIN.ORDER_BY ? (
            <OrderEditor customData={customData} onChange={patchCustom} />
          ) : (
            <Alert type="info">{t('exercizer.grain.zone.notmigrated')}</Alert>
          )}

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

      {/* ── Actions du grain ── */}
      <footer className="d-flex justify-content-end gap-8 mt-16">
        {!isUndecided(grain.grain_type_id) && (
          <Button color="tertiary" variant="ghost" onClick={() => onDuplicate(grain)}>
            {t('exercizer.duplicate')}
          </Button>
        )}
        <Button color="danger" variant="ghost" onClick={() => onRemove(grain)}>
          {t('exercizer.remove')}
        </Button>
      </footer>
    </article>
  );
}

export default GrainCard;
