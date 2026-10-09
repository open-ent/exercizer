import { Alert, Button, Heading } from '@open-ent/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { copyQuestionNumber, GRAIN, isQuestion } from '../../grains';
import { formatScore } from '../../correction';
import { GrainCopy } from '../../types';

/**
 * L'en-tête d'un grain dans une copie — portage de `grain-copy-header`.
 *
 * Un énoncé n'affiche que son titre. Une question affiche son numéro, son titre et son barème,
 * puis les avertissements qui changent la façon d'y répondre (« une seule erreur et tout est
 * faux », « plusieurs réponses possibles »), et l'aide si l'enseignant en a laissé une.
 */
export function GrainCopyHeader({
  grainCopy,
  grainCopies,
  /** L'aide n'est proposée que pendant la passation : à la relecture, elle n'a plus d'objet. */
  showHint = false,
}: {
  grainCopy: GrainCopy;
  grainCopies: GrainCopy[];
  showHint?: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const [hintOpen, setHintOpen] = useState(false);

  const data = grainCopy.grain_copy_data;
  const custom = data.custom_copy_data ?? {};
  const hint = data.answer_hint;

  if (grainCopy.grain_type_id === GRAIN.STATEMENT) {
    return (
      <Heading level="h2" headingStyle="h4" className="mb-8">
        {data.title}
      </Heading>
    );
  }

  return (
    <header className="mb-16">
      <div className="d-flex align-items-baseline justify-content-between gap-16 flex-wrap">
        <Heading level="h2" headingStyle="h4" className="m-0">
          {isQuestion(grainCopy.grain_type_id) &&
            `${copyQuestionNumber(grainCopy, grainCopies)}) `}
          {data.title}
        </Heading>
        <span className="text-muted text-nowrap">
          {formatScore(data.max_score)} {t('exercizer.score')}
        </span>
      </div>

      {custom.no_error_allowed && (
        <Alert type="warning" className="mt-8">
          {t('exercizer.grain.no.error.allowed')}
        </Alert>
      )}
      {custom.multipleAnswers && (
        <p className="text-muted mt-8 mb-0">
          <small>{t('exercizer.grain.multiple.answers')}</small>
        </p>
      )}

      {showHint && hint && (
        <div className="mt-8">
          <Button
            color="tertiary"
            variant="ghost"
            aria-expanded={hintOpen}
            onClick={() => setHintOpen(!hintOpen)}
          >
            {t('exercizer.grain.help')}
          </Button>
          {hintOpen && (
            <p className="mt-4 mb-0">
              <em className="text-muted">{hint}</em>
            </p>
          )}
        </div>
      )}
    </header>
  );
}

/** L'énoncé d'un grain, en HTML — `grain-copy-statement`. */
export function GrainCopyStatement({ grainCopy }: { grainCopy: GrainCopy }) {
  const data = grainCopy.grain_copy_data;
  // Un énoncé (type 3) porte son texte dans `custom_copy_data.statement` (recopié de
  // `custom_data` à la lecture) ; une question, dans `statement`.
  const html =
    grainCopy.grain_type_id === GRAIN.STATEMENT
      ? data.custom_copy_data?.statement
      : data.statement;
  if (!html) return null;
  // Contenu produit par l'éditeur du socle côté enseignant, affiché comme le faisait
  // `bind-html` de l'ancienne IHM.
  return <div className="mb-16" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Les documents attachés à un grain — conservés pour les sujets anciens. */
export function GrainCopyDocuments({ grainCopy }: { grainCopy: GrainCopy }) {
  const { t } = useTranslation(['exercizer', 'common']);
  const documents = grainCopy.grain_copy_data.document_list ?? [];
  if (documents.length === 0) return null;
  return (
    <section className="mb-16">
      <p className="form-label mb-4">{t('exercizer.grain.document')}</p>
      <ul>
        {documents.map((doc) => (
          <li key={doc.id}>
            <a href={doc.path ?? `/workspace/document/${doc.id}`} target="_blank" rel="noreferrer">
              {doc.name ?? doc.title ?? doc.id}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default GrainCopyHeader;
