import { Alert, Button, EmptyScreen, FormControl, Label, LoadingScreen, Modal, TextArea } from '@open-ent/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import illuExercizer from '@images/emptyscreen/illu-exercizer.svg';
import {
  decideAlignmentProposals,
  getAlignmentProposals,
  getCatalogUsage,
  removeCatalogReview,
  reviewCatalogSubject,
} from '../api';
import { groupProposals, ratingStars } from '../catalog';
import { AlignmentProposal, CatalogSubject } from '../types';

/**
 * Qualité et confiance du catalogue (cf. sql/046-catalog-quality.sql) : les signaux d'usage d'un
 * exercice — copies, établissements, avis des collègues — et la file où les modérateurs valident les
 * rattachements au programme proposés par les enseignants.
 */

/** Une note moyenne au dixième, dans la langue de l'usager : « 4,2 ». */
function useRatingFormat() {
  const { i18n } = useTranslation();
  return (rating: number) =>
    rating.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** La ligne d'usage d'une carte : « 12 copies · 5 établissements · ★★★★☆ 4,2 (3 avis) » ; rien si jamais copié. */
export function UsageLine({
  subject,
}: {
  subject: Pick<CatalogSubject, 'copy_count' | 'structure_count' | 'rating_avg' | 'rating_count'>;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const format = useRatingFormat();
  const copies = subject.copy_count ?? 0;
  const ratings = subject.rating_count ?? 0;
  if (copies === 0 && ratings === 0) return null;
  const parts = [
    t('exercizer.catalog.usage.copies', { count: copies }),
    t('exercizer.catalog.usage.structures', { count: subject.structure_count ?? 0 }),
  ];
  return (
    <span className="small text-muted" data-testid="catalog-usage">
      {parts.join(' · ')}
      {ratings > 0 && subject.rating_avg != null && (
        <>
          {' · '}
          <span aria-hidden="true" className="text-warning">
            {ratingStars(subject.rating_avg)}
          </span>{' '}
          {t('exercizer.catalog.usage.rating', { rating: format(subject.rating_avg), count: ratings })}
        </>
      )}
    </span>
  );
}

/** Le choix d'une note de 1 à 5, en étoiles. */
function RatingInput({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  const { t } = useTranslation(['exercizer', 'common']);
  return (
    <div role="radiogroup" aria-label={t('exercizer.catalog.review.rating')} className="d-flex gap-4 fs-4">
      {[1, 2, 3, 4, 5].map((rating) => (
        <button
          key={rating}
          type="button"
          role="radio"
          aria-checked={value === rating}
          aria-label={t('exercizer.catalog.review.stars', { count: rating })}
          // Sans la classe `btn`, dont certains thèmes changent la police et la casse.
          className={`p-0 border-0 bg-transparent lh-1 ${rating <= value ? 'text-warning' : 'text-muted'}`}
          onClick={() => onChange(rating)}
        >
          {rating <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}

/**
 * Les signaux d'usage dans l'aperçu d'un sujet : copies (dont celles de l'établissement de
 * l'usager), avis des collègues, et l'avis de l'usager s'il a copié le sujet. Un modérateur retire
 * un avis déplacé.
 */
export function UsagePanel({
  subjectId,
  userId,
  isModerator,
}: {
  subjectId: number;
  userId: string | undefined;
  isModerator: boolean;
}) {
  const { t } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const queryClient = useQueryClient();
  const format = useRatingFormat();
  const usage = useQuery({
    queryKey: ['exercizer', 'catalog', 'usage', subjectId],
    queryFn: () => getCatalogUsage(subjectId),
  });
  const mine = usage.data?.reviews.find((review) => review.user_id === userId);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setRating(mine?.rating ?? 0);
    setComment(mine?.comment ?? '');
  }, [mine?.rating, mine?.comment]);

  const refresh = () => {
    setEditing(false);
    // Les cartes portent aussi la note moyenne.
    void queryClient.invalidateQueries({ queryKey: ['exercizer', 'catalog'] });
  };
  const save = useMutation({ mutationFn: () => reviewCatalogSubject(subjectId, { rating, comment }), onSuccess: refresh });
  const remove = useMutation({
    mutationFn: (author?: string) => removeCatalogReview(subjectId, author),
    onSuccess: refresh,
  });

  if (usage.isError) return null;
  if (!usage.data) return <LoadingScreen position={false} />;
  const data = usage.data;
  const others = data.reviews.filter((review) => review.user_id !== userId);

  return (
    <section className="border rounded p-12 mb-16" data-testid="catalog-usage-panel">
      <h2 className="h6 mb-8">{t('exercizer.catalog.usage.title')}</h2>
      <p className="small mb-8">
        {data.copies === 0
          ? t('exercizer.catalog.usage.none')
          : [
              t('exercizer.catalog.usage.copies', { count: data.copies }),
              t('exercizer.catalog.usage.structures', { count: data.structures }),
            ].join(' · ')}
        {data.my_structures > 0 && (
          <>
            {' · '}
            <strong>{t('exercizer.catalog.usage.mine', { count: data.my_structures })}</strong>
          </>
        )}
      </p>
      {data.rating_count > 0 && data.rating_avg != null && (
        <p className="small mb-8">
          <span aria-hidden="true" className="text-warning">
            {ratingStars(data.rating_avg)}
          </span>{' '}
          {t('exercizer.catalog.usage.rating', { rating: format(data.rating_avg), count: data.rating_count })}
        </p>
      )}

      {(save.isError || remove.isError) && (
        <Alert type="danger" className="mb-8">
          {t('exercizer.error')}
        </Alert>
      )}

      {data.can_review &&
        (editing || !mine ? (
          <div className="border-top pt-8 mt-8">
            <p className="small text-muted mb-4">{t('exercizer.catalog.review.mine')}</p>
            <RatingInput value={rating} onChange={setRating} />
            <FormControl id={`${id}-comment`} className="mt-8">
              <Label>{t('exercizer.catalog.review.comment')}</Label>
              <TextArea
                size="md"
                maxLength={2000}
                value={comment}
                placeholder={t('exercizer.catalog.review.placeholder')}
                onChange={(event) => setComment(event.target.value)}
              />
            </FormControl>
            <div className="d-flex justify-content-end gap-8 mt-8">
              {mine && (
                <Button color="tertiary" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  {t('exercizer.cancel')}
                </Button>
              )}
              <Button
                color="primary"
                variant="filled"
                size="sm"
                disabled={rating === 0}
                isLoading={save.isPending}
                onClick={() => save.mutate()}
              >
                {t('exercizer.catalog.review.save')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-top pt-8 mt-8 d-flex flex-wrap align-items-center gap-8">
            <span className="small flex-fill">
              {t('exercizer.catalog.review.yours')}{' '}
              <span className="text-warning" aria-label={t('exercizer.catalog.review.stars', { count: mine.rating })}>
                {ratingStars(mine.rating)}
              </span>
              {mine.comment && <span className="text-muted"> — {mine.comment}</span>}
            </span>
            <Button color="tertiary" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              {t('exercizer.catalog.review.edit')}
            </Button>
            <Button
              color="danger"
              variant="ghost"
              size="sm"
              isLoading={remove.isPending}
              onClick={() => remove.mutate(undefined)}
            >
              {t('exercizer.catalog.review.remove')}
            </Button>
          </div>
        ))}

      {others.length > 0 && (
        <ul className="list-unstyled m-0 mt-8 d-flex flex-column gap-8" aria-label={t('exercizer.catalog.review.list')}>
          {others.map((review) => (
            <li key={review.user_id} className="small border-top pt-8">
              <div className="d-flex align-items-center gap-8">
                <span className="text-warning" aria-label={t('exercizer.catalog.review.stars', { count: review.rating })}>
                  {ratingStars(review.rating)}
                </span>
                <strong className="flex-fill">{review.username}</strong>
                {isModerator && (
                  <Button
                    color="danger"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(review.user_id)}
                    aria-label={t('exercizer.catalog.review.moderate', { name: review.username })}
                  >
                    {t('exercizer.catalog.review.remove')}
                  </Button>
                )}
              </div>
              {review.comment && <p className="m-0 mt-4 text-break">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Le bouton des modérateurs qui ouvre la file de validation, avec le nombre de propositions en attente. */
export function ModerationButton() {
  const { t } = useTranslation(['exercizer', 'common']);
  const [open, setOpen] = useState(false);
  const proposals = useQuery({
    queryKey: ['exercizer', 'catalog', 'moderation'],
    queryFn: getAlignmentProposals,
  });
  const count = proposals.data?.length ?? 0;
  return (
    <>
      <Button
        color={count > 0 ? 'primary' : 'tertiary'}
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="catalog-moderation-open"
      >
        {t('exercizer.catalog.moderation.open', { count })}
      </Button>
      {open && <ModerationDialog proposals={proposals.data ?? []} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * La file de validation : les rattachements au programme proposés par les enseignants, groupés par
 * sujet. Valider range l'exercice sous l'énoncé ; refuser retire la proposition.
 */
function ModerationDialog({ proposals, onClose }: { proposals: AlignmentProposal[]; onClose: () => void }) {
  const { t, i18n } = useTranslation(['exercizer', 'common']);
  const id = useId();
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (decisions: Array<{ proposal: AlignmentProposal; accept: boolean }>) =>
      decideAlignmentProposals(
        decisions.map(({ proposal, accept }) => ({
          subject_id: proposal.subject_id,
          cfitem_id: proposal.cfitem_id,
          accept,
        })),
      ),
    // L'arbre, les comptes et la file changent tous.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['exercizer', 'catalog'] }),
  });
  const groups = groupProposals(proposals);
  const date = (value: string) => new Date(value).toLocaleDateString(i18n.language);

  return (
    <Modal id={id} isOpen onModalClose={onClose} size="lg" scrollable>
      <Modal.Header onModalClose={onClose}>{t('exercizer.catalog.moderation.title')}</Modal.Header>
      <Modal.Body>
        <p className="text-muted">{t('exercizer.catalog.moderation.help')}</p>
        {decide.isError && (
          <Alert type="danger" className="mb-16">
            {t('exercizer.error')}
          </Alert>
        )}
        {groups.length === 0 ? (
          <EmptyScreen imageSrc={illuExercizer} text={t('exercizer.catalog.moderation.empty')} size={160} />
        ) : (
          <div className="d-flex flex-column gap-16" data-testid="catalog-moderation">
            {groups.map((group) => (
              <section key={group.subjectId} className="border rounded p-12" aria-label={group.subjectTitle}>
                <div className="d-flex flex-wrap align-items-center gap-8 mb-8">
                  <strong className="flex-fill">{group.subjectTitle}</strong>
                  {group.proposals.length > 1 && (
                    <Button
                      size="sm"
                      color="primary"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate(group.proposals.map((proposal) => ({ proposal, accept: true })))}
                    >
                      {t('exercizer.catalog.moderation.acceptAll')}
                    </Button>
                  )}
                </div>
                <ul className="list-unstyled m-0 d-flex flex-column gap-8">
                  {group.proposals.map((proposal) => (
                    <li key={proposal.cfitem_id} className="d-flex flex-wrap align-items-center gap-8">
                      <span className="small flex-fill" style={{ minWidth: 200 }} title={proposal.programme_title}>
                        {proposal.code && <strong className="me-8">{proposal.code}</strong>}
                        {proposal.label}
                        <span className="d-block text-muted">
                          {t('exercizer.catalog.moderation.by', {
                            name: proposal.proposed_by_name ?? proposal.subject_owner_username,
                            date: date(proposal.proposed_at),
                          })}
                        </span>
                      </span>
                      <Button
                        size="sm"
                        color="danger"
                        variant="ghost"
                        disabled={decide.isPending}
                        aria-label={t('exercizer.catalog.moderation.rejectOne', { code: proposal.code ?? proposal.label })}
                        onClick={() => decide.mutate([{ proposal, accept: false }])}
                      >
                        {t('exercizer.catalog.moderation.reject')}
                      </Button>
                      <Button
                        size="sm"
                        color="primary"
                        variant="filled"
                        disabled={decide.isPending}
                        aria-label={t('exercizer.catalog.moderation.acceptOne', { code: proposal.code ?? proposal.label })}
                        onClick={() => decide.mutate([{ proposal, accept: true }])}
                      >
                        {t('exercizer.catalog.moderation.accept')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {t('exercizer.close')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
