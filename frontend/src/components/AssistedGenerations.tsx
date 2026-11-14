import { Badge, Button, Heading, IconButton, useHasWorkflow } from '@open-ent/react';
import { IconDelete } from '@open-ent/react/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { AssistedGeneration, deleteAssistedGeneration, listAssistedGenerations } from '../api';
import { WORKFLOW } from '../rights';
import { formatDateTime } from '../utils';
import { ConfirmModal } from './ConfirmModal';

const LEVEL: Record<AssistedGeneration['status'], 'info' | 'success' | 'danger'> = {
  pending: 'info',
  ready: 'success',
  error: 'danger',
};

/**
 * « Brouillons à relire » : les créations assistées de l'enseignant, en cours, prêtes ou en
 * échec, en tête de la page des sujets. Rien n'est affiché quand il n'y en a pas. Tant qu'une
 * génération est en cours, la liste se rafraîchit d'elle-même.
 */
export function AssistedGenerations() {
  const { t } = useTranslation(['exercizer', 'common']);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canGenerate = useHasWorkflow(WORKFLOW.generate) as boolean | undefined;
  const [removing, setRemoving] = useState<AssistedGeneration | null>(null);

  const generations = useQuery({
    queryKey: ['exercizer', 'assisted-generations'],
    queryFn: listAssistedGenerations,
    enabled: !!canGenerate,
    refetchInterval: (query) => (query.state.data?.some((generation) => generation.status === 'pending') ? 10000 : false),
  });

  const remove = useMutation({
    mutationFn: (generation: AssistedGeneration) => deleteAssistedGeneration(generation.id),
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ['exercizer', 'assisted-generations'] });
    },
  });

  if (!canGenerate || !generations.data?.length) return null;

  return (
    <section className="card p-16 mb-16" data-testid="assisted-generations">
      <Heading level="h3" headingStyle="h5" className="mb-8">
        {t('exercizer.assisted.list.title')}
      </Heading>
      <ul className="list-unstyled mb-0">
        {generations.data.map((generation) => (
          <li key={generation.id} className="d-flex flex-wrap align-items-center gap-8 py-8 border-top">
            <span className="fw-bold flex-fill text-truncate">
              {generation.title || generation.document_name || `#${generation.id}`}
            </span>
            <span className="small text-gray-700">
              {t('exercizer.assisted.list.started', { date: formatDateTime(generation.created, t('exercizer.at')) })}
            </span>
            <Badge variant={{ type: 'notification', level: LEVEL[generation.status] }}>
              {t(`exercizer.assisted.list.${generation.status}`)}
            </Badge>
            {generation.status !== 'pending' && (
              <Button size="sm" color="primary" variant="outline" onClick={() => navigate(`/subject/generate/${generation.id}`)}>
                {t('exercizer.assisted.list.review')}
              </Button>
            )}
            <IconButton
              size="sm"
              color="tertiary"
              variant="ghost"
              icon={<IconDelete />}
              aria-label={t('exercizer.assisted.list.delete')}
              title={t('exercizer.assisted.list.delete')}
              onClick={() => setRemoving(generation)}
            />
          </li>
        ))}
      </ul>
      {removing && (
        <ConfirmModal
          title={t('exercizer.assisted.list.delete')}
          isLoading={remove.isPending}
          onConfirm={() => remove.mutate(removing)}
          onClose={() => setRemoving(null)}
        >
          <p className="mb-0">{t('exercizer.assisted.list.delete.confirm', { title: removing.title || removing.document_name || '' })}</p>
        </ConfirmModal>
      )}
    </section>
  );
}

export default AssistedGenerations;
