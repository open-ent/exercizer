import { describe, expect, it } from 'vitest';

import { parseConversationSubject } from './conversationSubject';

/** Fabrique le paramètre tel que la Conversation le produit : JSON → URI → base64 → URI. */
const param = (value: unknown) => encodeURIComponent(btoa(encodeURIComponent(JSON.stringify(value))));
const search = (files: unknown, event: unknown) => new URLSearchParams(`messagebody=${param(files)}&event=${param(event)}`);

describe('parseConversationSubject', () => {
  it('reprend l’objet comme titre, les pièces jointes puis le message', () => {
    const s = parseConversationSubject(search([{ id: 'd1', name: 'Exercice 1.pdf' }, { id: 'd2', name: 'Corrigé & notes.docx' }], { message: '<p>Voici le devoir</p>', object: 'Devoir de maths' }));
    expect(s?.title).toBe('Devoir de maths');
    expect(s?.description).toBe(
      '<h2>Pièces jointes</h2><ul><li><a href="/workspace/document/d1">Exercice 1.pdf</a></li><li><a href="/workspace/document/d2">Corrigé &amp; notes.docx</a></li></ul><div><p>Voici le devoir</p><br></div>',
    );
  });
  it('message sans pièce jointe : le corps seul', () => {
    const s = parseConversationSubject(search([{ file: 'empty' }], { message: 'Bonjour', object: 'Sujet' }));
    expect(s).toEqual({ title: 'Sujet', description: '<div>Bonjour<br></div>' });
  });
  it('objet absent : titre vide', () => {
    expect(parseConversationSubject(search([{ file: 'empty' }], { message: 'x' }))?.title).toBe('');
  });
  it('accents et emojis du message conservés', () => {
    expect(parseConversationSubject(search([{ file: 'empty' }], { message: 'Équation à résoudre ✏️', object: 'Contrôle n°2' }))).toEqual({ title: 'Contrôle n°2', description: '<div>Équation à résoudre ✏️<br></div>' });
  });
  it('un nom de pièce jointe n’injecte pas de balise', () => {
    const s = parseConversationSubject(search([{ id: 'd1', name: '<img src=x onerror=alert(1)>' }], { message: 'm' }));
    expect(s?.description).not.toContain('<img');
    expect(s?.description).toContain('&lt;img');
  });
  it('paramètres absents, incomplets ou illisibles : null', () => {
    expect(parseConversationSubject(new URLSearchParams(''))).toBeNull();
    expect(parseConversationSubject(new URLSearchParams(`messagebody=${param([])}`))).toBeNull();
    expect(parseConversationSubject(new URLSearchParams('messagebody=%%%&event=zzz'))).toBeNull();
    expect(parseConversationSubject(search([{ file: 'empty' }], { object: 'sans message' }))).toBeNull();
  });
});
