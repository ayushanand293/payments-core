import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";

type Props = PropsWithChildren<{
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}>;

export function Modal({ open, title, onClose, footer, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="ui-modal__overlay" />
        <Dialog.Content className="ui-modal">
          <header className="ui-modal__header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="ui-modal__close" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
          </header>
          <div className="ui-modal__body">{children}</div>
          {footer ? <footer className="ui-modal__footer">{footer}</footer> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  onCancel,
  onConfirm,
  loading = false,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="ui-button ui-button--ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="ui-button ui-button--danger" disabled={loading} onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      {description ? <p className="ui-subtitle">{description}</p> : null}
    </Modal>
  );
}
