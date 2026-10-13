// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { GRAIN } from './grains';
import {
  allImages,
  applyImageLinks,
  evaluateFormula,
  markerTopLeft,
  MoodleXmlError,
  parseClozeAnswers,
  parseMoodleXml,
} from './moodleImport';
import { atLeast, lowestRight, RESOURCE, subjectRight } from './rights';
import { Subject } from './types';

const trueFalse = (value: string) => (value === 'true' ? 'Vrai' : 'Faux');
const noImage = () => null;
const parse = (questions: string) =>
  parseMoodleXml(`<?xml version="1.0"?><quiz>${questions}</quiz>`, trueFalse, noImage);

// « iVBORw0KGgo= » : huit octets, assez pour fabriquer un Blob sans dépendre d'une vraie image.
const PNG = 'iVBORw0KGgo=';

describe('parseMoodleXml', () => {
  it('refuse un fichier qui n’est pas du XML', () => {
    expect(() => parseMoodleXml('<quiz><question>', trueFalse, noImage)).toThrow(MoodleXmlError);
  });

  it('ignore les catégories et les types inconnus, sans laisser de trou dans les rangs', () => {
    const result = parse(`
      <question type="category"><category><text>$course$/top</text></category></question>
      <question type="calculated"><name><text>Calcul</text></name></question>
      <question type="essay"><name><text>Rédaction</text></name>
        <questiontext><text>Racontez.</text></questiontext></question>`);
    expect(result.total).toBe(2);
    expect(result.unsupported).toEqual(['Calcul']);
    expect(result.grains).toHaveLength(1);
    expect(result.grains[0]).toMatchObject({ grain_type_id: GRAIN.OPEN_ANSWER, order_by: 1 });
    expect(result.grains[0].grain_data.max_score).toBe(1);
    expect(result.grains[0].grain_data.statement).toBe('<div>Racontez.</div>');
  });

  it('fait d’une description un énoncé', () => {
    const [grain] = parse(`
      <question type="description"><name><text>Consigne</text></name>
        <questiontext><text><![CDATA[Lisez <i>bien</i>.]]></text></questiontext></question>`).grains;
    expect(grain.grain_type_id).toBe(GRAIN.STATEMENT);
    expect(grain.grain_data.statement).toBeUndefined();
    expect(grain.grain_data.custom_data?.statement).toBe(
      '<div>Lisez <span style="font-style: italic;">bien</span>.</div>',
    );
  });

  it('distingue réponse simple et réponses multiples au nombre de réponses', () => {
    const { grains } = parse(`
      <question type="shortanswer"><name><text>Une</text></name>
        <defaultgrade>2.0000000</defaultgrade>
        <answer fraction="100"><text>Paris</text></answer></question>
      <question type="shortanswer"><name><text>Plusieurs</text></name>
        <answer fraction="100"><text>Lyon</text></answer>
        <answer fraction="0"><text>Nice</text></answer>
        <answer fraction="50"><text>Lille</text></answer></question>`);
    expect(grains[0].grain_type_id).toBe(GRAIN.SIMPLE_ANSWER);
    expect(grains[0].grain_data.max_score).toBe(2);
    expect(grains[0].grain_data.custom_data?.correct_answer).toBe('Paris');
    expect(grains[1].grain_type_id).toBe(GRAIN.MULTIPLE_ANSWERS);
    expect(grains[1].grain_data.custom_data?.correct_answer_list).toEqual([
      { text: 'Lyon' },
      { text: 'Lille' },
    ]);
    // Sans barème dans le fichier : un point par bonne réponse.
    expect(grains[1].grain_data.max_score).toBe(2);
  });

  it('traduit un vrai/faux et le rend sans erreur admise', () => {
    const [grain] = parse(`
      <question type="truefalse"><name><text>VF</text></name>
        <answer fraction="100"><text>true</text></answer>
        <answer fraction="0"><text>false</text></answer></question>`).grains;
    expect(grain.grain_type_id).toBe(GRAIN.QCM);
    expect(grain.grain_data.custom_data).toEqual({
      no_error_allowed: true,
      correct_answer_list: [
        { text: 'Vrai', isChecked: true },
        { text: 'Faux', isChecked: false },
      ],
    });
  });

  it('retire les balises des propositions d’un QCM', () => {
    const [grain] = parse(`
      <question type="multichoice"><name><text>QCM</text></name><single>false</single>
        <answer fraction="50"><text><![CDATA[<p>Deux &amp; trois</p>]]></text></answer></question>`)
      .grains;
    expect(grain.grain_data.custom_data?.correct_answer_list?.[0].text).toBe('Deux & trois');
    expect(grain.grain_data.custom_data?.no_error_allowed).toBe(false);
  });

  it('importe une association', () => {
    const [grain] = parse(`
      <question type="matching"><name><text>Capitales</text></name>
        <subquestion><text>France</text><answer><text>Paris</text></answer></subquestion>
        <subquestion><text>Italie</text><answer><text>Rome</text></answer></subquestion>
      </question>`).grains;
    expect(grain.grain_type_id).toBe(GRAIN.ASSOCIATION);
    expect(grain.grain_data.max_score).toBe(2);
    expect(grain.grain_data.custom_data?.correct_answer_list).toEqual([
      { text_left: 'France', text_right: 'Paris' },
      { text_left: 'Italie', text_right: 'Rome' },
    ]);
  });

  it('fait d’un texte à choix un texte à trous, leurres compris', () => {
    const [grain] = parse(`
      <question type="gapselect"><name><text>Trous</text></name>
        <questiontext><text>Le chat [[1]] la souris.</text></questiontext>
        <selectoption><text>mange</text><group>1</group></selectoption>
        <selectoption><text>dort</text><group>1</group></selectoption>
        <selectoption><text>bleu</text><group>2</group></selectoption>
      </question>`).grains;
    expect(grain.grain_type_id).toBe(GRAIN.TEXT_TO_FILL);
    const custom = grain.grain_data.custom_data!;
    expect(custom.answersType).toBe('list');
    expect(custom.zones).toEqual([{ answer: 'mange', options: ['mange', 'dort'], id: 0 }]);
    expect(custom.htmlContent).toContain('<fill-zone zone-id="0"');
    expect(custom.htmlContent).toContain('placeholder="mange"');
    expect(custom.htmlContent).not.toContain('[[1]]');
  });

  it('met en commun les étiquettes d’un glisser-déposer dans le texte', () => {
    const [grain] = parse(`
      <question type="ddwtos"><name><text>Glisser</text></name>
        <questiontext><text>[[1]] et [[2]]</text></questiontext>
        <dragbox><text>un</text><group>1</group></dragbox>
        <dragbox><text>deux</text><group>1</group></dragbox>
        <dragbox><text>trois</text><group>1</group></dragbox>
      </question>`).grains;
    const custom = grain.grain_data.custom_data!;
    expect(custom.answersType).toBe('drag');
    expect(custom.options).toEqual(['un', 'trois', 'deux']);
    expect(custom.zones).toEqual([
      { answer: 'un', options: [], id: 0 },
      { answer: 'deux', options: [], id: 1 },
    ]);
  });
});

describe('mise en ordre (ordering)', () => {
  it('range les éléments selon leur position exportée', () => {
    const [grain] = parse(`
      <question type="ordering"><name><text>Planètes</text></name>
        <questiontext format="html"><text><![CDATA[<p>Du Soleil vers l'extérieur.</p>]]></text></questiontext>
        <defaultgrade>3</defaultgrade>
        <answer fraction="2.0000000" format="html"><text><![CDATA[<p>Vénus</p>]]></text></answer>
        <answer fraction="1.0000000" format="html"><text><![CDATA[<p>Mercure</p>]]></text></answer>
        <answer fraction="3.0000000" format="html"><text><![CDATA[<p>Terre</p>]]></text></answer>
      </question>`).grains;
    expect(grain.grain_type_id).toBe(GRAIN.ORDER_BY);
    expect(grain.grain_data.max_score).toBe(3);
    expect(grain.grain_data.statement).toContain('Du Soleil');
    expect(grain.grain_data.custom_data?.correct_answer_list).toEqual([
      { text: 'Mercure', order_by: 1 },
      { text: 'Vénus', order_by: 2 },
      { text: 'Terre', order_by: 3 },
    ]);
  });

  it('garde l’ordre du fichier si les positions sont inutilisables', () => {
    const [grain] = parse(`
      <question type="ordering"><name><text>Étapes</text></name>
        <answer fraction="0"><text>Un</text></answer>
        <answer fraction="0"><text>Deux</text></answer>
      </question>`).grains;
    expect(grain.grain_data.custom_data?.correct_answer_list?.map((a) => a.text)).toEqual(['Un', 'Deux']);
  });
});

describe('cloze (multianswer)', () => {
  it('lit les réponses d’un trou : bonne, partielle, fausse, commentaires et échappements', () => {
    expect(parseClozeAnswers('=Paris#Bravo~%50%Lutèce~Lyon#Non~a\\~b')).toEqual([
      { text: 'Paris', fraction: 100 },
      { text: 'Lutèce', fraction: 50 },
      { text: 'Lyon', fraction: 0 },
      { text: 'a~b', fraction: 0 },
    ]);
  });

  it('fait des listes quand tous les trous sont des choix', () => {
    const [grain] = parse(`
      <question type="multianswer"><name><text>Capitales</text></name>
        <questiontext format="html"><text><![CDATA[<p>La capitale de la France est {1:MULTICHOICE:Lyon~=Paris~Nice}, celle de l'Italie {1:MC:=Rome~Milan}.</p>]]></text></questiontext>
      </question>`).grains;
    expect(grain.grain_type_id).toBe(GRAIN.TEXT_TO_FILL);
    expect(grain.grain_data.statement).toBeUndefined();
    const custom = grain.grain_data.custom_data!;
    expect(custom.answersType).toBe('list');
    expect(custom.zones).toEqual([
      { answer: 'Paris', options: ['Lyon', 'Paris', 'Nice'], id: 0 },
      { answer: 'Rome', options: ['Rome', 'Milan'], id: 1 },
    ]);
    expect(custom.htmlContent).toContain('zone-id="0"');
    expect(custom.htmlContent).toContain('zone-id="1"');
    expect(custom.htmlContent).not.toContain('MULTICHOICE');
    expect(grain.grain_data.max_score).toBe(2);
  });

  it('passe en saisie libre dès qu’un trou est à saisir, numérique exacte comprise', () => {
    const [grain] = parse(`
      <question type="multianswer"><name><text>Mélange</text></name>
        <defaultgrade>4</defaultgrade>
        <questiontext><text><![CDATA[Le chat {2:SHORTANSWER:=dort~%50%dors} ; 7 x 6 = {1:NUMERICAL:=42} ; {1:MC:=oui~non}]]></text></questiontext>
      </question>`).grains;
    const custom = grain.grain_data.custom_data!;
    expect(custom.answersType).toBe('text');
    expect(custom.zones?.map((zone) => zone.answer)).toEqual(['dort', '42', 'oui']);
    expect(custom.zones?.every((zone) => zone.options?.length === 0)).toBe(true);
    expect(grain.grain_data.max_score).toBe(4);
  });

  it('écarte une question dont un trou n’a pas d’équivalent', () => {
    const result = parse(`
      <question type="multianswer"><name><text>Tolérance</text></name>
        <questiontext><text>Pi vaut {1:NUMERICAL:=3.14:0.01}</text></questiontext></question>
      <question type="multianswer"><name><text>Plusieurs</text></name>
        <questiontext><text>Pairs : {1:MULTIRESPONSE:=2~=4~3}</text></questiontext></question>
      <question type="multianswer"><name><text>Joker</text></name>
        <questiontext><text>Un mot : {1:SA:=chat*}</text></questiontext></question>`);
    expect(result.grains).toHaveLength(0);
    expect(result.unsupported).toEqual(['Tolérance', 'Plusieurs', 'Joker']);
  });
});

describe('marqueurs à glisser-déposer (ddmarker)', () => {
  it('ramène chaque forme au coin de son rectangle englobant', () => {
    expect(markerTopLeft('circle', '100,80;20')).toEqual({ x: 80, y: 60 });
    expect(markerTopLeft('rectangle', '10,15;40,30')).toEqual({ x: 10, y: 15 });
    expect(markerTopLeft('polygon', '50,60;20,90;70,40')).toEqual({ x: 20, y: 40 });
    expect(markerTopLeft('star', '1,1')).toBeNull();
    expect(markerTopLeft('circle', 'a,b;c')).toBeNull();
  });

  it('fait des zones d’image, les étiquettes de texte devenant des images', () => {
    const result = parseMoodleXml(
      `<?xml version="1.0"?><quiz>
      <question type="ddmarker"><name><text>Carte de France</text></name>
        <questiontext><text>Placez les villes.</text></questiontext>
        <file name="france.png" encoding="base64">${PNG}</file>
        <drag><no>1</no><text>Paris</text><noofdrags>1</noofdrags></drag>
        <drag><no>2</no><text>Lyon</text><noofdrags>1</noofdrags></drag>
        <drop><no>1</no><shape>circle</shape><coords>200,100;15</coords><choice>1</choice></drop>
        <drop><no>2</no><shape>rectangle</shape><coords>250,300;30,20</coords><choice>2</choice></drop>
      </question></quiz>`,
      trueFalse,
      () => PNG,
    );
    const [grain] = result.grains;
    expect(grain.grain_type_id).toBe(GRAIN.AREA_SELECT_IMAGE);
    const drag = result.images.get(1)!.drag_drop;
    expect(Object.keys(drag)).toEqual(['0', '1', '2']);
    drag[0].link = '/workspace/document/france';
    drag[1].link = '/workspace/document/paris';
    drag[2].link = '/workspace/document/lyon';
    applyImageLinks(result.grains, result.images);
    expect(grain.grain_data.custom_data).toMatchObject({
      _guideImage: '/workspace/document/france',
      zones: [
        { position: { x: 185, y: 85, z: 1 }, answer: '/workspace/document/paris' },
        { position: { x: 250, y: 300, z: 2 }, answer: '/workspace/document/lyon' },
      ],
    });
  });

  it('écarte un marqueur sans image de fond ou à forme inconnue', () => {
    const result = parse(`
      <question type="ddmarker"><name><text>Sans fond</text></name>
        <drop><no>1</no><shape>circle</shape><coords>1,1;1</coords><choice>1</choice></drop></question>`);
    expect(result.unsupported).toEqual(['Sans fond']);
  });
});

describe('calculée simple (calculatedsimple)', () => {
  it('évalue une formule sans eval, et refuse ce qu’elle ne connaît pas', () => {
    const vars = new Map([
      ['a', 3],
      ['b', 4],
    ]);
    expect(evaluateFormula('sqrt(pow({a},2) + {b}**2)', vars)).toBe(5);
    expect(evaluateFormula('-{a} * (2 + 1) % 4', vars)).toBe(-1);
    expect(evaluateFormula('round(pi(), 2)', vars)).toBe(3.14);
    expect(evaluateFormula('log(8, 2)', vars)).toBeCloseTo(3);
    expect(evaluateFormula('{c} + 1', vars)).toBeNull();
    expect(evaluateFormula('alert(1)', vars)).toBeNull();
    expect(evaluateFormula('1 / 0', vars)).toBeNull();
    expect(evaluateFormula('2 +', vars)).toBeNull();
  });

  it('fige le premier jeu de valeurs dans l’énoncé et calcule la réponse attendue', () => {
    const [grain] = parse(`
      <question type="calculatedsimple"><name><text>Rectangle</text></name>
        <questiontext format="html"><text><![CDATA[<p>Un rectangle mesure {l} cm sur {L} cm. Son aire vaut {=2*{l}} fois sa largeur… Quelle est son aire ?</p>]]></text></questiontext>
        <defaultgrade>2</defaultgrade>
        <answer fraction="100"><text>{l} * {L}</text><tolerance>0.01</tolerance><tolerancetype>1</tolerancetype>
          <correctanswerformat>1</correctanswerformat><correctanswerlength>2</correctanswerlength></answer>
        <dataset_definitions>
          <dataset_definition><status><text>private</text></status><name><text>l</text></name>
            <dataset_items><dataset_item><number>1</number><value>2.5</value></dataset_item>
              <dataset_item><number>2</number><value>9</value></dataset_item></dataset_items></dataset_definition>
          <dataset_definition><status><text>private</text></status><name><text>L</text></name>
            <dataset_items><dataset_item><number>1</number><value>4.1</value></dataset_item></dataset_items></dataset_definition>
        </dataset_definitions>
      </question>`).grains;
    expect(grain.grain_type_id).toBe(GRAIN.SIMPLE_ANSWER);
    expect(grain.grain_data.max_score).toBe(2);
    expect(grain.grain_data.statement).toContain('2,5 cm sur 4,1 cm');
    expect(grain.grain_data.statement).toContain('vaut 5 fois');
    expect(grain.grain_data.custom_data?.correct_answer).toBe('10,25');
    expect(grain.grain_data.answer_hint).toContain('2 décimale');
  });

  it('écarte une calculée simple sans valeur ou à formule illisible', () => {
    const result = parse(`
      <question type="calculatedsimple"><name><text>Vide</text></name>
        <questiontext><text>{x} ?</text></questiontext>
        <answer fraction="100"><text>{x}*2</text></answer></question>
      <question type="calculatedsimple"><name><text>Illisible</text></name>
        <questiontext><text>{x} ?</text></questiontext>
        <answer fraction="100"><text>system({x})</text></answer>
        <dataset_definitions><dataset_definition><name><text>x</text></name>
          <dataset_items><dataset_item><number>1</number><value>1</value></dataset_item></dataset_items>
        </dataset_definition></dataset_definitions></question>`);
    expect(result.unsupported).toEqual(['Vide', 'Illisible']);
  });
});

describe('images', () => {
  it('remplace la référence Moodle d’une image d’énoncé par son lien', () => {
    const result = parse(`
      <question type="essay"><name><text>Image</text></name>
        <questiontext><text><![CDATA[<p><img src="@@PLUGINFILE@@/carte%20monde.png" alt=""></p>]]></text>
          <file name="carte monde.png" path="/" encoding="base64">${PNG}</file></questiontext>
      </question>`);
    const images = allImages(result.images);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ name: 'carte monde.png', path: '/' });
    images[0].link = '/workspace/document/abc';
    applyImageLinks(result.grains, result.images);
    expect(result.grains[0].grain_data.statement).toContain('<img src="/workspace/document/abc"/');
    expect(result.grains[0].grain_data.statement).not.toContain('PLUGINFILE');
  });

  it('pose l’image jointe de TDBase avant l’énoncé', () => {
    const result = parse(`
      <question type="essay"><name><text>Jointe</text></name>
        <questiontext><text>Décrivez.</text></questiontext>
        <image>images/schema.png</image><image_base64>${PNG}</image_base64>
      </question>`);
    allImages(result.images)[0].link = '/workspace/document/xyz';
    applyImageLinks(result.grains, result.images);
    expect(result.grains[0].grain_data.statement).toMatch(
      /^<div><\/div><div><img src="\/workspace\/document\/xyz".*<div>Décrivez\.<\/div>$/,
    );
  });

  it('relie les zones d’une image à leurs étiquettes déposées', () => {
    const result = parse(`
      <question type="ddimageortext"><name><text>Carte</text></name>
        <file name="fond.png" encoding="base64">${PNG}</file>
        <drag><no>1</no><text>a</text><file name="a.png" encoding="base64">${PNG}</file></drag>
        <drag><no>2</no><text>b</text><file name="b.png" encoding="base64">${PNG}</file></drag>
        <drop><no>1</no><choice>2</choice><xleft>10</xleft><ytop>20</ytop></drop>
      </question>`);
    const [grain] = result.grains;
    expect(grain.grain_type_id).toBe(GRAIN.AREA_SELECT_IMAGE);
    const drag = result.images.get(1)!.drag_drop;
    drag[0].link = '/workspace/document/fond';
    drag[1].link = '/workspace/document/a';
    drag[2].link = '/workspace/document/b';
    applyImageLinks(result.grains, result.images);
    expect(grain.grain_data.custom_data).toMatchObject({
      _guideImage: '/workspace/document/fond',
      options: ['/workspace/document/b'],
      zones: [{ position: { x: 10, y: 20, z: 1 }, answer: '/workspace/document/b' }],
    });
  });
});

describe('droits sur un sujet', () => {
  const subject = (over: Partial<Subject> = {}): Subject => ({
    id: 1,
    folder_id: null,
    owner: 'prof',
    title: 'Sujet',
    ...over,
  });

  it('donne tout au propriétaire', () => {
    expect(subjectRight(subject(), { userId: 'prof' })).toBe('owner');
  });

  it('lit le partage, à la personne comme au groupe', () => {
    const shared = subject({
      shared: [
        { userId: 'collegue', [RESOURCE.contrib]: true },
        { groupId: 'equipe', [RESOURCE.manager]: true, [RESOURCE.contrib]: true },
      ],
    });
    expect(subjectRight(shared, { userId: 'collegue' })).toBe('contrib');
    expect(subjectRight(shared, { userId: 'autre', groupsIds: ['equipe'] })).toBe('manager');
    expect(subjectRight(shared, { userId: 'inconnu', groupsIds: [] })).toBe('read');
  });

  it('retient le droit le plus faible d’une sélection', () => {
    expect(lowestRight(['owner', 'manager', 'contrib'])).toBe('contrib');
    expect(lowestRight([])).toBe('owner');
    expect(atLeast('manager', 'contrib')).toBe(true);
    expect(atLeast('read', 'contrib')).toBe(false);
  });
});
