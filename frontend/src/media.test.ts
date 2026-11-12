// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { hasMedia, mediaLabels, mentionMedia, playableHtml } from './media';

/** Ce qu'écrit l'éditeur du socle quand l'enseignant s'enregistre au micro. */
const RECORDED =
  '<p>Écoutez la dictée.</p>' +
  '<div class="audio-wrapper">' +
  '<audio src="/workspace/document/abc-123" data-document-id="abc-123"></audio>' +
  '</div>';

const parse = (html: string): HTMLElement =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

describe('médias d’un énoncé', () => {
  it('équipe l’enregistrement d’un lecteur, que l’éditeur ne pose pas lui-même', () => {
    const audio = parse(playableHtml(RECORDED)).querySelector('audio')!;
    expect(audio.hasAttribute('controls')).toBe(true);
    expect(audio.getAttribute('preload')).toBe('metadata');
    expect(audio.getAttribute('aria-label')).toBe('Enregistrement audio');
    expect(audio.getAttribute('src')).toBe('/workspace/document/abc-123');
  });

  it('garde le texte autour, et le document d’origine', () => {
    const root = parse(playableHtml(RECORDED));
    expect(root.textContent).toContain('Écoutez la dictée.');
    expect(root.querySelector('audio')!.getAttribute('data-document-id')).toBe('abc-123');
  });

  it('traduit le nom du lecteur', () => {
    const labels = { audio: 'Audio recording', video: 'Video' };
    const audio = parse(playableHtml(RECORDED, labels)).querySelector('audio')!;
    expect(audio.getAttribute('aria-label')).toBe('Audio recording');
  });

  it('ne réécrit pas ce que l’auteur a déjà réglé', () => {
    const html = '<audio src="x" preload="none" aria-label="La dictée de lundi"></audio>';
    const audio = parse(playableHtml(html)).querySelector('audio')!;
    expect(audio.getAttribute('preload')).toBe('none');
    expect(audio.getAttribute('aria-label')).toBe('La dictée de lundi');
  });

  it('borne une vidéo à la largeur de la colonne', () => {
    const video = parse(playableHtml('<video src="x"></video>')).querySelector('video')!;
    expect(video.hasAttribute('controls')).toBe(true);
    expect(video.style.maxWidth).toBe('100%');
  });

  it('assainit au passage — un énoncé reste du contenu, pas du code', () => {
    const html = '<audio src="x" onerror="alert(1)"></audio><script>alert(2)</script>';
    const root = parse(playableHtml(html));
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('audio')!.hasAttribute('onerror')).toBe(false);
  });

  it('garde les cadres : une vidéo externe insérée dans un énoncé s’affichait déjà', () => {
    const html = '<div class="iframe-wrapper"><iframe src="https://peertube.example/w/1"></iframe></div>';
    expect(parse(playableHtml(html)).querySelector('iframe')).not.toBeNull();
  });

  it('laisse intact un énoncé sans média, et rend une chaîne vide sans énoncé', () => {
    expect(playableHtml('<p>Trois phrases.</p>')).toBe('<p>Trois phrases.</p>');
    expect(playableHtml(undefined)).toBe('');
    expect(playableHtml(null)).toBe('');
  });

  it('lit ses libellés dans l’i18n', () => {
    expect(mediaLabels((key) => key)).toEqual({
      audio: 'exercizer.media.audio',
      video: 'exercizer.media.video',
    });
  });
});

describe('médias à l’impression', () => {
  it('remplace l’enregistrement par sa mention, enveloppe comprise', () => {
    const root = parse(RECORDED);
    mentionMedia(root);
    expect(root.querySelector('audio')).toBeNull();
    expect(root.querySelector('div.audio-wrapper')).toBeNull();
    expect(root.textContent).toContain('[Enregistrement audio]');
    expect(root.textContent).toContain('Écoutez la dictée.');
  });

  it('mentionne aussi une vidéo, avec le libellé traduit', () => {
    const root = parse('<video src="x"></video>');
    mentionMedia(root, { audio: 'Audio recording', video: 'Video' });
    expect(root.textContent).toBe('[Video]');
  });
});

describe('présence d’un média', () => {
  it('répond sur le contenu brut, avant tout traitement', () => {
    expect(hasMedia(RECORDED)).toBe(true);
    expect(hasMedia('<video src="x"></video>')).toBe(true);
    expect(hasMedia('<p>Trois phrases.</p>')).toBe(false);
    expect(hasMedia(undefined)).toBe(false);
  });
});

describe('formules d’un énoncé', () => {
  it('met en forme les `$…$` en MathML, et laisse le texte autour', () => {
    const html = playableHtml('<p>Calculer <strong>$\\sum_{i=1}^{n} x_i$</strong> pour 3 $ ou 4 $</p>');
    expect(html).toContain('<strong><span class="math-formula"><span class="katex"><math');
    expect(html).toContain('<msubsup><mo>∑</mo>');
    expect(html).toContain('</strong> pour 3 <span class="math-formula">');
  });

  it('ne lit pas le LaTeX comme du HTML, et ne rend rien dans un bloc de code', () => {
    expect(playableHtml('<p>$a &lt; b$</p>')).toContain('<mo>&lt;</mo>');
    expect(playableHtml('<pre><code>$x$</code></pre>')).toBe('<pre><code>$x$</code></pre>');
  });
});
