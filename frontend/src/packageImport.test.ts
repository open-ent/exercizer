// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import {
  classificationFromCodes,
  htmlToText,
  normaliseGrains,
  previewGrains,
  sortNotices,
  suggestedTitle,
} from './packageImport';

describe('import depuis un autre format', () => {
  it('rend les grains de l’aperçu comme des grains de sujet, sans id réel', () => {
    const grains = previewGrains([
      { grain_type_id: 3, order_by: 0, grain_data: { custom_data: { statement: '<p>a</p>' } } },
      { grain_type_id: 4, order_by: 1, grain_data: { custom_data: { correct_answer: 'b' } } },
    ]);
    expect(grains.map((grain) => grain.id)).toEqual([-1, -2]);
    expect(grains[1].order_by).toBe(1);
  });

  it('range les avertissements du plus grave au plus anodin', () => {
    const sorted = sortNotices([
      { level: 'info', code: 'a', message: 'a' },
      { level: 'degraded', code: 'b', message: 'b' },
      { level: 'error', code: 'c', message: 'c' },
      { level: 'dropped', code: 'd', message: 'd' },
    ]);
    expect(sorted.map((notice) => notice.level)).toEqual(['error', 'dropped', 'degraded', 'info']);
  });

  it('traduit les codes de niveaux et matières d’un paquet en identifiants', () => {
    const referential = {
      levels: [
        { id: 1, code: '4E', label: '4e', rank: 1, level_group: null },
        { id: 2, code: '3E', label: '3e', rank: 2, level_group: null },
      ],
      disciplines: [{ id: 9, code: 'FRANCAIS', label: 'Français' }],
    };
    expect(classificationFromCodes(referential, ['4e', 'CP'], ['FRANCAIS'])).toEqual({
      level_ids: [1],
      discipline_ids: [9],
    });
    expect(classificationFromCodes(undefined, ['4E'])).toEqual({ level_ids: [], discipline_ids: [] });
  });

  it('propose le titre du sujet converti, sinon le nom du fichier', () => {
    expect(suggestedTitle(null, 'banque_volcans-4e.gift')).toBe('banque volcans 4e');
    expect(
      suggestedTitle(
        {
          format: 'gift',
          formatLabel: 'GIFT',
          counts: { sections: 1, activities: 1, questions: 1, grains: 1 },
          fidelity: 'full',
          notices: [],
          preview: { subject: { title: 'Cours importé' }, grains: [] },
        },
        'volcans.gift',
      ),
    ).toBe('volcans');
  });

  it('réduit au texte l’explication HTML d’un grain venu d’un paquet', () => {
    const [grain] = normaliseGrains([
      { grain_type_id: 4, order_by: 0, grain_data: { answer_explanation: '<p>« que » est le <strong>COD</strong>.</p>' } },
    ]);
    expect(grain.grain_data.answer_explanation).toBe('« que » est le COD.');
    expect(htmlToText('<p>Un</p><p>Deux</p>')).toBe('Un\nDeux');
    expect(htmlToText('texte simple')).toBe('texte simple');
  });
});
