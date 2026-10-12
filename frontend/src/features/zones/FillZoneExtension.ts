import { Editor, mergeAttributes, Node } from '@tiptap/core';

/** Classe des pastilles de zone dans l'éditeur — l'écran s'en sert pour tenir leur libellé à jour. */
export const FILL_ZONE_CLASS = 'exercizer-fill-zone';

export interface FillZoneOptions {
  /** Le texte de la pastille : la bonne réponse de la zone. */
  label: (zoneId: number) => string;
  /** Clic sur une pastille : l'enseignant veut modifier la zone. */
  onEdit: (zoneId: number) => void;
  /** L'éditeur est prêt : l'écran en a besoin pour y insérer une zone au curseur. */
  onReady: (editor: Editor) => void;
}

/**
 * La zone d'un « texte à trous », pour l'éditeur riche du socle.
 *
 * L'éditeur d'AngularJS insérait des balises `<fill-zone zone-id="…">` dans le texte ; sans cette
 * extension, tiptap les écarterait comme inconnues en ouvrant le grain, et l'enregistrement
 * suivant effacerait toutes les zones. Elle les lit et les réécrit donc TELLES QUELLES — même
 * balise, même attribut — pour que les deux interfaces continuent de s'échanger les sujets.
 *
 * Dans l'éditeur la zone est un bloc insécable (`atom`) : on ne tape pas dedans, on clique
 * dessus pour en changer la réponse.
 */
export const FillZone = Node.create<FillZoneOptions>({
  name: 'fillZone',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { label: () => '', onEdit: () => undefined, onReady: () => undefined };
  },

  addAttributes() {
    return {
      zoneId: {
        default: 0,
        parseHTML: (element) => Number.parseInt(element.getAttribute('zone-id') ?? '0', 10) || 0,
        renderHTML: (attributes) => ({ 'zone-id': attributes.zoneId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'fill-zone' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['fill-zone', mergeAttributes(HTMLAttributes)];
  },

  onCreate() {
    this.options.onReady(this.editor);
  },

  addNodeView() {
    return ({ node }) => {
      const zoneId = node.attrs.zoneId as number;
      const dom = document.createElement('button');
      dom.type = 'button';
      dom.className = `${FILL_ZONE_CLASS} btn btn-sm btn-outline-secondary mx-4 py-0`;
      dom.contentEditable = 'false';
      dom.dataset.zoneId = String(zoneId);
      dom.textContent = this.options.label(zoneId) || '…';
      dom.addEventListener('click', (event) => {
        event.preventDefault();
        this.options.onEdit(zoneId);
      });
      return { dom };
    };
  },
});

/** Insère une zone à l'endroit du curseur, suivie d'une espace pour pouvoir continuer à écrire. */
export function insertFillZone(editor: Editor, zoneId: number): void {
  editor
    .chain()
    .focus()
    .insertContent([
      { type: 'fillZone', attrs: { zoneId } },
      { type: 'text', text: ' ' },
    ])
    .run();
}
