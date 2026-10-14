import { describe, expect, it } from 'vitest';

import {
  buildDraft,
  classifyLine,
  clozeHtml,
  Draft,
  DraftItem,
  draftToImport,
  extractPoints,
  missingAnswer,
  retypeItem,
  SourceLine,
  splitInlineChoices,
} from './digitize';
import { GRAIN } from './grains';

/** Des lignes comme les rendrait la lecture d'une page : une par entrée, 30 px de haut. */
function lines(text: string, page = 1): SourceLine[] {
  let y = 0;
  return text.split('\n').map((raw) => {
    const segments = raw.split(/\s{4,}/).map((part) => part.trim()).filter(Boolean);
    const line = { page, text: raw.trim(), segments: segments.length ? segments : [''], y0: y, y1: y + 30 };
    y += 40;
    return line;
  });
}

const allItems = (draft: Draft): DraftItem[] => draft.sections.flatMap((section) => section.items);

describe('classifyLine', () => {
  it('reconnaît les titres de partie', () => {
    expect(classifyLine('Exercice 2 : les fractions (4 points)')).toEqual({
      kind: 'section',
      title: 'Exercice 2 : les fractions (4 points)',
    });
    expect(classifyLine('PARTIE B')).toMatchObject({ kind: 'section' });
    expect(classifyLine('Partie II - Grammaire')).toMatchObject({ kind: 'section' });
  });

  it('distingue une question numérotée d’un calcul', () => {
    expect(classifyLine('1. Quelle est la capitale de la France ?')).toEqual({
      kind: 'question',
      label: '1',
      text: 'Quelle est la capitale de la France ?',
    });
    expect(classifyLine('3) Calcule 12 × 4.')).toMatchObject({ kind: 'question', label: '3' });
    expect(classifyLine('2.5 + 3 = 5.5')).toMatchObject({ kind: 'text' });
  });

  it('lit les propositions et les cases', () => {
    expect(classifyLine('a) Paris')).toMatchObject({ kind: 'item', marker: 'letter', label: 'a' });
    expect(classifyLine('B. Lyon')).toMatchObject({ kind: 'item', marker: 'upper', label: 'b' });
    expect(classifyLine('☐ Marseille')).toMatchObject({ kind: 'item', marker: 'box', checked: false });
    expect(classifyLine('☒ Paris')).toMatchObject({ kind: 'item', marker: 'box', checked: true });
    expect(classifyLine('[x] Paris')).toMatchObject({ kind: 'item', checked: true });
    expect(classifyLine('• chat')).toMatchObject({ kind: 'item', marker: 'bullet' });
  });

  it('écarte l’en-tête, les numéros de page et la place pour répondre', () => {
    expect(classifyLine('Nom : ........ Prénom : ........')).toEqual({ kind: 'noise' });
    expect(classifyLine('Classe : 5e B')).toEqual({ kind: 'noise' });
    expect(classifyLine('Page 1/2')).toEqual({ kind: 'noise' });
    expect(classifyLine('- 2 -')).toEqual({ kind: 'noise' });
    expect(classifyLine('.......................................')).toEqual({ kind: 'answerLine' });
    expect(classifyLine('Réponse : ______________')).toEqual({ kind: 'answerLine' });
  });
});

describe('splitInlineChoices', () => {
  it('découpe des propositions posées sur une même ligne', () => {
    expect(splitInlineChoices('☐ Vrai ☒ Faux')).toEqual([
      { text: 'Vrai', checked: false },
      { text: 'Faux', checked: true },
    ]);
    expect(splitInlineChoices('a) 12 b) 15 c) 18')).toEqual([
      { text: '12', checked: false },
      { text: '15', checked: false },
      { text: '18', checked: false },
    ]);
    expect(splitInlineChoices('Le chat dort.')).toBeNull();
  });
});

describe('extractPoints', () => {
  it('retire le barème et le rend à part', () => {
    expect(extractPoints('Calcule 3 × 4. (2 pts)')).toEqual({ text: 'Calcule 3 × 4.', points: 2 });
    expect(extractPoints('Explique ta démarche 1,5 point')).toEqual({ text: 'Explique ta démarche', points: 1.5 });
    expect(extractPoints('Conjugue le verbe /3')).toEqual({ text: 'Conjugue le verbe', points: 3 });
    expect(extractPoints('Sans barème')).toEqual({ text: 'Sans barème', points: null });
  });
});

describe('buildDraft — devoir de collège', () => {
  const draft = buildDraft(
    lines(`Devoir de géographie n°2
Nom : ............ Prénom : ............ Classe : ......
Exercice 1 : questions de cours (3 points)
1. Quelle est la capitale de la France ? Coche la bonne réponse.
☐ Lyon
☒ Paris
☐ Marseille
2. Explique pourquoi les villes se sont développées le long des fleuves. (2 pts)
.......................................................
.......................................................
.......................................................
Exercice 2
Le Rhône prend sa source en ________ et se jette dans la mer ________ .
3. Relie chaque fleuve à sa mer.
Seine    Manche
Rhône    Méditerranée
4. Range ces villes de la plus au nord à la plus au sud, dans l'ordre :
- Lille
- Paris
- Marseille
Page 1/1`),
  );

  it('propose le titre du devoir et écarte l’en-tête', () => {
    expect(draft.title).toBe('Devoir de géographie n°2');
    expect(draft.ignored).toEqual(['Nom : ............ Prénom : ............ Classe : ......', 'Page 1/1']);
  });

  it('découpe en parties', () => {
    expect(draft.sections.map((section) => section.title)).toEqual([
      'Exercice 1 : questions de cours',
      'Exercice 2',
    ]);
  });

  it('reconnaît un QCM et son corrigé coché', () => {
    const qcm = draft.sections[0].items[0];
    expect(qcm.grainTypeId).toBe(GRAIN.QCM);
    expect(qcm.label).toBe('1');
    expect(qcm.answers).toEqual([
      { text: 'Lyon', checked: false },
      { text: 'Paris', checked: true },
      { text: 'Marseille', checked: false },
    ]);
    expect(qcm.warnings).not.toContain('checked');
    expect(missingAnswer(qcm)).toBe(false);
  });

  it('fait d’une question à rédiger une réponse ouverte, avec son barème', () => {
    const open = draft.sections[0].items[1];
    expect(open.grainTypeId).toBe(GRAIN.OPEN_ANSWER);
    expect(open.score).toBe(2);
    expect(open.paragraphs).toEqual(['Explique pourquoi les villes se sont développées le long des fleuves.']);
  });

  it('fait d’une phrase à trous un texte à trous', () => {
    const cloze = draft.sections[1].items[0];
    expect(cloze.grainTypeId).toBe(GRAIN.TEXT_TO_FILL);
    expect(cloze.expected).toEqual(['', '']);
    expect(cloze.warnings).toContain('blanks');
    expect(missingAnswer(cloze)).toBe(true);
  });

  it('lit les deux colonnes d’un exercice « relie »', () => {
    const matching = draft.sections[1].items[1];
    expect(matching.grainTypeId).toBe(GRAIN.ASSOCIATION);
    expect(matching.answers).toEqual([
      { text: 'Seine', right: 'Manche' },
      { text: 'Rhône', right: 'Méditerranée' },
    ]);
    expect(matching.warnings).toContain('pairs');
  });

  it('fait d’un « range dans l’ordre » une mise en ordre', () => {
    const order = draft.sections[1].items[2];
    expect(order.grainTypeId).toBe(GRAIN.ORDER_BY);
    expect(order.answers.map((answer) => answer.text)).toEqual(['Lille', 'Paris', 'Marseille']);
  });
});

describe('buildDraft — fiche du premier degré', () => {
  it('reconnaît les consignes sans numéro et les sous-questions', () => {
    const draft = buildDraft(
      lines(`Mathématiques
Calcule :
a) 12 + 7 = ......
b) 30 - 8 = ......
Combien de pattes a une araignée ?
Vrai ou faux ?
• Le chat est un mammifère.
• La baleine est un poisson.`),
    );
    const items = allItems(draft);
    expect(items.map((item) => item.grainTypeId)).toEqual([
      GRAIN.STATEMENT,
      GRAIN.SIMPLE_ANSWER,
      GRAIN.SIMPLE_ANSWER,
      GRAIN.SIMPLE_ANSWER,
      GRAIN.STATEMENT,
      GRAIN.QCM,
      GRAIN.QCM,
    ]);
    expect(items[1].label).toBe('a');
    expect(items[1].paragraphs).toEqual(['12 + 7 =']);
    expect(items[5].answers.map((answer) => answer.text)).toEqual(['Vrai', 'Faux']);
    expect(items[5].paragraphs).toEqual(['Le chat est un mammifère.']);
  });

  it('rattache une figure à la consigne qui la précède', () => {
    const source = lines(`Fiche
1. Combien de côtés a ce polygone ?
2. Explique ta réponse.`);
    // Lignes à y = 0, 40, 80 ; la figure est entre la question 1 et la question 2.
    const draft = buildDraft(source, [{ page: 1, y0: 72, y1: 300 }]);
    const [first, second] = allItems(draft);
    expect(first.attachExcerpt).toBe(true);
    expect(first.warnings).toContain('figure');
    expect(first.region).toEqual({ page: 1, y0: 40, y1: 300 });
    expect(second.attachExcerpt).toBe(false);
  });

  it('recolle un mot coupé en fin de ligne', () => {
    const draft = buildDraft(lines(`Titre\nLe texte suivant est un exem-\nple de paragraphe.`));
    expect(allItems(draft)[0].paragraphs).toEqual(['Le texte suivant est un exemple de paragraphe.']);
  });
});

describe('draftToImport', () => {
  const draft = buildDraft(
    lines(`Devoir
Consignes : réponds sur la feuille.
Exercice 1
1. Quelle est la capitale de la France ?
☐ Lyon
☒ Paris
Exercice 2
2. Le Rhône se jette dans la mer ________ en passant par ________ .`),
  );

  it('rend les grains dans l’ordre, numérotés, et le plan des parties', () => {
    const result = draftToImport(draft, {}, 'Question');
    expect(result.grains.map((grain) => [grain.grain_type_id, grain.order_by])).toEqual([
      [GRAIN.STATEMENT, 1],
      [GRAIN.QCM, 2],
      [GRAIN.TEXT_TO_FILL, 3],
    ]);
    expect(result.grains[1].grain_data.title).toBe('Question 1');
    expect(result.grains[1].grain_data.custom_data?.correct_answer_list).toEqual([
      { text: 'Lyon', isChecked: false },
      { text: 'Paris', isChecked: true },
    ]);
    expect(result.grains[0].grain_data.custom_data?.statement).toBe('<p>Consignes : réponds sur la feuille.</p>');
    expect(result.sections).toEqual([
      { title: 'Exercice 1', orders: [2] },
      { title: 'Exercice 2', orders: [3] },
    ]);
  });

  it('pose les zones du texte à trous avec les réponses saisies à la relecture', () => {
    const cloze = { ...allItems(draft)[2], expected: ['Méditerranée', 'Lyon'] };
    const result = draftToImport({ ...draft, sections: [{ key: 's', title: null, items: [cloze] }] }, {}, 'Question');
    const data = result.grains[0].grain_data.custom_data;
    expect(data?.zones).toEqual([
      { answer: 'Méditerranée', options: [], id: 0 },
      { answer: 'Lyon', options: [], id: 1 },
    ]);
    expect(data?.htmlContent).toContain('zone-id="0"');
    expect(data?.htmlContent).toContain('placeholder="Lyon"');
    expect(data?.answersType).toBe('text');
  });

  it('écarte les éléments décochés et joint les extraits', () => {
    const [statement, qcm] = allItems(draft);
    const result = draftToImport(
      { ...draft, sections: [{ key: 's', title: null, items: [{ ...statement, include: false }, qcm] }] },
      { [qcm.key]: '/workspace/document/abc' },
      'Question',
    );
    expect(result.grains).toHaveLength(1);
    expect(result.grains[0].grain_data.statement).toBe(
      '<p>Quelle est la capitale de la France ?</p><p><img src="/workspace/document/abc" alt="" /></p>',
    );
  });

  it('échappe le HTML du texte lu', () => {
    const { html } = clozeHtml(['3 < 4 et ____'], ['vrai']);
    expect(html.startsWith('<p>3 &lt; 4 et ')).toBe(true);
  });
});

describe('retypeItem', () => {
  it('prépare ce qu’il faut au nouveau type', () => {
    const [item] = allItems(buildDraft(lines(`Titre\n1. Explique la photosynthèse.`)));
    expect(item.grainTypeId).toBe(GRAIN.OPEN_ANSWER);
    const simple = retypeItem(item, GRAIN.SIMPLE_ANSWER);
    expect(simple.expected).toEqual(['']);
    expect(missingAnswer(simple)).toBe(true);
    const qcm = retypeItem(item, GRAIN.QCM);
    expect(qcm.answers).toHaveLength(2);
    expect(retypeItem(item, GRAIN.STATEMENT).score).toBe(0);
  });
});
