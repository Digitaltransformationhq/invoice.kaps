import { useEffect, useState } from 'react';
import { Download, X, Share, Plus } from 'lucide-react';

// The event Chrome/Edge/Android fire when the app meets install criteria.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'kaps-pwa-install-dismissed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && notChrome;
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const ios = isIosSafari();

  useEffect(() => {
    if (isStandalone()) return; // already installed — nothing to offer
    if (localStorage.getItem(DISMISS_KEY)) return; // user dismissed before

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop the mini-infobar; we show our own button
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt, so surface the manual instructions.
    if (ios) setVisible(true);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [ios]);

  const dismiss = () => {
    setVisible(false);
    setIosHint(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode — fine, it just re-shows next visit */
    }
  };

  const install = async () => {
    if (ios) {
      setIosHint((v) => !v);
      return;
    }
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-violet-400/30 bg-[#0f1424]/95 backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(139,92,246,0.6)] text-white">
        <div className="flex items-start gap-3 p-3.5">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shadow-[0_0_18px_rgba(139,92,246,0.5)]">
            <Download className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-tight">Install GSTInvoice Pro</p>
            <p className="mt-0.5 text-[12px] text-white/60 leading-snug">
              Add it to your home screen for a full-screen, app-like experience — works offline too.
            </p>

            {iosHint && (
              <div className="mt-2.5 rounded-lg bg-white/[0.04] border border-white/10 p-2.5 text-[12px] text-white/75 leading-relaxed">
                <span className="inline-flex items-center gap-1">
                  Tap <Share className="h-3.5 w-3.5 text-violet-300" /> <b>Share</b>
                </span>
                , then choose{' '}
                <span className="inline-flex items-center gap-1">
                  <b>Add to Home Screen</b> <Plus className="h-3.5 w-3.5 text-violet-300" />
                </span>
                .
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={install}
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-violet-500 hover:bg-violet-400 text-white text-[13px] font-semibold transition-colors"
              >
                {ios ? 'How to install' : 'Install app'}
              </button>
              <button
                onClick={dismiss}
                className="h-8 px-3 rounded-full text-[13px] text-white/55 hover:text-white/80 hover:bg-white/[0.06] transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 -mr-1 -mt-1 p-1.5 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
