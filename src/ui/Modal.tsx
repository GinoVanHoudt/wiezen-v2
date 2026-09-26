import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}

export function Modal({ open, onClose, title, wide, children }: Props) {
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={`modal ${wide ? 'wide' : ''}`}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || onClose) && (
              <header className="modal-header">
                <h2>{title}</h2>
                {onClose && (
                  <button className="icon-btn" onClick={onClose} aria-label="close">
                    ✕
                  </button>
                )}
              </header>
            )}
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
