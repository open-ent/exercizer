/**
 * Les médias d'un contenu riche : l'enregistrement d'une dictée, la vidéo d'un document, la
 * réponse orale d'un élève.
 *
 * L'éditeur du socle sait déjà enregistrer au micro et déposer le fichier dans l'espace
 * documentaire (bouton « audio » de sa barre d'outils). Il en écrit dans le HTML
 * `<div class="audio-wrapper"><audio src="/workspace/document/…" data-document-id="…"></audio></div>`,
 * SANS `controls` : c'est son propre rendu React qui ajoute l'attribut au vol. Exercizer, lui,
 * injecte le HTML tel quel (`dangerouslySetInnerHTML`) — un `<audio>` sans `controls` n'affiche
 * rien du tout, et l'énoncé dicté restait donc muet, tout comme la réponse orale d'un élève à la
 * correction. Ce module rend ces médias jouables, et dit au papier ce qu'il ne peut pas jouer.
 */


/** Le nom accessible des lecteurs, que l'IHM traduit ; le défaut est celui du français. */
export interface MediaLabels {
  audio: string;
  video: string;
}

export const DEFAULT_MEDIA_LABELS: MediaLabels = {
  audio: 'Enregistrement audio',
  video: 'Vidéo',
};

/** Les mêmes libellés, traduits — ce module reste sans dépendance à react-i18next. */
export const mediaLabels = (t: (key: string) => string): MediaLabels => ({
  audio: t('exercizer.media.audio'),
  video: t('exercizer.media.video'),
});

const parseHtml = (html: string): HTMLElement =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

/**
 * Retire d'un énoncé ce qui s'exécute. C'est le filtre de `zones.ts#sanitizeHtml`, MOINS les
 * cadres : l'éditeur du socle sait insérer une vidéo externe ou une figure interactive dans un
 * `<iframe>`, et un énoncé qui en porte un l'affichait déjà — ce module ne doit pas le faire
 * disparaître au passage. Les appelants qui veulent le filtre strict (la description d'un sujet
 * du catalogue) appliquent `sanitizeHtml` avant.
 */
function scrubExecutables(root: HTMLElement): void {
  root
    .querySelectorAll('script, style, object, embed, link, meta, base, form')
    .forEach((element) => element.remove());
  root.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.replace(/\s+/g, '').toLowerCase();
      if (
        name.startsWith('on') ||
        name.startsWith('ng-') ||
        ((name === 'href' || name === 'src') && value.startsWith('javascript:'))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  });
}

const labelOf = (media: Element, labels: MediaLabels): string =>
  media.tagName === 'AUDIO' ? labels.audio : labels.video;

/**
 * Le HTML prêt à l'affichage hors de l'éditeur : débarrassé de ce qui s'exécute, et ses médias
 * équipés de leur lecteur.
 *
 * `preload="metadata"` plutôt que le défaut du navigateur : un sujet qui porte dix dictées ne
 * doit pas en télécharger dix avant que l'élève n'en lance une. Un nom accessible est posé sur
 * chaque lecteur, qui n'en a aucun par lui-même.
 */
export function playableHtml(
  html: string | null | undefined,
  labels = DEFAULT_MEDIA_LABELS,
): string {
  if (!html) return '';
  const root = parseHtml(html);
  scrubExecutables(root);
  root.querySelectorAll('audio, video').forEach((media) => {
    media.setAttribute('controls', '');
    if (!media.getAttribute('preload')) media.setAttribute('preload', 'metadata');
    if (!media.getAttribute('aria-label')) {
      media.setAttribute('aria-label', labelOf(media, labels));
    }
    // Une vidéo déposée en pleine résolution déborderait de la colonne de la question.
    if (media.tagName === 'VIDEO') (media as HTMLElement).style.maxWidth = '100%';
  });
  return root.innerHTML;
}

/**
 * Sur le papier, un média ne se joue pas : il laisse la mention de ce qu'il y avait à écouter ou
 * à regarder, pour que la feuille ne cache pas une partie de l'énoncé. L'enveloppe que pose
 * l'éditeur (`div.audio-wrapper`) part avec lui, sinon elle laisserait un cadre vide.
 */
export function mentionMedia(root: HTMLElement, labels = DEFAULT_MEDIA_LABELS): void {
  root.querySelectorAll('audio, video').forEach((media) => {
    const mention = root.ownerDocument.createElement('p');
    mention.className = 'fst-italic';
    mention.textContent = `[${labelOf(media, labels)}]`;
    (media.closest('div.audio-wrapper, div.video-wrapper') ?? media).replaceWith(mention);
  });
}

/** Un contenu porte-t-il un média ? Sert à prévenir qu'une impression le laissera de côté. */
export const hasMedia = (html: string | null | undefined): boolean =>
  !!html && parseHtml(html).querySelector('audio, video') !== null;
