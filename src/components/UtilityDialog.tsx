import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function UtilityDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose(): void;
}) {
  const { t } = useTranslation('common');
  const translatedTitle = t(title);
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
        <h2 id={titleId}>{translatedTitle}</h2>
        <button onClick={close} aria-label={t('{{title}}を閉じる', { title: translatedTitle })}>
          {t('閉じる')}
        </button>
      </header>
      <div className="utility-dialog-body">{children}</div>
    </dialog>
  );
}
