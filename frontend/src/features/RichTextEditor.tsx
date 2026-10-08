import { Editor, type EditorInstance } from '@open-ent/react/editor';

/**
 * Éditeur riche du socle, pour les énoncés (du HTML, comme dans l'IHM AngularJS).
 *
 * Importé DIRECTEMENT, et non en `lazy` : la frontière `Suspense` doit rester hors de toute
 * fenêtre modale du socle — suspendre à l'intérieur d'une modale animée par react-spring lève
 * une erreur React #321 et la fenêtre n'est jamais rendue. Ici, c'est la ROUTE de l'éditeur de
 * sujet qui est différée (cf. `routes.tsx`) : le morceau tiptap ne part donc au navigateur que
 * lorsqu'on ouvre un sujet.
 */

/**
 * Contenu initial de l'éditeur. Une chaîne VIDE le fait planter — erreur React #321 levée depuis
 * le paquet de l'éditeur, qui laisse tout l'écran non rendu. On lui passe un paragraphe vide.
 */
function initialContent(content: string | undefined): string {
  return content && content.trim() ? content : '<p></p>';
}

export interface RichTextEditorProps {
  content: string | undefined;
  /** `edit` pour saisir, `read` pour afficher le HTML existant. */
  mode?: 'edit' | 'read';
  id?: string;
  placeholder?: string;
  onChange?: (html: string) => void;
}

export function RichTextEditor({
  content,
  mode = 'edit',
  id,
  placeholder,
  onChange,
}: RichTextEditorProps) {
  return (
    <Editor
      id={id}
      content={initialContent(content)}
      mode={mode}
      focus={false}
      placeholder={placeholder}
      variant={mode === 'read' ? 'ghost' : 'outline'}
      visibility="protected"
      onContentChange={
        onChange
          ? ({ editor }: { editor: EditorInstance }) =>
              onChange(editor.isEmpty ? '' : editor.getHTML())
          : undefined
      }
    />
  );
}

export default RichTextEditor;
