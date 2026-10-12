import { Alert, Button } from '@open-ent/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AutomaticCorrection } from '../../correction';
import { GRAIN } from '../../grains';
import { GrainCustomCopyData, GrainCustomData, GrainZone } from '../../types';
import {
  answersTypeOf,
  answerZone,
  availableOptions,
  shuffledOptions,
  ZONE_MAX_LENGTH,
} from '../../zones';
import { blockStyle, FillTextHtml, ZoneCanvas } from './ZoneParts';

interface FieldProps {
  data: GrainCustomCopyData;
  onChange: (next: GrainCustomCopyData) => void;
  readOnly?: boolean;
}

/** Largeur d'une étiquette de texte posée sur une image — celle du repère d'origine. */
const TEXT_BLOCK = { width: 150, minHeight: 40 };
const IMAGE_BLOCK = { width: 100, height: 100 };

const thumbnail = (url: string) =>
  url.startsWith('/workspace/document/') ? `${url}?thumbnail=120x120` : url;

/**
 * Le champ d'UNE zone de texte, selon la façon de répondre choisie par l'enseignant.
 *
 * Le « glisser-déposer » d'origine devient une liste déroulante des étiquettes encore libres :
 * c'est la même règle — une étiquette posée n'est plus disponible ailleurs — mais elle se joue au
 * clavier comme au doigt, là où l'ancienne IHM avait besoin d'un second mode pour les tablettes.
 */
function ZoneControl({
  zone,
  index,
  data,
  listOptions,
  label,
  onChange,
  readOnly,
}: FieldProps & {
  zone: GrainZone;
  index: number;
  /** Les propositions de cette zone, déjà mélangées (mode `list`). */
  listOptions: string[];
  label: string;
}) {
  const type = answersTypeOf(data);
  const set = (answer: string) => onChange(answerZone(data, index, answer));

  if (type === 'text') {
    return (
      <input
        type="text"
        className="form-control form-control-sm d-inline-block w-auto"
        style={{ minWidth: 120 }}
        maxLength={ZONE_MAX_LENGTH}
        aria-label={label}
        value={zone.answer ?? ''}
        disabled={readOnly}
        onChange={(event) => set(event.target.value)}
      />
    );
  }

  // Les étiquettes libres, plus celle que la zone tient déjà.
  const choices =
    type === 'list'
      ? listOptions
      : [
          ...(zone.answer ? [zone.answer] : []),
          ...availableOptions(data.options ?? [], data.zones ?? []),
        ].filter((option, position, all) => all.indexOf(option) === position);

  return (
    <select
      className="form-select form-select-sm d-inline-block w-auto"
      style={{ minWidth: 120 }}
      aria-label={label}
      value={zone.answer ?? ''}
      disabled={readOnly}
      onChange={(event) => set(event.target.value)}
    >
      <option value="" />
      {choices.map((option, position) => (
        <option key={`${option}-${position}`} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/** Les propositions de chaque zone, mélangées une fois — pas à chaque frappe. */
function useListOptions(zones: GrainZone[]): string[][] {
  const signature = zones.map((zone) => (zone.options ?? []).join('\u0001')).join('\u0002');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => zones.map((zone) => shuffledOptions(zone.options ?? [])), [signature]);
}

/** Texte à trous (type 10). */
function FillTextFields({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const zones = data.zones ?? [];
  const listOptions = useListOptions(zones);
  return (
    <FillTextHtml
      html={data.htmlContent}
      renderZone={(zoneId) => {
        const index = zones.findIndex((zone) => zone.id === zoneId);
        if (index < 0) return null;
        return (
          <ZoneControl
            zone={zones[index]}
            index={index}
            data={data}
            listOptions={listOptions[index] ?? []}
            label={`${t('exercizer.grain.zone')} ${index + 1}`}
            onChange={onChange}
            readOnly={readOnly}
          />
        );
      }}
    />
  );
}

/** Zones de texte sur une image (type 11). */
function ZoneTextFields({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const zones = data.zones ?? [];
  const listOptions = useListOptions(zones);
  return (
    <ZoneCanvas image={data._guideImage} alt={t('exercizer.grain.background')}>
      {(geometry) =>
        zones.map((zone, index) => (
          <div
            key={index}
            style={{ ...blockStyle(zone.position, geometry, 'text'), ...TEXT_BLOCK }}
          >
            <ZoneControl
              zone={zone}
              index={index}
              data={data}
              listOptions={listOptions[index] ?? []}
              label={`${t('exercizer.grain.zone')} ${index + 1}`}
              onChange={onChange}
              readOnly={readOnly}
            />
          </div>
        ))
      }
    </ZoneCanvas>
  );
}

/**
 * Zones d'images sur une image (type 12).
 *
 * On choisit une zone, puis la vignette à y poser — ou l'inverse en la faisant glisser. Les deux
 * gestes mènent au même endroit : le glisser seul laisserait de côté le clavier et les écrans
 * tactiles.
 */
function ZoneImageFields({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const zones = data.zones ?? [];
  const [active, setActive] = useState<number | null>(null);
  const options = useMemo(
    () => shuffledOptions(data.options ?? []),
    // Les vignettes ne changent pas pendant la passation : un seul tirage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(data.options ?? []).join('\u0001')],
  );
  const free = availableOptions(options, zones);

  const place = (index: number, option: string) => {
    if (readOnly) return;
    onChange(answerZone(data, index, option));
    setActive(null);
  };
  /** Sans zone choisie, la vignette va dans la première zone vide. */
  const pick = (option: string) => {
    const target = active ?? zones.findIndex((zone) => !zone.answer);
    if (target >= 0) place(target, option);
  };

  return (
    <div className="d-flex flex-column gap-16">
      <ZoneCanvas image={data._guideImage} alt={t('exercizer.grain.background')}>
        {(geometry) =>
          zones.map((zone, index) => (
            <button
              key={index}
              type="button"
              className={`btn p-0 border rounded bg-white ${active === index ? 'border-primary border-2' : ''}`}
              style={{ ...blockStyle(zone.position, geometry, 'image'), ...IMAGE_BLOCK }}
              aria-label={`${t('exercizer.grain.zone')} ${index + 1}`}
              aria-pressed={active === index}
              disabled={readOnly}
              onClick={() => {
                // Un second clic sur une zone remplie la vide : la vignette retourne au tas.
                if (active === index && zone.answer) place(index, '');
                else setActive(index);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const option = event.dataTransfer.getData('text/plain');
                if (option) place(index, option);
              }}
            >
              {zone.answer && (
                <img
                  src={thumbnail(zone.answer)}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '100%' }}
                />
              )}
            </button>
          ))
        }
      </ZoneCanvas>

      <div className="d-flex flex-wrap gap-8" aria-label={t('exercizer.grain.responses')}>
        {free.map((option, position) => (
          <button
            key={`${option}-${position}`}
            type="button"
            className="btn p-0 border rounded bg-white"
            style={IMAGE_BLOCK}
            draggable={!readOnly}
            disabled={readOnly}
            onDragStart={(event) => event.dataTransfer.setData('text/plain', option)}
            onClick={() => pick(option)}
          >
            <img src={thumbnail(option)} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
          </button>
        ))}
      </div>
      {active !== null && zones[active]?.answer && (
        <div>
          <Button size="sm" color="tertiary" variant="ghost" onClick={() => place(active, '')}>
            {t('exercizer.remove')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** La saisie d'un grain à zones par l'élève — portage des directives `perform*` des trois types. */
export function ZoneAnswerFields({
  grainTypeId,
  ...props
}: FieldProps & { grainTypeId: number }) {
  switch (grainTypeId) {
    case GRAIN.TEXT_TO_FILL:
      return <FillTextFields {...props} />;
    case GRAIN.AREA_SELECT:
      return <ZoneTextFields {...props} />;
    case GRAIN.AREA_SELECT_IMAGE:
      return <ZoneImageFields {...props} />;
    default:
      return null;
  }
}

/** Couleur d'une zone corrigée ; sans verdict (corrigé de l'enseignant), elle reste neutre. */
const verdictClass = (verdict: boolean | undefined): string =>
  verdict === undefined
    ? 'border'
    : verdict
      ? 'border border-success text-success input-response-correct'
      : 'border border-danger text-danger input-response-incorrect';

function ReviewedZone({
  zone,
  verdict,
  image,
}: {
  zone: GrainZone;
  verdict: boolean | undefined;
  image?: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const status =
    verdict === undefined
      ? ''
      : t(verdict ? 'exercizer.grain.answer.correct' : 'exercizer.grain.answer.incorrect');
  if (image) {
    return (
      <span
        className={`d-inline-flex align-items-center justify-content-center rounded bg-white ${verdictClass(verdict)}`}
        style={IMAGE_BLOCK}
        title={status}
      >
        {zone.answer && (
          <img src={thumbnail(zone.answer)} alt={status} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        )}
      </span>
    );
  }
  return (
    <span className={`d-inline-block rounded px-8 bg-white ${verdictClass(verdict)}`} title={status}>
      {zone.answer || <em className="text-muted">{t('exercizer.grain.noanswer')}</em>}
      {/* Le verdict est aussi écrit : la couleur seule ne dit rien à qui ne la distingue pas. */}
      {status && <span className="visually-hidden"> — {status}</span>}
    </span>
  );
}

/**
 * Un grain à zones relu : la copie de l'élève avec le verdict de chaque zone, ou — sans
 * `correction` — le corrigé de l'enseignant, que montre « Afficher la correction ».
 */
export function ZoneReview({
  grainTypeId,
  data,
  correction,
}: {
  grainTypeId: number;
  data: GrainCustomCopyData | GrainCustomData;
  correction?: AutomaticCorrection;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const zones = data.zones ?? [];
  const verdict = (index: number) => correction?.answers[index];

  if (grainTypeId === GRAIN.TEXT_TO_FILL) {
    if (!data.htmlContent) return <Alert type="info">{t('exercizer.grain.noanswer')}</Alert>;
    return (
      <FillTextHtml
        html={data.htmlContent}
        renderZone={(zoneId) => {
          const index = zones.findIndex((zone) => zone.id === zoneId);
          return index < 0 ? null : <ReviewedZone zone={zones[index]} verdict={verdict(index)} />;
        }}
      />
    );
  }

  const image = grainTypeId === GRAIN.AREA_SELECT_IMAGE;
  return (
    <ZoneCanvas image={data._guideImage} alt={t('exercizer.grain.background')}>
      {(geometry) =>
        zones.map((zone, index) => (
          <div
            key={index}
            style={{
              ...blockStyle(zone.position, geometry, image ? 'image' : 'text'),
              ...(image ? IMAGE_BLOCK : TEXT_BLOCK),
            }}
          >
            <ReviewedZone zone={zone} verdict={verdict(index)} image={image} />
          </div>
        ))
      }
    </ZoneCanvas>
  );
}
