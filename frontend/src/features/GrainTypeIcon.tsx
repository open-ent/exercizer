/**
 * L'illustration d'un type de grain.
 *
 * Deux planches d'icônes, servies par le module :
 *  - `illustrations.svg` porte un symbole par type de QUESTION, nommé comme le type l'est en base
 *    (`qcm`, `association`, `area_select`…) ;
 *  - `icons.svg` fournit les trois qui n'y sont pas — l'énoncé et les deux étapes de choix. C'est
 *    déjà là que l'ancienne IHM allait les chercher (`#text`, `#help`, `#info`).
 *
 * On référence ces planches plutôt que de recopier une douzaine de dessins dans le paquet React :
 * les deux interfaces montrent ainsi exactement les mêmes.
 */
const ILLUSTRATIONS = '/exercizer/public/assets/icons/illustrations.svg';
const ICONS = '/exercizer/public/assets/icons/icons.svg';

/** Les types dont le symbole vit dans `icons.svg`, et non dans la planche des illustrations. */
const FROM_ICONS: Record<string, string> = {
  statement: 'text',
  choose: 'info',
  chooseAnswer: 'help',
};

export function GrainTypeIcon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const fallback = FROM_ICONS[name];
  const href = fallback ? `${ICONS}#${fallback}` : `${ILLUSTRATIONS}#${name}`;
  return (
    <svg
      width={size}
      height={size}
      // Les attributs `width`/`height` ne suffisent pas : les règles du socle (`.btn svg`,
      // notamment) les emportent. La taille demandée doit passer par le style en ligne.
      style={{ width: size, height: size, flexShrink: 0 }}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <use href={href} />
    </svg>
  );
}

export default GrainTypeIcon;
