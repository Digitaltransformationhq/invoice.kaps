import { createRoot } from 'react-dom/client';
import './styles/index.css';

const rootElement = document.getElementById('root');
let hasRenderedApp = false;

function showBootError(error: unknown) {
  if (hasRenderedApp && rootElement?.childElementCount) {
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : '';

  if (!rootElement) {
    console.error('App boot failed:', error);
    return;
  }

  rootElement.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;">
      <div style="max-width:760px;width:100%;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:24px;box-shadow:0 1px 2px rgba(15,23,42,.06);">
        <h1 style="margin:0 0 8px;font-size:22px;">App failed to start</h1>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px;">This is the error causing the blank screen.</p>
        <pre style="white-space:pre-wrap;overflow:auto;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:16px;font-size:12px;">${message}${stack ? `\n\n${stack}` : ''}</pre>
        <button id="clear-local-data" style="margin-top:16px;padding:10px 14px;border:0;border-radius:6px;background:#2563eb;color:white;cursor:pointer;">Clear local data and reload</button>
      </div>
    </div>
  `;

  document.getElementById('clear-local-data')?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '/';
  });
}

window.addEventListener('error', (event) => {
  showBootError(event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  showBootError(event.reason || 'Unhandled promise rejection');
});

if (!rootElement) {
  showBootError(new Error('Missing #root element in index.html'));
} else {
  import('./app/App.tsx')
    .then(({ default: App }) => {
      createRoot(rootElement).render(<App />);
      hasRenderedApp = true;
    })
    .catch(showBootError);
}

// Register the service worker so the app is installable ("Add to Home Screen")
// and works offline. Only in production builds — a SW in dev interferes with
// Vite's HMR. Fails silently on unsupported browsers.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      /* installability is a progressive enhancement — ignore failures */
    });
  });
}
