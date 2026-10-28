/** Sujet simple préparé depuis un message de la Conversation : titre et description (HTML) déjà remplis. */
export interface ConversationSubject {
  title: string;
  description: string;
}

interface ConversationAttachment {
  id?: string;
  name?: string;
  /** « empty » : le message n'a aucune pièce jointe. */
  file?: string;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Un paramètre de la Conversation : JSON, encodé en URI, puis en base64, puis en URI (contrat de l'ancienne IHM,
 * `EditSimpleSubjectController#initFromUrlParams`). `null` si le paramètre est absent ou illisible.
 */
function decodeParam<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(atob(decodeURIComponent(raw)))) as T;
  } catch {
    return null;
  }
}

/**
 * Sujet simple à créer depuis un message (`?messagebody=<pièces jointes>&event=<{ message, object }>`).
 * Il faut les deux paramètres et un message ; le titre est l'objet du message (vide à défaut) et la description reprend la
 * liste des pièces jointes — liens vers l'espace documentaire — puis le corps du message. Sans cela : `null`, et l'éditeur
 * crée un sujet vierge comme d'habitude.
 */
export function parseConversationSubject(search: URLSearchParams): ConversationSubject | null {
  const files = decodeParam<ConversationAttachment[]>(search.get('messagebody'));
  const event = decodeParam<{ message?: string; object?: string }>(search.get('event'));
  if (!Array.isArray(files) || !event || typeof event.message !== 'string') return null;

  const attachments = files.filter((file) => file && file.id && file.file !== 'empty');
  const body = `<div>${event.message}<br></div>`;
  const list = attachments.length
    ? `<h2>Pièces jointes</h2><ul>${attachments
        .map((file) => `<li><a href="/workspace/document/${encodeURIComponent(String(file.id))}">${escapeHtml(file.name ?? String(file.id))}</a></li>`)
        .join('')}</ul>`
    : '';
  return { title: typeof event.object === 'string' ? event.object : '', description: list + body };
}
