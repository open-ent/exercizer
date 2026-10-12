// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  answersTypeOf,
  answerZone,
  availableOptions,
  fillTextSlots,
  fitMargins,
  nextZoneId,
  nextZonePosition,
  printableFillText,
  pruneZones,
  removeSharedOption,
  sanitizeHtml,
  shuffledOptions,
  switchAnswersType,
  toModel,
  toScreen,
  zoneCopyData,
  zoneIdsInHtml,
} from './zones';

const HTML =
  '<div>Le chat <span contenteditable="false"><fill-zone zone-id="0" class="ng-isolate-scope">' +
  '<text-zone ng-class="x"></text-zone></fill-zone>&nbsp;</span>la souris, puis ' +
  '<fill-zone zone-id="2"></fill-zone>.</div>';

describe('modèle', () => {
  it('lit la façon de répondre, « texte » à défaut', () => {
    expect(answersTypeOf({ answersType: 'list' })).toBe('list');
    expect(answersTypeOf({ answersType: 'autre' })).toBe('text');
    expect(answersTypeOf(undefined)).toBe('text');
  });

  it('numérote une nouvelle zone après la dernière, même s’il y a eu des suppressions', () => {
    expect(nextZoneId([])).toBe(0);
    expect(nextZoneId([{ id: 0, answer: 'a' }, { id: 4, answer: 'b' }])).toBe(5);
  });

  it('pose les nouvelles zones en escalier', () => {
    expect(nextZonePosition([{ answer: 'a' }, { answer: 'b' }])).toEqual({ x: 30, y: 30, z: 2 });
  });

  it('fait des réponses les étiquettes communes en passant au glisser-déposer', () => {
    const next = switchAnswersType(
      { answersType: 'text', zones: [{ id: 0, answer: 'un' }, { id: 1, answer: 'deux' }] },
      'drag',
    );
    expect(next.answersType).toBe('drag');
    expect(next.options).toEqual(['un', 'deux']);
  });

  it('donne à chaque zone les étiquettes communes en passant à la liste', () => {
    const next = switchAnswersType(
      { answersType: 'drag', options: ['un', 'deux'], zones: [{ id: 0, answer: 'un' }] },
      'list',
    );
    expect(next.zones).toEqual([{ id: 0, answer: 'un', options: ['un', 'deux'] }]);
  });

  it('à défaut d’étiquettes, ne propose que la bonne réponse', () => {
    const next = switchAnswersType({ zones: [{ id: 0, answer: 'un' }] }, 'list');
    expect(next.zones?.[0].options).toEqual(['un']);
  });

  it('retire une étiquette, et sur une image les zones qui l’attendaient', () => {
    const data = { options: ['a', 'b'], zones: [{ answer: 'a' }, { answer: 'b' }] };
    expect(removeSharedOption(data, 'a', false)).toEqual({
      options: ['b'],
      zones: [{ answer: 'a' }, { answer: 'b' }],
    });
    expect(removeSharedOption(data, 'a', true).zones).toEqual([{ answer: 'b' }]);
  });

  it('prépare la copie : tout le grain, sans les réponses', () => {
    const copy = zoneCopyData({
      answersType: 'list',
      htmlContent: HTML,
      _guideImage: '/workspace/document/x',
      options: ['a'],
      zones: [{ id: 0, answer: 'chasse', options: ['chasse', 'dort'] }],
    });
    expect(copy).toEqual({
      answersType: 'list',
      htmlContent: HTML,
      _guideImage: '/workspace/document/x',
      options: ['a'],
      zones: [{ id: 0, answer: '', options: ['chasse', 'dort'] }],
    });
  });
});

describe('passation', () => {
  it('ne laisse pas la bonne réponse en tête des propositions', () => {
    // Tirage figé : le premier mélange rend l'ordre d'origine, le second l'inverse.
    const draws = [0.99, 0.99, 0, 0];
    const random = () => draws.shift() ?? 0;
    expect(shuffledOptions(['a', 'b', 'c'], random)[0]).not.toBe('a');
  });

  it('rend telle quelle une proposition unique, et écarte les valeurs nulles', () => {
    expect(shuffledOptions(['a'])).toEqual(['a']);
    expect(shuffledOptions(['a', null as unknown as string])).toEqual(['a']);
  });

  it('compte deux étiquettes de même texte pour deux', () => {
    const zones = [{ answer: 'un' }, { answer: '' }];
    expect(availableOptions(['un', 'un', 'deux'], zones)).toEqual(['un', 'deux']);
  });

  it('pose et efface une réponse sans toucher aux autres zones', () => {
    const data = { zones: [{ answer: '' }, { answer: 'b' }] };
    expect(answerZone(data, 0, 'a').zones).toEqual([{ answer: 'a' }, { answer: 'b' }]);
    expect(answerZone(data, 1, '').zones).toEqual([{ answer: '' }, { answer: '' }]);
  });
});

describe('texte à trous', () => {
  it('retrouve les zones du texte, dans l’ordre de lecture', () => {
    expect(zoneIdsInHtml(HTML)).toEqual([0, 2]);
    expect(zoneIdsInHtml(undefined)).toEqual([]);
  });

  it('remplace chaque zone par un emplacement, et ôte les restes d’AngularJS', () => {
    const slots = fillTextSlots(HTML);
    expect(slots).toContain('<span data-zone-id="0"></span>');
    expect(slots).toContain('<span data-zone-id="2"></span>');
    expect(slots).not.toContain('fill-zone');
    expect(slots).not.toContain('ng-class');
  });

  it('retire ce qui s’exécute', () => {
    const clean = sanitizeHtml(
      '<p onclick="x()">a<script>alert(1)</script><a href="java script:alert(1)">b</a>' +
        '<img src="/workspace/document/1" onerror="x()"></p>',
    );
    expect(clean).toBe('<p>a<a>b</a><img src="/workspace/document/1"></p>');
  });

  it('retire du grain les zones effacées du texte', () => {
    const data = {
      zones: [
        { id: 0, answer: 'a' },
        { id: 1, answer: 'b' },
        { id: 2, answer: 'c' },
      ],
    };
    expect(pruneZones(data, HTML).zones?.map((zone) => zone.id)).toEqual([0, 2]);
  });

  it('imprime un trait à compléter et ses propositions', () => {
    const data = {
      answersType: 'list',
      htmlContent: HTML,
      zones: [
        { id: 0, answer: 'chasse', options: ['chasse', 'dort'] },
        { id: 2, answer: 'dort', options: [] },
      ],
    };
    const blank = printableFillText(data, false);
    expect(blank).toContain(' _______  [chasse / dort] ');
    expect(blank).not.toContain('<b>');
    const answered = printableFillText(data, true);
    expect(answered).toContain('<u><b>chasse</b></u> [chasse / dort] ');
    expect(answered).toContain('<u><b>dort</b></u>');
  });

  it('n’imprime pas les propositions d’un glisser-déposer zone par zone', () => {
    const data = {
      answersType: 'drag',
      htmlContent: HTML,
      zones: [{ id: 0, answer: 'chasse', options: ['x'] }],
    };
    expect(printableFillText(data, false)).not.toContain('[x]');
  });
});

describe('géométrie', () => {
  const full = { width: 760, height: 600 };

  it('ne décale rien quand l’image remplit son cadre', () => {
    expect(fitMargins(full, full)).toEqual({ horizontal: 0, vertical: 0 });
  });

  it('centre une image plus plate ou plus étroite que le cadre', () => {
    expect(fitMargins({ width: 760, height: 300 }, full)).toEqual({ horizontal: 0, vertical: 150 });
    expect(fitMargins({ width: 380, height: 600 }, full)).toEqual({ horizontal: 190, vertical: 0 });
  });

  it('convertit par le centre du bloc', () => {
    // À l'échelle 1, une étiquette (160 de large dans le modèle, 150 à l'écran) se décale de 5.
    expect(toScreen({ x: 100, y: 100 }, full, full, 'text')).toEqual({ left: 105, top: 100 });
    expect(toScreen({ x: 100, y: 100 }, full, full, 'image')).toEqual({ left: 100, top: 100 });
  });

  it('suit la réduction de l’image', () => {
    const half = { width: 380, height: 300 };
    expect(toScreen({ x: 100, y: 100 }, half, full, 'image')).toEqual({ left: 25, top: 25 });
  });

  it('revient au modèle après un déplacement', () => {
    for (const kind of ['text', 'image'] as const) {
      const view = { width: 608, height: 480 };
      const screen = toScreen({ x: 200, y: 150 }, view, full, kind);
      const model = toModel(screen, view, full, kind);
      // L'aller-retour passe par des pixels entiers : un point d'écart au plus.
      expect(Math.abs(model.x - 200)).toBeLessThanOrEqual(1);
      expect(Math.abs(model.y - 150)).toBeLessThanOrEqual(1);
    }
  });
});
