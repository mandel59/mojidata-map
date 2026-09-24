import { useEffect, useId, useRef, type ReactNode } from 'react';

export function UtilityDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  function close() {
    dialog.current?.close();
    onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="utility-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button onClick={close} aria-label={`${title}を閉じる`}>
          閉じる
        </button>
      </header>
      <div className="utility-dialog-body">{children}</div>
    </dialog>
  );
}
