import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useIsMobile } from "../utils/useIsMobile";

type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export const Drawer = ({ isOpen, onClose, title, children, footer }: DrawerProps) => {
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Mobile: bottom sheet sliding up. Desktop: right-side panel sliding in.
  const initial = isMobile ? { y: "100%" } : { x: "100%" };
  const animate = isMobile ? { y: 0 } : { x: 0 };
  const exit = isMobile ? { y: "100%" } : { x: "100%" };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="drawer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            className={`drawer-content ${isMobile ? "drawer-content--bottom" : ""}`}
            initial={initial}
            animate={animate}
            exit={exit}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {isMobile && <div className="drawer-handle" aria-hidden="true" />}
            <div className="drawer-header">
              <h3 className="m-0">{title}</h3>
              <button className="btn-icon" onClick={onClose} aria-label="Close drawer">
                <X size={20} />
              </button>
            </div>
            <div className="drawer-body">{children}</div>
            {footer && <div className="drawer-footer">{footer}</div>}
          </motion.div>
        </>
      )}
      <style>{`
        .drawer-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgb(39 45 43 / 85%);
          backdrop-filter: blur(1px);
          z-index: 1000;
        }
        .drawer-content {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          max-width: 500px;
          background-color: var(--bg-surface);
          z-index: 1001;
          display: flex;
          flex-direction: column;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2);
          border-left: 1px solid var(--border-color);
        }
        .drawer-content--bottom {
          top: auto;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          max-width: 100%;
          max-height: 92vh;
          box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.2);
          border-left: none;
          border-top: 1px solid var(--border-color);
        }
        .drawer-handle {
          width: 36px;
          height: 4px;
          background: var(--border-strong);
          border-radius: 2px;
          margin: 10px auto 2px;
          flex-shrink: 0;
        }
        .drawer-header {
          padding: var(--spacing-md) var(--spacing-lg);
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .drawer-body {
          flex: 1;
          overflow-y: auto;
          padding: var(--spacing-lg);
          overscroll-behavior: contain;
        }
        .drawer-footer {
          padding: var(--spacing-md) var(--spacing-lg);
          border-top: 1px solid var(--border-subtle);
          background-color: var(--bg-base);
          padding-bottom: calc(var(--spacing-md) + env(safe-area-inset-bottom, 0px));
        }
      `}</style>
    </AnimatePresence>
  );
};
