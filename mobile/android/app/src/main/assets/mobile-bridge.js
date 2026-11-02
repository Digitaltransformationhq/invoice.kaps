/* Runs only on the invoice site's main frame. The site itself is unchanged. */
(() => {
  if (window !== window.top || !window.InvoiceAndroid) return;
  const blobs = new Map();
  const printRequests = new Map();
  const createUrl = URL.createObjectURL.bind(URL);
  const revokeUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = value => {
    const url = createUrl(value);
    if (value instanceof Blob) blobs.set(url, value);
    return url;
  };
  URL.revokeObjectURL = url => { blobs.delete(url); printRequests.delete(url); revokeUrl(url); };

  let nextId = 0;
  const pending = new Map();
  window.InvoiceAndroid.onmessage = event => {
    try {
      const result = JSON.parse(event.data);
      const request = pending.get(result.id);
      if (!request) return;
      pending.delete(result.id);
      clearTimeout(request.timer);
      if (result.ok) request.resolve();
      else request.reject(new Error(result.error || 'Could not open the file.'));
    } catch (_) { /* Ignore malformed messages. */ }
  };
  const send = message => window.InvoiceAndroid.postMessage(JSON.stringify(message));
  const sendFile = message => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('The app could not open the file.')); }, 30000);
    pending.set(id, { resolve, reject, timer });
    try { send({ ...message, id }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  const sendBlob = (blob, name, action, text = '') => new Promise((resolve, reject) => {
    if (blob.size > 8 * 1024 * 1024) {
      reject(new Error('This file is too large for the app to transfer. Please use the website in your browser.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be prepared. Please try again.'));
    reader.onload = () => {
      const data = String(reader.result || '');
      const comma = data.indexOf(',');
      if (comma < 0) { reject(new Error('The file could not be prepared. Please try again.')); return; }
      sendFile({ action, name: name || 'document', type: blob.type || 'application/octet-stream', data: data.slice(comma + 1), text }).then(resolve, reject);
    };
    reader.readAsDataURL(blob);
  });
  const handleDownload = anchor => {
    const blob = blobs.get(anchor.href);
    if (!blob || !anchor.hasAttribute('download')) return false;
    sendBlob(blob, anchor.download || 'document', 'save').catch(error => alert(error.message));
    return true;
  };

  // The website prints generated PDFs using a hidden iframe. Android WebView
  // can report that frame as loaded while silently failing to print a PDF. Hand
  // that particular operation to Android's print service instead.
  const iframeSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
  if (iframeSrc && iframeSrc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      ...iframeSrc,
      set(value) {
        const blob = blobs.get(String(value));
        const hidden = (this.style.width === '0px' || this.style.width === '0') &&
          (this.style.height === '0px' || this.style.height === '0');
        if (!blob || blob.type !== 'application/pdf' || !hidden) return iframeSrc.set.call(this, value);
        const frame = this;
        const onload = frame.onload;
        frame.onload = null;
        const request = sendBlob(blob, 'document.pdf', 'print');
        printRequests.set(String(value), request);
        request.then(() => {
          try {
            // Let the website complete its print flow only after the Android
            // print UI has opened, without asking WebView to print a blank page.
            Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { focus() {}, print() {} } });
            if (typeof onload === 'function') onload.call(frame, new Event('load'));
          } catch (_) { /* its timed fallback below will handle this */ }
        }).catch(() => { /* the website's timed fallback opens the PDF */ });
      },
    });
  }
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (!handleDownload(this)) return originalClick.call(this);
  };
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a') : null;
    if (!anchor) return;
    if (handleDownload(anchor)) { event.preventDefault(); return; }
    if (anchor.target === '_blank' && anchor.href) {
      event.preventDefault();
      window.open(anchor.href, '_blank');
    }
  }, true);

  const originalOpen = window.open.bind(window);
  window.open = (url, target, features) => {
    if (!url) return originalOpen(url, target, features);
    const value = String(url);
    const blob = blobs.get(value);
    if (blob) {
      const printing = printRequests.get(value);
      if (printing) printing.catch(() => sendBlob(blob, 'document.pdf', 'open').catch(error => alert(error.message)));
      else sendBlob(blob, 'document.pdf', 'open').catch(error => alert(error.message));
      return null;
    }
    try {
      const parsed = new URL(value, location.href);
      if (parsed.origin === location.origin) { location.assign(parsed.href); return null; }
      if (['https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
        send({ action: 'external', url: parsed.href });
        return null;
      }
    } catch (_) { /* use the WebView default for unrecognised URLs */ }
    return originalOpen(url, target, features);
  };

  // WebView lacks the browser's file-sharing implementation on some devices.
  const oldCanShare = navigator.canShare && navigator.canShare.bind(navigator);
  const oldShare = navigator.share && navigator.share.bind(navigator);
  navigator.canShare = data => data && data.files && data.files.length === 1
    ? data.files[0] instanceof Blob && data.files[0].size <= 8 * 1024 * 1024
    : !!(oldCanShare && oldCanShare(data));
  navigator.share = data => {
    if (data && data.files && data.files.length === 1 && data.files[0] instanceof Blob) {
      return sendBlob(data.files[0], data.files[0].name || 'document.pdf', 'share', data.text || '');
    }
    return oldShare ? oldShare(data) : Promise.reject(new Error('Sharing is unavailable'));
  };
})();
