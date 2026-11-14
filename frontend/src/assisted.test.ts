import { describe, expect, it } from 'vitest';

import { AssistedItem, AssistedResponse, assistedDraft, assistedItem, numberLines } from './assisted';
import { draftToImport, missingAnswer, SourceLine } from './digitize';
import { GRAIN } from './grains';

/** Des lignes comme les rendrait la lecture : une par entrée, 30 px de haut, 40 px d'écart. */
function lines(text: string, page = 1): SourceLine[] {
  return text.split('\n').map((raw, index) => ({
    page,
    text: raw,
    segments: [raw.trim()],
    y0: index * 40,
    y1: index * 40 + 30,
  }));
}

const item = (overrides: Partial<AssistedItem>): AssistedItem => ({
  type: 'open',
  label: '1',
  lines: null,
  text: ['Question'],
  answers: [],
  expected: [],
  multiple: false,
  points: 1,
  proposed: false,
  ...overrides,
});

describe('numberLines', () => {
  it('numérote à partir de 1 en écartant les lignes vides', () => {
    const { sent, source } = numberLines(lines('Titre\n\n1. Question'));
    expect(sent).toEqual([
      { n: 1, page: 1, text: 'Titre' },
      { n: 2, page: 1, text: '1. Question' },
    ]);
    expect(source.map((line) => line.text)).toEqual(['Titre', '1. Question']);
  });
});

describe('assistedItem', () => {
  const source = lines('Titre\nExercice 1\n1. Capitale de la France ?\na) Paris\nb) Lyon');

  it('QCM : cases cochées, zone de la page tirée des lignes désignées', () => {
    const draft = assistedItem(
      item({ type: 'qcm', lines: [3, 5], answers: [{ text: 'Paris', correct: true }, { text: 'Lyon' }] }),
      source,
    );
    expect(draft.grainTypeId).toBe(GRAIN.QCM);
    expect(draft.answers.map((answer) => answer.checked)).toEqual([true, false]);
    expect(draft.multiple).toBe(false);
    expect(draft.region).toEqual({ page: 1, y0: 80, y1: 190 });
    expect(draft.warnings).toEqual([]);
    expect(missingAnswer(draft)).toBe(false);
  });

  it('QCM sans bonne réponse : à cocher', () => {
    const draft = assistedItem(item({ type: 'qcm', answers: [{ text: 'A' }, { text: 'B' }] }), source);
    expect(draft.warnings).toContain('checked');
    expect(missingAnswer(draft)).toBe(true);
  });

  it('plusieurs bonnes réponses : QCM multiple', () => {
    const draft = assistedItem(
      item({ type: 'qcm', answers: [{ text: 'A', correct: true }, { text: 'B', correct: true }] }),
      source,
    );
    expect(draft.multiple).toBe(true);
  });

  it('réponse proposée par le modèle : signalée en premier', () => {
    const draft = assistedItem(item({ type: 'simple', expected: ['Paris'], proposed: true }), source);
    expect(draft.expected).toEqual(['Paris']);
    expect(draft.warnings[0]).toBe('proposed');
  });

  it('pas de signalement « proposée » sur un énoncé ni une réponse rédigée', () => {
    expect(assistedItem(item({ type: 'statement', proposed: true }), source).warnings).toEqual([]);
    expect(assistedItem(item({ type: 'open', proposed: true }), source).warnings).toEqual([]);
  });

  it('texte à trous : autant de réponses que de trous', () => {
    const ok = assistedItem(item({ type: 'cloze', text: ['Le ___ est sur le ___.'], expected: ['chat', 'toit'] }), source);
    expect(ok.expected).toEqual(['chat', 'toit']);
    expect(ok.warnings).toEqual([]);

    const short = assistedItem(item({ type: 'cloze', text: ['Le ___ est sur le ___.'], expected: ['chat'] }), source);
    expect(short.expected).toEqual(['chat', '']);
    expect(short.warnings).toContain('blanks');
    expect(missingAnswer(short)).toBe(true);
  });

  it('texte à trous sans trou écrit : un trou ajouté, à reprendre', () => {
    const draft = assistedItem(item({ type: 'cloze', text: ['Complète'], expected: ['mot'] }), source);
    expect(draft.paragraphs).toEqual(['Complète', '___']);
    expect(draft.expected).toEqual(['mot']);
  });

  it('association : paires gauche/droite', () => {
    const draft = assistedItem(
      item({ type: 'association', answers: [{ text: 'chien', right: 'aboie' }, { text: 'chat', right: 'miaule' }] }),
      source,
    );
    expect(draft.answers).toEqual([
      { text: 'chien', right: 'aboie', checked: false },
      { text: 'chat', right: 'miaule', checked: false },
    ]);
    expect(missingAnswer(draft)).toBe(false);
  });

  it('énoncé : sans barème', () => {
    const draft = assistedItem(item({ type: 'statement', points: 3 }), source);
    expect(draft.grainTypeId).toBe(GRAIN.STATEMENT);
    expect(draft.score).toBe(0);
  });

  it('lignes inconnues : zone vide sur la première page', () => {
    const draft = assistedItem(item({ lines: null }), source);
    expect(draft.region).toEqual({ page: 1, y0: 0, y1: 0 });
  });
});

describe('assistedDraft', () => {
  it('parties, lignes écartées et figure rattachée, jusqu’aux grains importés', () => {
    const source = lines('Nom :\nExercice 1\n1. Observe la figure.\n\n\n2. Combien font 2 + 2 ?');
    const { source: kept } = numberLines(source);
    const response: AssistedResponse = {
      title: 'Devoir',
      ignored: [1],
      sections: [
        {
          title: 'Exercice 1',
          items: [
            item({ type: 'statement', label: '', lines: [3, 3], text: ['Observe la figure.'] }),
            item({ type: 'simple', label: '2', lines: [4, 4], text: ['Combien font 2 + 2 ?'], expected: ['4'], points: 2 }),
          ],
        },
      ],
    };
    // Une figure sous la consigne (y 130 → 190) : rattachée à l'énoncé.
    const draft = assistedDraft(response, kept, [{ page: 1, y0: 130, y1: 190 }]);
    expect(draft.title).toBe('Devoir');
    expect(draft.ignored).toEqual(['Nom :']);
    expect(draft.sections).toHaveLength(1);
    const [statement, question] = draft.sections[0].items;
    expect(statement.attachExcerpt).toBe(true);
    expect(statement.warnings).toContain('figure');
    expect(question.score).toBe(2);

    const { grains, sections } = draftToImport(draft, {}, 'Question');
    expect(grains.map((grain) => grain.grain_type_id)).toEqual([GRAIN.STATEMENT, GRAIN.SIMPLE_ANSWER]);
    expect(grains[1].grain_data.custom_data).toEqual({ correct_answer: '4' });
    expect(sections).toEqual([{ title: 'Exercice 1', orders: [1, 2] }]);
  });
});
