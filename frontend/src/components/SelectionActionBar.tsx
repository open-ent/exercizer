import { ActionBar } from '@open-ent/react';
import { ReactNode } from 'react';

/**
 * Barre d'actions sur la sélection, collée en bas de l'écran sur toute sa largeur — comme dans
 * les autres modules (blog, explorateur). Le composant `ActionBar` du socle ne se positionne pas
 * lui-même : rendu tel quel, il resterait dans le flux, réduit à la largeur de ses boutons.
 */
export function SelectionActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="position-fixed bottom-0 start-0 end-0 z-3">
      <ActionBar>{children}</ActionBar>
    </div>
  );
}
