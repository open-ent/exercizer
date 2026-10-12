import { Alert, Button, FormControl, Input, Label, Modal } from '@open-ent/react';
import { Editor, type EditorInstance } from '@open-ent/react/editor';
import type { Editor as TiptapEditor } from '@tiptap/core';
import {
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmModal } from '../../components/ConfirmModal';
import { GRAIN } from '../../grains';
import { GrainCustomData, GrainZone } from '../../types';
import {
  AnswersType,
  answersTypeOf,
  BlockKind,
  nextZoneId,
  nextZonePosition,
  pruneZones,
  removeSharedOption,
  switchAnswersType,
  toModel,
  toScreen,
  ZONE_MAX_LENGTH,
} from '../../zones';
import { FILL_ZONE_CLASS, FillZone, insertFillZone } from './FillZoneExtension';
import { PickImageButton, ZoneCanvas, ZoneGeometry } from './ZoneParts';

interface EditorProps {
  customData: GrainCustomData;
  onChange: (next: GrainCustomData) => void;
}

const thumbnail = (url: string) =>
  url.startsWith('/workspace/document/') ? `${url}?thumbnail=120x120` : url;

/**
 * Le choix de la façon de répondre, commun au texte à trous et aux zones de texte.
 *
 * Changer de façon réécrit les propositions des zones existantes : on le fait confirmer dès
 * qu'il y en a (`#WB-460`).
 */
function AnswersTypeSelect({ customData, onChange }: EditorProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const current = answersTypeOf(customData);
  const [pending, setPending] = useState<AnswersType | null>(null);

  return (
    <div className="mb-16">
      <label htmlFor={id} className="form-label">
        {t('exercizer.grain.types')}
      </label>
      <select
        id={id}
        className="form-select w-auto"
        value={current}
        onChange={(event) => {
          const next = event.target.value as AnswersType;
          if ((customData.zones ?? []).length > 0) setPending(next);
          else onChange(switchAnswersType(customData, next));
        }}
      >
        <option value="text">{t('exercizer.grain.option1')}</option>
        <option value="list">{t('exercizer.grain.option2')}</option>
        <option value="drag">{t('exercizer.grain.option3')}</option>
      </select>
      {current === 'text' && (
        // La correction automatique ignore casse, espaces et accents : à savoir avant de rédiger.
        <Alert type="info" className="mt-8">
          {t('exercizer.grain.accent.warning')}
        </Alert>
      )}
      {pending && (
        <ConfirmModal
          title={t('exercizer.grain.filltext.onchange.title')}
          confirmLabel={t('confirm')}
          onClose={() => setPending(null)}
          onConfirm={() => {
            onChange(switchAnswersType(customData, pending));
            setPending(null);
          }}
        >
          <p>{t('exercizer.grain.filltext.onchange.text')}</p>
        </ConfirmModal>
      )}
    </div>
  );
}

/** Les étiquettes communes du mode « glisser-déposer », chacune retirable. */
function SharedOptions({
  options,
  onRemove,
}: {
  options: string[];
  onRemove: (option: string) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  if (options.length === 0) return null;
  return (
    <ul className="list-unstyled d-flex flex-wrap gap-8 mt-16 mb-0">
      {options.map((option, index) => (
        <li key={`${option}-${index}`} className="border rounded px-8 d-flex align-items-center gap-4">
          <span>{option}</span>
          <button
            type="button"
            className="btn btn-sm btn-link p-0 text-danger text-decoration-none"
            aria-label={`${t('exercizer.remove')} ${option}`}
            onClick={() => onRemove(option)}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * La fenêtre d'une zone de texte : sa bonne réponse, et selon la façon de répondre les
 * propositions qui l'entourent — portage des gabarits `editor/text|list|drag.html`.
 *
 *  - `text` : la réponse attendue ;
 *  - `list` : les propositions de CETTE zone, celle qu'on clique est la bonne ;
 *  - `drag` : les étiquettes COMMUNES à toutes les zones, celle qu'on clique est la bonne.
 */
function ZoneDialog({
  type,
  zone,
  sharedOptions,
  isNew,
  onClose,
  onSave,
}: {
  type: AnswersType;
  zone: GrainZone;
  sharedOptions: string[];
  isNew: boolean;
  onClose: () => void;
  onSave: (zone: GrainZone, sharedOptions: string[]) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const [answer, setAnswer] = useState(zone.answer ?? '');
  const [own, setOwn] = useState<string[]>(zone.options ?? []);
  const [shared, setShared] = useState<string[]>(sharedOptions);
  const [draft, setDraft] = useState('');

  const list = type === 'list' ? own : shared;
  const setList = type === 'list' ? setOwn : setShared;

  /** Une proposition ajoutée devient la bonne réponse, comme dans l'ancienne fenêtre. */
  const addOption = () => {
    const option = draft.trim();
    if (!option) return;
    setList([...list, option]);
    setAnswer(option);
    setDraft('');
  };
  const removeOption = (option: string) => {
    const next = [...list];
    next.splice(next.indexOf(option), 1);
    setList(next);
    if (answer === option) setAnswer('');
  };

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="md">
      <Modal.Header onModalClose={onClose}>
        {t(type === 'text' ? 'exercizer.grain.zone' : 'exercizer.grain.responses')}
      </Modal.Header>
      <Modal.Body>
        {type === 'text' ? (
          <FormControl id={`${id}-answer`}>
            <Label>{t('exercizer.grain.zone.add')}</Label>
            <Input
              type="text"
              size="md"
              maxLength={ZONE_MAX_LENGTH}
              value={answer}
              placeholder={t('exercizer.grain.filltext.editor.text.answer')}
              onChange={(event) => setAnswer(event.target.value)}
            />
          </FormControl>
        ) : (
          <>
            <Alert type="info" className="mb-16">
              {t('exercizer.grain.responses.info')}
            </Alert>
            <FormControl id={`${id}-option`}>
              <Label>{t('exercizer.grain.zone.add')}</Label>
              <div className="d-flex gap-8">
                <Input
                  type="text"
                  size="md"
                  maxLength={ZONE_MAX_LENGTH}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addOption();
                    }
                  }}
                />
                <Button color="primary" variant="outline" disabled={!draft.trim()} onClick={addOption}>
                  {t('add')}
                </Button>
              </div>
            </FormControl>
            <ul className="list-unstyled d-flex flex-wrap gap-8 mt-16 mb-0">
              {list.map((option, index) => (
                <li key={`${option}-${index}`} className="d-flex align-items-center gap-4">
                  <Button
                    size="sm"
                    color="primary"
                    variant={option === answer ? 'filled' : 'outline'}
                    aria-pressed={option === answer}
                    onClick={() => setAnswer(option)}
                  >
                    {option}
                  </Button>
                  <button
                    type="button"
                    className="btn btn-sm btn-link p-0 text-danger text-decoration-none"
                    aria-label={`${t('exercizer.remove')} ${option}`}
                    onClick={() => removeOption(option)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-muted small mt-8 mb-0">{t('exercizer.grain.zonetxt.limit')}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.cancel')}
        </Button>
        <Button
          color="primary"
          variant="filled"
          // Une zone sans bonne réponse serait toujours comptée fausse.
          disabled={!answer.trim()}
          onClick={() =>
            onSave({ ...zone, answer, options: type === 'list' ? own : (zone.options ?? []) }, shared)
          }
        >
          {t(isNew ? 'add' : 'edit')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/** La zone en cours d'édition : son rang dans la liste, ou `null` pour une nouvelle. */
type Editing = { index: number | null } | null;

/**
 * Texte à trous (type 10) — portage de `editFillText`.
 *
 * L'enseignant écrit son texte dans l'éditeur riche et y insère des zones, chacune remplaçant un
 * mot. La zone s'insère à l'endroit du curseur ; une pastille la représente dans le texte, et un
 * clic dessus rouvre sa fenêtre. Effacer la pastille supprime la zone du grain.
 */
function FillTextEditor({ customData, onChange }: EditorProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const type = answersTypeOf(customData);
  const zones = customData.zones ?? [];
  const [editing, setEditing] = useState<Editing>(null);
  const container = useRef<HTMLDivElement>(null);
  const editor = useRef<TiptapEditor | null>(null);

  // L'extension est créée UNE fois : la recréer démonterait l'éditeur à chaque frappe. Elle lit
  // donc l'état courant à travers une référence.
  const latest = useRef({ customData, onChange });
  latest.current = { customData, onChange };

  const extensions = useMemo(
    () => [
      FillZone.configure({
        label: (zoneId) =>
          (latest.current.customData.zones ?? []).find((zone) => zone.id === zoneId)?.answer ?? '',
        onEdit: (zoneId) => {
          const index = (latest.current.customData.zones ?? []).findIndex(
            (zone) => zone.id === zoneId,
          );
          if (index >= 0) setEditing({ index });
        },
        onReady: (instance) => {
          editor.current = instance;
        },
      }),
    ],
    [],
  );

  // Les pastilles sont dessinées par l'éditeur, hors de React : leur libellé est remis à jour
  // ici quand la réponse d'une zone change.
  useEffect(() => {
    container.current?.querySelectorAll<HTMLElement>(`.${FILL_ZONE_CLASS}`).forEach((chip) => {
      const zone = zones.find((item) => String(item.id) === chip.dataset.zoneId);
      chip.textContent = zone?.answer || '…';
    });
  });

  const save = (zone: GrainZone, shared: string[]) => {
    const base = { ...customData, answersType: type, options: shared };
    if (editing?.index === null) {
      const created = { ...zone, id: nextZoneId(zones) };
      const next = { ...base, zones: [...zones, created] };
      // L'insertion déclenche aussitôt `onContentChange`, AVANT le prochain rendu : il doit y
      // trouver la zone qu'on vient de créer, sinon il l'élaguerait comme absente du grain.
      latest.current = { ...latest.current, customData: next };
      onChange(next);
      if (editor.current) insertFillZone(editor.current, created.id);
    } else if (editing) {
      onChange({
        ...base,
        zones: zones.map((item, index) => (index === editing.index ? zone : item)),
      });
    }
    setEditing(null);
  };

  return (
    <div ref={container}>
      <AnswersTypeSelect customData={customData} onChange={onChange} />
      <p className="text-muted small mb-8">{t('exercizer.grain.filltext.help')}</p>
      <Editor
        content={customData.htmlContent?.trim() ? customData.htmlContent : '<p></p>'}
        mode="edit"
        focus={false}
        variant="outline"
        visibility="protected"
        placeholder={t('exercizer.grain.filltext.placeholder')}
        extensions={extensions}
        onContentChange={({ editor: instance }: { editor: EditorInstance }) => {
          // Appelé sur les seules modifications de l'enseignant : l'éditeur ne signale pas la
          // mise en forme qu'il applique en chargeant le texte, donc ouvrir un sujet n'écrit rien.
          // Une zone effacée du texte quitte aussi le grain — elle compterait sinon dans la note.
          const { customData: current, onChange: emit } = latest.current;
          emit(pruneZones(current, instance.isEmpty ? '' : instance.getHTML()));
        }}
      />
      <div className="d-flex flex-wrap gap-8 mt-16">
        <Button color="primary" variant="outline" onClick={() => setEditing({ index: null })}>
          {t('exercizer.grain.zone.add')}
        </Button>
      </div>
      {type === 'drag' && (
        <SharedOptions
          options={customData.options ?? []}
          onRemove={(option) => onChange(removeSharedOption(customData, option, false))}
        />
      )}
      {editing && (
        <ZoneDialog
          type={type}
          zone={editing.index === null ? { answer: '', options: [] } : zones[editing.index]}
          sharedOptions={customData.options ?? []}
          isNew={editing.index === null}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

const BLOCK_SIZE: Record<BlockKind, { width: number; height?: number; minHeight?: number }> = {
  text: { width: 150, minHeight: 40 },
  image: { width: 100, height: 100 },
};

/** Pas d'un déplacement au clavier, dans le repère du modèle. */
const KEY_STEP = 10;

/**
 * Un bloc qu'on déplace sur l'image de fond.
 *
 * À la souris ou au doigt, on le fait glisser ; au clavier, les flèches le déplacent pas à pas —
 * l'ancienne IHM n'offrait que le glisser. La position n'est enregistrée qu'au relâchement.
 */
function DraggableBlock({
  position,
  geometry,
  kind,
  label,
  onMove,
  children,
}: {
  position: { x: number; y: number; z?: number } | undefined;
  geometry: ZoneGeometry;
  kind: BlockKind;
  label: string;
  onMove: (next: { x: number; y: number }) => void;
  children: React.ReactNode;
}) {
  const model = position ?? { x: 0, y: 0 };
  const base = toScreen(model, geometry.view, geometry.natural, kind);
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);
  const origin = useRef<{ pointerX: number; pointerY: number; left: number; top: number } | null>(
    null,
  );

  const clamp = (point: { left: number; top: number }) => ({
    left: Math.max(0, Math.min(point.left, geometry.view.width - BLOCK_SIZE[kind].width)),
    top: Math.max(0, Math.min(point.top, geometry.view.height - 40)),
  });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Un clic sur un bouton du bloc (modifier, retirer) n'est pas un déplacement.
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { pointerX: event.clientX, pointerY: event.clientY, ...base };
    setDrag(base);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin.current) return;
    setDrag(
      clamp({
        left: origin.current.left + event.clientX - origin.current.pointerX,
        top: origin.current.top + event.clientY - origin.current.pointerY,
      }),
    );
  };
  const onPointerUp = () => {
    if (origin.current && drag) onMove(toModel(drag, geometry.view, geometry.natural, kind));
    origin.current = null;
    setDrag(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    };
    const move = delta[event.key];
    if (!move || event.target !== event.currentTarget) return;
    event.preventDefault();
    onMove({ x: Math.max(0, model.x + move[0]), y: Math.max(0, model.y + move[1]) });
  };

  const at = drag ?? base;
  return (
    <div
      role="group"
      aria-label={label}
      tabIndex={0}
      className="border rounded bg-white p-4"
      style={{
        position: 'absolute',
        left: at.left,
        top: at.top,
        zIndex: drag ? 1000 : (position?.z ?? 0),
        cursor: drag ? 'grabbing' : 'grab',
        touchAction: 'none',
        ...BLOCK_SIZE[kind],
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

/** Zones de texte sur une image (type 11) — portage de `editZoneText`. */
function ZoneTextEditor({ customData, onChange }: EditorProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const type = answersTypeOf(customData);
  const zones = customData.zones ?? [];
  const [editing, setEditing] = useState<Editing>(null);

  const setZones = (next: GrainZone[]) => onChange({ ...customData, zones: next });

  const save = (zone: GrainZone, shared: string[]) => {
    const base = { ...customData, answersType: type, options: shared };
    if (editing?.index === null) {
      onChange({ ...base, zones: [...zones, { ...zone, position: nextZonePosition(zones) }] });
    } else if (editing) {
      onChange({
        ...base,
        zones: zones.map((item, index) => (index === editing.index ? zone : item)),
      });
    }
    setEditing(null);
  };

  return (
    <div>
      <AnswersTypeSelect customData={customData} onChange={onChange} />
      <ZoneCanvas image={customData._guideImage} alt={t('exercizer.grain.background')}>
        {(geometry) =>
          zones.map((zone, index) => (
            <DraggableBlock
              key={index}
              position={zone.position}
              geometry={geometry}
              kind="text"
              label={`${t('exercizer.grain.zone')} ${index + 1} : ${zone.answer}`}
              onMove={(point) =>
                setZones(
                  zones.map((item, position) =>
                    position === index
                      ? { ...item, position: { ...point, z: item.position?.z ?? index } }
                      : item,
                  ),
                )
              }
            >
              <div className="d-flex align-items-center gap-4">
                <span className="flex-fill text-truncate">{zone.answer}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-decoration-none"
                  aria-label={t('edit')}
                  onClick={() => setEditing({ index })}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-link p-0 text-danger text-decoration-none"
                  aria-label={t('exercizer.remove')}
                  onClick={() => setZones(zones.filter((_, position) => position !== index))}
                >
                  ✕
                </button>
              </div>
            </DraggableBlock>
          ))
        }
      </ZoneCanvas>

      <div className="d-flex flex-wrap gap-8 mt-16">
        <Button color="primary" variant="filled" onClick={() => setEditing({ index: null })}>
          {t('exercizer.grain.add.answer')}
        </Button>
        <PickImageButton
          label={t('exercizer.grain.background')}
          onPick={(url) => onChange({ ...customData, _guideImage: url })}
        />
      </div>
      {type === 'drag' && (
        <SharedOptions
          options={customData.options ?? []}
          // Sur une image, une zone sans étiquette n'aurait plus de bonne réponse : elle part.
          onRemove={(option) => onChange(removeSharedOption(customData, option, true))}
        />
      )}
      {editing && (
        <ZoneDialog
          type={type}
          zone={editing.index === null ? { answer: '', options: [] } : zones[editing.index]}
          sharedOptions={customData.options ?? []}
          isNew={editing.index === null}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

/**
 * Zones d'images sur une image (type 12) — portage de `editZoneImage`.
 *
 * Chaque vignette ajoutée est à la fois une zone à placer sur le fond et une étiquette proposée
 * à l'élève : retirer l'une retire l'autre.
 */
function ZoneImageEditor({ customData, onChange }: EditorProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const zones = customData.zones ?? [];
  const options = customData.options ?? [];

  const remove = (index: number) => {
    const nextOptions = [...options];
    const position = nextOptions.indexOf(zones[index].answer);
    if (position >= 0) nextOptions.splice(position, 1);
    onChange({
      ...customData,
      options: nextOptions,
      zones: zones.filter((_, item) => item !== index),
    });
  };

  return (
    <div>
      <ZoneCanvas image={customData._guideImage} alt={t('exercizer.grain.background')}>
        {(geometry) =>
          zones.map((zone, index) => (
            <DraggableBlock
              key={index}
              position={zone.position}
              geometry={geometry}
              kind="image"
              label={`${t('exercizer.grain.zone')} ${index + 1}`}
              onMove={(point) =>
                onChange({
                  ...customData,
                  zones: zones.map((item, position) =>
                    position === index
                      ? { ...item, position: { ...point, z: item.position?.z ?? index } }
                      : item,
                  ),
                })
              }
            >
              <img
                src={thumbnail(zone.answer)}
                alt=""
                draggable={false}
                style={{ maxWidth: '100%', maxHeight: '100%', pointerEvents: 'none' }}
              />
              <button
                type="button"
                className="btn btn-sm btn-light p-0 px-4 text-danger position-absolute top-0 end-0"
                aria-label={t('exercizer.remove')}
                onClick={() => remove(index)}
              >
                ✕
              </button>
            </DraggableBlock>
          ))
        }
      </ZoneCanvas>

      <div className="d-flex flex-wrap gap-8 mt-16">
        <PickImageButton
          label={t('exercizer.grain.add.answer')}
          variant="filled"
          onPick={(url) =>
            onChange({
              ...customData,
              options: [...options, url],
              zones: [...zones, { answer: url, position: nextZonePosition(zones) }],
            })
          }
        />
        <PickImageButton
          label={t('exercizer.grain.background')}
          onPick={(url) => onChange({ ...customData, _guideImage: url })}
        />
      </div>
    </div>
  );
}

/** L'éditeur du contenu propre à un grain à zones. */
export function ZoneEditor({
  grainTypeId,
  ...props
}: EditorProps & { grainTypeId: number }) {
  switch (grainTypeId) {
    case GRAIN.TEXT_TO_FILL:
      return <FillTextEditor {...props} />;
    case GRAIN.AREA_SELECT:
      return <ZoneTextEditor {...props} />;
    case GRAIN.AREA_SELECT_IMAGE:
      return <ZoneImageEditor {...props} />;
    default:
      return null;
  }
}

export default ZoneEditor;
