import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Download, RefreshCw, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Install Prompt ──────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  prompt(): Promise<void>;
}

export function PWAPrompts() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      return localStorage.getItem("pwa-install-dismissed") === "true";
    } catch {
      return false;
    }
  });

  // Capture the browser's install prompt event
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") {
      setInstallEvent(null);
    }
  };

  const handleInstallDismiss = () => {
    setInstallDismissed(true);
    try {
      localStorage.setItem("pwa-install-dismissed", "true");
    } catch {
      /* noop */
    }
  };

  // ─── Service Worker Update Prompt ────────────────────────────────────────

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      if (r) {
        setInterval(() => r.update(), 60_000);
      }
    },
    onRegisterError(error) {
      console.error("SW Registration error", error);
    },
  });

  const handleUpdate = async () => {
    await updateServiceWorker(true);
  };

  const showInstall = !!installEvent && !installDismissed;
  const showUpdate = needRefresh;

  return (
    <>
      {/* Update available banner */}
      <AnimatePresence>
        {showUpdate && (
          <motion.div
            className="pwa-banner pwa-banner--update"
            initial={{ y: -64, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -64, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <RefreshCw size={16} />
            <span>A new version is available.</span>
            <button className="btn btn-sm btn-primary" onClick={handleUpdate}>
              Update now
            </button>
            <button
              className="btn-icon"
              onClick={() => setNeedRefresh(false)}
              aria-label="Dismiss update"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Install to home screen banner */}
      <AnimatePresence>
        {showInstall && (
          <motion.div
            className="pwa-banner pwa-banner--install"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: 1.5 }}
          >
            <div className="pwa-banner__icon">5</div>
            <div className="pwa-banner__text">
              <strong>Add to Home Screen</strong>
              <span>Install for quick access, even offline.</span>
            </div>
            <button className="btn btn-sm btn-primary" onClick={handleInstall}>
              <Download size={14} />
              Install
            </button>
            <button
              className="btn-icon"
              onClick={handleInstallDismiss}
              aria-label="Dismiss install prompt"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
