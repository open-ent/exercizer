import { LoadingScreen, useHasWorkflow } from '@open-ent/react';
import { Navigate } from 'react-router-dom';

import { WORKFLOW } from '../rights';

/**
 * `/dashboard` : l'IHM AngularJS y branchait un contrôleur qui choisissait la vue selon le droit
 * de création. On redirige plutôt vers la route correspondante, pour que l'URL dise toujours
 * quelle vue est affichée — un enseignant qui bascule en vue apprenant doit pouvoir y revenir.
 */
export function DashboardRedirect() {
  const canCreate = useHasWorkflow(WORKFLOW.create) as boolean | undefined;
  // `useHasWorkflow` répond `false` avant que la session soit lue : rediriger tout de suite
  // enverrait l'enseignant sur la vue apprenant à chaque ouverture.
  if (canCreate === undefined) return <LoadingScreen position={false} />;
  return <Navigate to={canCreate ? '/dashboard/teacher' : '/dashboard/student'} replace />;
}

export default DashboardRedirect;
