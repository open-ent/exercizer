import { Alert, Checkbox, FormControl, Input } from '@open-ent/react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { GRAIN } from '../../grains';
import { GrainAnswer, GrainCustomCopyData } from '../../types';
import { RichTextEditor } from '../RichTextEditor';

/**
 * La saisie des réponses de l'élève, par type de grain — portage des directives `perform*`.
 *
 * Ces composants ne voient JAMAIS les réponses attendues : la passation ne charge pas les grains
 * distribués, seulement la copie. C'est la règle de l'ancienne IHM, et elle est la seule à
 * empêcher les réponses d'arriver dans le navigateur de l'élève.
 *
 * Chaque modification remonte à l'écran, qui l'enregistre peu après (il n'y a pas de bouton
 * « Enregistrer » pendant la passation).
 */
export interface AnswerFieldsProps {
  grainTypeId: number;
  data: GrainCustomCopyData;
  onChange: (next: GrainCustomCopyData) => void;
  /** Séance en pause, ou copie déjà remise de force : plus rien ne se saisit. */
  readOnly?: boolean;
}

export function AnswerFields({ grainTypeId, data, onChange, readOnly }: AnswerFieldsProps) {
  switch (grainTypeId) {
    case GRAIN.SIMPLE_ANSWER:
      return <SimpleAnswerField data={data} onChange={onChange} readOnly={readOnly} />;
    case GRAIN.OPEN_ANSWER:
      return <OpenAnswerField data={data} onChange={onChange} readOnly={readOnly} />;
    case GRAIN.MULTIPLE_ANSWERS:
      return <MultipleAnswerFields data={data} onChange={onChange} readOnly={readOnly} />;
    case GRAIN.QCM:
      return <QcmFields data={data} onChange={onChange} readOnly={readOnly} />;
    case GRAIN.ASSOCIATION:
      return <AssociationFields data={data} onChange={onChange} readOnly={readOnly} />;
    case GRAIN.ORDER_BY:
      return <OrderFields data={data} onChange={onChange} readOnly={readOnly} />;
    default:
      // Énoncé : rien à remplir. Grains « à zones » : pas encore saisissables ici.
      return null;
  }
}

type FieldProps = Omit<AnswerFieldsProps, 'grainTypeId'>;

const answersOf = (data: GrainCustomCopyData): GrainAnswer[] => data.filled_answer_list ?? [];

function SimpleAnswerField({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  return (
    <FormControl id={id}>
      <Input
        type="text"
        size="md"
        aria-label={t('exercizer.grain.answer.info')}
        placeholder={t('exercizer.grain.answer.info')}
        disabled={readOnly}
        value={data.filled_answer ?? ''}
        onChange={(event) => onChange({ ...data, filled_answer: event.target.value })}
      />
    </FormControl>
  );
}

/** Réponse ouverte : du texte riche, corrigé à la main par l'enseignant. */
function OpenAnswerField({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <RichTextEditor
      content={data.filled_answer}
      mode={readOnly ? 'read' : 'edit'}
      placeholder={t('exercizer.grain.answer.info')}
      onChange={readOnly ? undefined : (filled_answer) => onChange({ ...data, filled_answer })}
    />
  );
}

/** Réponses multiples : autant de champs que de réponses attendues, dans n'importe quel ordre. */
function MultipleAnswerFields({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const answers = answersOf(data);
  return (
    <div className="d-flex flex-column gap-8">
      {answers.map((answer, index) => (
        <AnswerTextField
          key={index}
          label={`${t('exercizer.grain.answer.info')} ${index + 1}`}
          value={answer.text ?? ''}
          disabled={readOnly}
          onChange={(text) =>
            onChange({
              ...data,
              filled_answer_list: answers.map((item, i) => (i === index ? { ...item, text } : item)),
            })
          }
        />
      ))}
    </div>
  );
}

function AnswerTextField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  return (
    <FormControl id={id}>
      <Input
        type="text"
        size="md"
        aria-label={label}
        placeholder={t('exercizer.grain.answer.info')}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormControl>
  );
}

/**
 * QCM : les propositions sont FIXÉES par l'enseignant ; l'élève ne fait que cocher. Le texte
 * vient de la copie (`filled_answer_list[i].text`), recopié à la distribution.
 */
function QcmFields({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const answers = answersOf(data);
  return (
    <div className="d-flex flex-column gap-8">
      {answers.map((answer, index) => (
        <Checkbox
          key={index}
          // Une proposition sans texte ne peut pas être présentée à l'élève : l'ancienne IHM les
          // filtrait à l'affichage, on affiche le libellé de secours plutôt que rien.
          label={answer.text || t('exercizer.grain.qcm.answer.info')}
          checked={answer.isChecked === true}
          disabled={readOnly}
          onChange={(event) =>
            onChange({
              ...data,
              filled_answer_list: answers.map((item, i) =>
                i === index ? { ...item, isChecked: event.target.checked } : item,
              ),
            })
          }
        />
      ))}
    </div>
  );
}

/**
 * Association. L'ancienne IHM faisait glisser des étiquettes (et proposait une variante
 * « tap-tap » sur mobile) ; ici chaque ligne a une liste déroulante.
 *
 * Deux raisons : cela fonctionne au CLAVIER, ce que le glisser-déposer ne permettait pas, et sur
 * un écran tactile il n'y a plus deux parcours à maintenir. Les données enregistrées sont les
 * mêmes — `filled_answer_list`, avec les étiquettes choisies.
 *
 * Une étiquette déjà posée ailleurs ne réapparaît pas dans les autres listes : c'est ce
 * qu'assurait `resetPossibleAnswerLeftList` en retirant du tas ce qui était utilisé.
 */
function AssociationFields({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  const answers = answersOf(data);
  const showLeft = data.show_left_column !== false;

  /** Toutes les étiquettes proposées, selon la forme que la distribution a produite. */
  const allLabels: string[] = showLeft
    ? (data.possible_answer_list ?? []).map((answer) => answer.text_right ?? '').filter(Boolean)
    : (data.all_possible_answer ?? []).map((answer) => answer.item).filter(Boolean);

  const used = (side: 'text_left' | 'text_right') =>
    answers.map((answer) => answer[side]).filter((value): value is string => !!value);

  const choicesFor = (current: string | undefined, side: 'text_left' | 'text_right') => {
    const taken = new Set([...used('text_left'), ...used('text_right')]);
    if (current) taken.delete(current);
    const remaining = allLabels.filter((label) => !taken.has(label));
    // Sans colonne de gauche, les deux côtés puisent dans le même tas ; avec, seule la droite
    // est à composer.
    return side === 'text_left' && showLeft ? [] : remaining;
  };

  const set = (index: number, side: 'text_left' | 'text_right', value: string) =>
    onChange({
      ...data,
      filled_answer_list: answers.map((item, i) =>
        i === index ? { ...item, [side]: value || undefined } : item,
      ),
    });

  if (allLabels.length === 0) {
    return <Alert type="warning">{t('exercizer.subject.empty')}</Alert>;
  }

  return (
    <div className="d-flex flex-column gap-8">
      {answers.map((answer, index) => (
        <div key={index} className="d-flex align-items-center gap-8 flex-wrap">
          {showLeft ? (
            <span className="flex-fill">{answer.text_left}</span>
          ) : (
            <LabelSelect
              label={`${t('exercizer.grain.asso.responses.header1')} ${index + 1}`}
              value={answer.text_left ?? ''}
              choices={choicesFor(answer.text_left, 'text_left')}
              disabled={readOnly}
              onChange={(value) => set(index, 'text_left', value)}
            />
          )}
          <span aria-hidden="true">→</span>
          <LabelSelect
            label={`${t('exercizer.grain.asso.responses.header2')} ${index + 1}`}
            value={answer.text_right ?? ''}
            choices={choicesFor(answer.text_right, 'text_right')}
            disabled={readOnly}
            onChange={(value) => set(index, 'text_right', value)}
          />
        </div>
      ))}
    </div>
  );
}

/** Liste déroulante d'étiquettes. Un `<select>` natif : court, et déjà accessible. */
function LabelSelect({
  label,
  value,
  choices,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  choices: string[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <select
      className="form-select flex-fill"
      aria-label={label}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{t('exercizer.grain.asso.choose')}</option>
      {/* La réponse déjà posée doit rester dans sa propre liste, sinon le champ paraît vide. */}
      {(value && !choices.includes(value) ? [value, ...choices] : choices).map((choice) => (
        <option key={choice} value={choice}>
          {choice}
        </option>
      ))}
    </select>
  );
}

/**
 * Mise en ordre : les réponses sont données, l'élève les RANGE. Deux boutons déplacent la ligne,
 * et le rang (`order_by`) est renuméroté de 1 à n — c'est lui qui EST la réponse.
 */
function OrderFields({ data, onChange, readOnly }: FieldProps) {
  const { t } = useTranslation(['exercizer', 'common']);
  // On travaille sur la liste triée par rang : c'est l'ordre que l'élève voit.
  const answers = [...answersOf(data)].sort((a, b) => (a.order_by ?? 0) - (b.order_by ?? 0));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= answers.length) return;
    const next = [...answers];
    [next[index], next[target]] = [next[target], next[index]];
    onChange({
      ...data,
      filled_answer_list: next.map((answer, i) => ({ ...answer, order_by: i + 1 })),
    });
  };

  return (
    <ol className="list-unstyled d-flex flex-column gap-8">
      {answers.map((answer, index) => (
        <li key={`${answer.text}-${index}`} className="d-flex align-items-center gap-8">
          <span className="fw-bold px-8" aria-hidden="true">
            {index + 1}
          </span>
          <span className="flex-fill">{answer.text}</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-tertiary"
            aria-label={`${t('exercizer.sequence.item.moveUp')} — ${answer.text ?? ''}`}
            disabled={readOnly || index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-tertiary"
            aria-label={`${t('exercizer.sequence.item.moveDown')} — ${answer.text ?? ''}`}
            disabled={readOnly || index === answers.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
        </li>
      ))}
    </ol>
  );
}

export default AnswerFields;
