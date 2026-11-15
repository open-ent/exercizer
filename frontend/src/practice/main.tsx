import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './i18n';
import '../index.css';
import './practice.css';
import { readBoot } from './api';
import { Account, MyResults, Player } from './PracticeApp';

/**
 * Entrée du site public d'entraînement (vue exercizer-practice.html).
 *
 * Les pages sont rendues PAR LE SERVEUR (navigation, programme, référencement) ; React n'y monte que des
 * îlots, là où la page leur a réservé une place : l'encart du compte, « Mes résultats », le lecteur
 * d'exercice. Volontairement SANS EdificeClientProvider : il suppose une session et renverrait un
 * visiteur anonyme vers la connexion.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } },
});
const boot = readBoot();

function mount(id: string, node: ReactNode) {
  const element = document.getElementById(id);
  if (!element) return;
  createRoot(element).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </StrictMode>,
  );
}

mount('ps-account', <Account boot={boot} />);
mount('ps-my-results', <MyResults />);
if (boot.page === 'exercise' && boot.subjectId) mount('ps-player', <Player subjectId={boot.subjectId} boot={boot} />);
