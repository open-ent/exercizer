import { Button, Checkbox, FormControl, IconButton, Input } from '@open-ent/react';
import { ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Une ligne de réponse, et le bouton qui en ajoute une — la plume commune aux quatre types à
 * liste (réponses multiples, QCM, association, mise en ordre).
 *
 * La croix de suppression est un `IconButton` du socle, et non un `<svg>` cliquable comme dans
 * l'IHM AngularJS : elle est ainsi atteignable au clavier et annoncée par un lecteur d'écran.
 */
export function AnswerRow({
  children,
  onRemove,
  removeLabel,
  canRemove = true,
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
  canRemove?: boolean;
}) {
  return (
    <div className="d-flex align-items-center gap-8 mb-8">
      <div className="flex-fill d-flex align-items-center gap-8">{children}</div>
      <IconButton
        aria-label={removeLabel}
        color="danger"
        variant="ghost"
        icon={<span aria-hidden="true">×</span>}
        disabled={!canRemove}
        onClick={onRemove}
      />
    </div>
  );
}

export function AddAnswerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" color="tertiary" variant="ghost" onClick={onClick}>
      + {label}
    </Button>
  );
}

/**
 * Champ texte d'une réponse. Le libellé est porté par `aria-label` : la ligne n'a pas de place
 * pour un intitulé visible, et « Réponse 2 » suffit à s'y retrouver au clavier.
 *
 * ⚠ L'`Input` du socle lit son `id` dans le contexte d'un `FormControl` et LÈVE une erreur hors
 * de lui (« Cannot be rendered outside the FormControl component ») : l'enveloppe n'est pas
 * décorative, le champ ne se rend pas sans elle.
 */
export function AnswerInput({
  value,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <FormControl id={id} className="flex-fill">
      <Input
        type="text"
        size="md"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormControl>
  );
}

/** « Aucun point s'il y a une erreur » — la case commune aux types à correction automatique. */
export function NoErrorAllowedField({
  checked,
  onChange,
  labelKey = 'exercizer.grain.mode.option',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelKey?: string;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <fieldset className="mb-16">
      <legend className="form-label">{t('exercizer.grain.mode')}</legend>
      {/* `Checkbox` du socle, et non un `<input>` dans un `<label>` : lui seul associe
          l'intitulé de façon fiable — un lecteur d'écran annonçait « on » sinon. */}
      <Checkbox
        label={t(labelKey)}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </fieldset>
  );
}
