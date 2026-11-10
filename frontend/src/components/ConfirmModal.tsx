import { Button, Modal } from '@open-ent/react';
import { ReactNode, useId } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Confirmation d'une action destructrice — remplace `window.confirm`, hors socle.
 *
 * Le corps est libre (`children`) : les suppressions d'Exercizer portent sur une SÉLECTION,
 * qu'il faut pouvoir énumérer avant de confirmer.
 */
export function ConfirmModal({
  title,
  confirmLabel,
  cancelLabel,
  isLoading,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  confirmLabel?: string;
  /** Quand « Annuler » prêterait à confusion avec l'action elle-même. */
  cancelLabel?: string;
  isLoading?: boolean;
  children: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation(['exercizer', 'common']);

  return (
    <Modal id={useId()} isOpen onModalClose={onClose} size="sm">
      <Modal.Header onModalClose={onClose}>{title}</Modal.Header>
      <Modal.Body>{children}</Modal.Body>
      <Modal.Footer>
        <Button color="tertiary" variant="ghost" onClick={onClose}>
          {cancelLabel ?? t('exercizer.cancel')}
        </Button>
        <Button color="danger" variant="filled" isLoading={isLoading} onClick={onConfirm}>
          {confirmLabel ?? t('exercizer.remove')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ConfirmModal;
