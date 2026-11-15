import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '../i18n';
import '../index.css';
import { readBoot } from './api';
import { PracticeApp } from './PracticeApp';

/**
 * Entrée du site public d'entraînement (vue exercizer-practice.html, rendue par le serveur).
 *
 * Volontairement SANS EdificeClientProvider : celui-ci suppose une session (il charge l'usager, ses
 * applications, son thème) et renverrait un visiteur anonyme vers la connexion. Le contenu rendu par
 * le serveur reste affiché tant que React n'a pas pris la main.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PracticeApp boot={readBoot()} />
    </QueryClientProvider>
  </StrictMode>,
);
