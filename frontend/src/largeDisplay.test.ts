import { describe, expect, it } from 'vitest';

import { GRAIN } from './grains';
import { canCheckInstantly, htmlToSpeech, instantVerdict, speechText } from './largeDisplay';
import { GrainCopy, GrainCustomCopyData } from './types';

const copyOf = (
  grain_type_id: number,
  custom_copy_data: GrainCustomCopyData,
  extra: Partial<GrainCopy['grain_copy_data']> = {},
): GrainCopy =>
  ({
    id: 1,
    subject_copy_id: 1,
    grain_type_id,
    grain_scheduled_id: 10,
    order_by: 1,
    grain_copy_data: { title: 'Question', max_score: 2, custom_copy_data, ...extra },
  }) as GrainCopy;

describe('htmlToSpeech', () => {
  it('retire les balises et marque une pause entre deux paragraphes', () => {
    expect(htmlToSpeech('<p>Combien font <b>2 + 2</b> ?</p><p>Écris le résultat</p>')).toBe(
      'Combien font 2 + 2 ? Écris le résultat.',
    );
  });

  it('décode les entités de l’éditeur', () => {
    expect(htmlToSpeech('9,1&nbsp;&times;&nbsp;4 &amp; 3 &#8364;')).toBe('9,1 × 4 & 3 €');
  });

  it('ne lit rien pour un énoncé vide', () => {
    expect(htmlToSpeech(undefined)).toBe('');
    expect(htmlToSpeech('<p></p>')).toBe('');
  });
});

describe('speechText', () => {
  it('lit le titre puis l’énoncé', () => {
    const grain = copyOf(GRAIN.SIMPLE_ANSWER, {}, { title: 'Calcul', statement: '<p>3 + 4 ?</p>' });
    expect(speechText(grain)).toBe('Calcul. 3 + 4 ?');
  });

  it('lit aussi les propositions d’un QCM', () => {
    const grain = copyOf(
      GRAIN.QCM,
      { filled_answer_list: [{ text: 'Un chat' }, { text: 'Un chien' }] },
      { title: 'Qui miaule ?' },
    );
    expect(speechText(grain)).toBe('Qui miaule ? Un chat. Un chien');
  });

  it('lit le texte d’un énoncé, rangé dans la copie', () => {
    const grain = copyOf(GRAIN.STATEMENT, { statement: '<p>Lis bien.</p>' }, { title: 'Consigne' });
    expect(speechText(grain)).toBe('Consigne. Lis bien');
  });
});

describe('instantVerdict', () => {
  it('juge juste une réponse simple exacte, aux accents près', () => {
    const grain = copyOf(GRAIN.SIMPLE_ANSWER, { filled_answer: 'noel' });
    expect(instantVerdict(grain, { correct_answer: 'Noël' })).toBe('correct');
  });

  it('juge faux une réponse simple erronée', () => {
    const grain = copyOf(GRAIN.SIMPLE_ANSWER, { filled_answer: '36' });
    expect(instantVerdict(grain, { correct_answer: '36,4' })).toBe('wrong');
  });

  it('distingue une réponse multiple à moitié juste', () => {
    const grain = copyOf(GRAIN.MULTIPLE_ANSWERS, {
      filled_answer_list: [{ text: 'rouge' }, { text: 'vert' }],
    });
    const reference = { correct_answer_list: [{ text: 'rouge' }, { text: 'bleu' }] };
    expect(instantVerdict(grain, reference)).toBe('partial');
  });

  it('juge une question sans barème sur ses réponses une à une', () => {
    const grain = copyOf(GRAIN.SIMPLE_ANSWER, { filled_answer: 'Paris' }, { max_score: 0 });
    expect(instantVerdict(grain, { correct_answer: 'Paris' })).toBe('correct');
  });

  it('ne se prononce pas sur une réponse ouverte, ni sans référence', () => {
    expect(instantVerdict(copyOf(GRAIN.OPEN_ANSWER, { filled_answer: 'x' }), {})).toBeNull();
    expect(instantVerdict(copyOf(GRAIN.SIMPLE_ANSWER, { filled_answer: 'x' }), undefined)).toBeNull();
    expect(canCheckInstantly(GRAIN.STATEMENT)).toBe(false);
    expect(canCheckInstantly(GRAIN.QCM)).toBe(true);
  });
});
