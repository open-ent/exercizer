import { Alert, Checkbox, Table } from '@open-ent/react';
import { useTranslation } from 'react-i18next';

import { GrainAnswer, GrainCustomData } from '../../types';
import { renumberOrderAnswers } from '../../grains';
import { AddAnswerButton, AnswerInput, AnswerRow, NoErrorAllowedField } from './AnswerRow';

/** Les réponses, avec un tableau vide plutôt qu'`undefined` : un grain ancien peut n'en avoir aucune. */
const answersOf = (customData: GrainCustomData): GrainAnswer[] =>
  customData.correct_answer_list ?? [];

/**
 * Réponses multiples (type 6) : plusieurs réponses attendues, toutes à trouver.
 *
 * On ne descend pas sous DEUX réponses — c'est la règle de `editMultipleAnswer`, et un exercice
 * à réponse unique a son propre type.
 */
export function MultipleAnswerEditor({
  customData,
  onChange,
}: {
  customData: GrainCustomData;
  onChange: (next: GrainCustomData) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const answers = answersOf(customData);

  const setAnswers = (next: GrainAnswer[]) =>
    onChange({ ...customData, correct_answer_list: next });

  return (
    <div>
      <NoErrorAllowedField
        checked={customData.no_error_allowed === true}
        onChange={(checked) => onChange({ ...customData, no_error_allowed: checked })}
      />
      <Alert type="info" className="mb-16">
        {t('exercizer.grain.accent.warning')}
      </Alert>

      {answers.map((answer, index) => (
        <AnswerRow
          key={index}
          removeLabel={t('exercizer.remove')}
          canRemove={answers.length > 2}
          onRemove={() => setAnswers(answers.filter((_, i) => i !== index))}
        >
          <AnswerInput
            label={`${t('exercizer.grain.answer.info')} ${index + 1}`}
            placeholder={t('exercizer.grain.answer.info')}
            value={answer.text ?? ''}
            onChange={(text) =>
              setAnswers(answers.map((item, i) => (i === index ? { ...item, text } : item)))
            }
          />
        </AnswerRow>
      ))}

      <AddAnswerButton
        label={t('exercizer.grain.add.answer')}
        onClick={() => setAnswers([...answers, { text: '' }])}
      />
    </div>
  );
}

/**
 * QCM (type 7) : des propositions, dont une ou plusieurs sont justes.
 *
 * Une proposition sans texte ne peut pas être cochée — cocher une ligne vide produirait une bonne
 * réponse invisible, et c'est déjà ce que l'ancienne IHM interdisait. Ces lignes vides sont par
 * ailleurs écartées à l'enregistrement (cf. `cleanGrainData`).
 */
export function QcmEditor({
  customData,
  onChange,
}: {
  customData: GrainCustomData;
  onChange: (next: GrainCustomData) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const answers = answersOf(customData);
  const setAnswers = (next: GrainAnswer[]) =>
    onChange({ ...customData, correct_answer_list: next });

  return (
    <div>
      <fieldset className="mb-16">
        <legend className="form-label">{t('exercizer.grain.mode')}</legend>
        <Checkbox
          label={t('exercizer.grain.mode.option.one')}
          checked={customData.no_error_allowed === true}
          onChange={(event) => onChange({ ...customData, no_error_allowed: event.target.checked })}
        />
        <Checkbox
          label={t('exercizer.grain.mode.option.multiple')}
          checked={customData.multipleAnswers === true}
          onChange={(event) => onChange({ ...customData, multipleAnswers: event.target.checked })}
        />
      </fieldset>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('exercizer.grain.qcm.responses.header1')}</Table.Th>
            <Table.Th>{t('exercizer.grain.qcm.responses.header2')}</Table.Th>
            <Table.Th>{t('exercizer.grain.qcm.responses.header3')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {answers.map((answer, index) => (
            <Table.Tr key={index}>
              <Table.Td>
                <Checkbox
                  aria-label={`${t('exercizer.grain.qcm.responses.header1')} ${index + 1}`}
                  checked={answer.isChecked === true}
                  disabled={!answer.text}
                  onChange={(event) =>
                    setAnswers(
                      answers.map((item, i) =>
                        i === index ? { ...item, isChecked: event.target.checked } : item,
                      ),
                    )
                  }
                />
              </Table.Td>
              <Table.Td>
                <AnswerInput
                  label={`${t('exercizer.grain.qcm.responses.header2')} ${index + 1}`}
                  placeholder={t('exercizer.grain.qcm.answer.info')}
                  value={answer.text ?? ''}
                  onChange={(text) =>
                    setAnswers(
                      answers.map((item, i) =>
                        // Vider le texte d'une proposition la décoche : la laisser cochée en
                        // ferait une bonne réponse que personne ne voit.
                        i === index ? { ...item, text, isChecked: text ? item.isChecked : false } : item,
                      ),
                    )
                  }
                />
              </Table.Td>
              <Table.Td>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost btn-danger"
                  aria-label={`${t('exercizer.remove')} ${index + 1}`}
                  onClick={() => setAnswers(answers.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <AddAnswerButton
        label={t('exercizer.grain.qcm.add')}
        onClick={() => setAnswers([...answers, { text: '', isChecked: false }])}
      />
    </div>
  );
}

/**
 * Association (type 8) : deux colonnes à relier.
 *
 * `show_left_column` décide si l'élève voit la colonne de gauche ; décochée, il doit la retrouver
 * de mémoire. Les lignes à moitié remplies sont écartées à l'enregistrement, pas à la saisie :
 * l'enseignant doit pouvoir taper un côté puis l'autre.
 */
export function AssociationEditor({
  customData,
  onChange,
}: {
  customData: GrainCustomData;
  onChange: (next: GrainCustomData) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const answers = answersOf(customData);
  const setAnswers = (next: GrainAnswer[]) =>
    onChange({ ...customData, correct_answer_list: next });

  return (
    <div>
      <NoErrorAllowedField
        checked={customData.no_error_allowed === true}
        onChange={(checked) => onChange({ ...customData, no_error_allowed: checked })}
      />
      <Checkbox
        className="mb-16"
        label={t('exercizer.grain.asso.show')}
        checked={customData.show_left_column !== false}
        onChange={(event) => onChange({ ...customData, show_left_column: event.target.checked })}
      />

      {answers.map((answer, index) => (
        <AnswerRow
          key={index}
          removeLabel={t('exercizer.remove')}
          onRemove={() => setAnswers(answers.filter((_, i) => i !== index))}
        >
          <AnswerInput
            label={`${t('exercizer.grain.asso.responses.header1')} ${index + 1}`}
            placeholder={t('exercizer.grain.answer.placeholder')}
            value={answer.text_left ?? ''}
            onChange={(text_left) =>
              setAnswers(answers.map((item, i) => (i === index ? { ...item, text_left } : item)))
            }
          />
          <AnswerInput
            label={`${t('exercizer.grain.asso.responses.header2')} ${index + 1}`}
            placeholder={t('exercizer.grain.asso.placeholder')}
            value={answer.text_right ?? ''}
            onChange={(text_right) =>
              setAnswers(answers.map((item, i) => (i === index ? { ...item, text_right } : item)))
            }
          />
        </AnswerRow>
      ))}

      <AddAnswerButton
        label={t('exercizer.grain.asso.add')}
        onClick={() => setAnswers([...answers, { text_left: '', text_right: '' }])}
      />
    </div>
  );
}

/**
 * Mise en ordre (type 9) : des réponses dont le RANG est la réponse attendue.
 *
 * L'ancienne IHM laissait glisser les lignes ; ici deux boutons « monter » / « descendre » les
 * déplacent. Ils fonctionnent au clavier, ce que le glisser-déposer ne faisait pas, et le rang
 * reste renuméroté de 1 à n — il ne peut pas y avoir de trou.
 */
export function OrderEditor({
  customData,
  onChange,
}: {
  customData: GrainCustomData;
  onChange: (next: GrainCustomData) => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const answers = answersOf(customData);
  const setAnswers = (next: GrainAnswer[]) =>
    onChange({ ...customData, correct_answer_list: renumberOrderAnswers(next) });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= answers.length) return;
    const next = [...answers];
    [next[index], next[target]] = [next[target], next[index]];
    setAnswers(next);
  };

  return (
    <div>
      <NoErrorAllowedField
        checked={customData.no_error_allowed === true}
        onChange={(checked) => onChange({ ...customData, no_error_allowed: checked })}
      />
      <Alert type="info" className="mb-16">
        {t('exercizer.grain.order.warning')}
      </Alert>

      {answers.map((answer, index) => (
        <AnswerRow
          key={index}
          removeLabel={t('exercizer.remove')}
          canRemove={answers.length > 2}
          onRemove={() => setAnswers(answers.filter((_, i) => i !== index))}
        >
          <span className="fw-bold px-8" aria-hidden="true">
            {answer.order_by ?? index + 1}
          </span>
          <AnswerInput
            label={`${t('exercizer.grain.order.answers')} ${index + 1}`}
            placeholder={t('exercizer.grain.answer.info')}
            value={answer.text ?? ''}
            onChange={(text) =>
              setAnswers(answers.map((item, i) => (i === index ? { ...item, text } : item)))
            }
          />
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-tertiary"
            aria-label={t('exercizer.sequence.item.moveUp')}
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost btn-tertiary"
            aria-label={t('exercizer.sequence.item.moveDown')}
            disabled={index === answers.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
        </AnswerRow>
      ))}

      <AddAnswerButton
        label={t('exercizer.grain.add.answer')}
        onClick={() => setAnswers([...answers, { text: '' }])}
      />
    </div>
  );
}
