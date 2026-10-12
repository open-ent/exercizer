// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { GRAIN } from './grains';
import { allImages, applyImageLinks, MoodleXmlError, parseMoodleXml } from './moodleImport';
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
