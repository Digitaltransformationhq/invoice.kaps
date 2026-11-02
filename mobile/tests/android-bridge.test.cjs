const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/assets/mobile-bridge.js'), 'utf8');

function createPage() {
  const messages = [];
  let failNext = false;
  let counter = 0;
  let listener;
  class TestURL extends URL {}
  TestURL.createObjectURL = () => `blob:test-${++counter}`;
  TestURL.revokeObjectURL = () => {};
  class Element { closest() { return null; } }
  class HTMLAnchorElement extends Element {
    constructor(href, download) { super(); this.href = href; this.download = download; }
    hasAttribute(name) { return name === 'download' && this.download !== undefined; }
    click() { this.defaultClick = true; }
  }
  class HTMLIFrameElement {
    constructor() { this.style = { width: '0px', height: '0px' }; this.onload = null; }
    get src() { return this.value || ''; }
    set src(value) { this.value = value; }
  }
  class FileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(buffer => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onload();
      }, () => this.onerror());
    }
  }
  const bridge = {
    postMessage(raw) {
      const message = JSON.parse(raw);
      messages.push(message);
      if (message.id) {
        const failed = failNext;
        failNext = false;
        queueMicrotask(() => bridge.onmessage({ data: JSON.stringify({ id: message.id, ok: !failed, error: 'Native failure' }) }));
      }
    },
  };
  const window = { InvoiceAndroid: bridge, open: () => {}, location: { origin: 'https://invoice.kapsca.in' } };
  window.top = window;
  const context = {
    window, location: { origin: 'https://invoice.kapsca.in', href: 'https://invoice.kapsca.in/app', assign() {} },
    document: { addEventListener: (_, handler) => { listener = handler; } }, navigator: {},
    Blob, FileReader, HTMLAnchorElement, HTMLIFrameElement, Element, Event, URL: TestURL, setTimeout, clearTimeout,
    alert: message => { throw new Error(`Unexpected alert: ${message}`); },
  };
  vm.runInNewContext(source, context);
  return { context, messages, bridge, HTMLAnchorElement, HTMLIFrameElement, fail: () => { failNext = true; }, listener: () => listener };
}

test('a generated document is sent to the native save picker', async () => {
  const page = createPage();
  const blob = new Blob(['invoice'], { type: 'application/pdf' });
  const url = page.context.URL.createObjectURL(blob);
  new page.HTMLAnchorElement(url, 'invoice.pdf').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.messages[0].action, 'save');
  assert.equal(page.messages[0].name, 'invoice.pdf');
  assert.equal(Buffer.from(page.messages[0].data, 'base64').toString(), 'invoice');
});

test('share resolves after native acknowledgement and propagates failure', async () => {
  const page = createPage();
  const blob = new Blob(['invoice'], { type: 'application/pdf' });
  assert.equal(page.context.navigator.canShare({ files: [blob] }), true);
  await page.context.navigator.share({ files: [blob], text: 'Invoice' });
  assert.equal(page.messages[0].action, 'share');
  assert.equal(page.messages[0].text, 'Invoice');
  page.fail();
  await assert.rejects(page.context.navigator.share({ files: [blob] }), /Native failure/);
});

test('external links are delegated and oversized files are not posted', async () => {
  const page = createPage();
  page.context.window.open('https://wa.me/123', '_blank');
  assert.equal(page.messages[0].action, 'external');
  assert.equal(page.messages[0].url, 'https://wa.me/123');
  const big = new Blob([new Uint8Array(8 * 1024 * 1024 + 1)]);
  assert.equal(page.context.navigator.canShare({ files: [big] }), false);
  await assert.rejects(page.context.navigator.share({ files: [big] }), /too large/);
  assert.equal(page.messages.length, 1);
});

test('a hidden PDF print frame starts native printing before completing', async () => {
  const page = createPage();
  const blob = new Blob(['pdf'], { type: 'application/pdf' });
  const url = page.context.URL.createObjectURL(blob);
  const frame = new page.HTMLIFrameElement();
  let completed = false;
  frame.onload = () => { frame.contentWindow.focus(); frame.contentWindow.print(); completed = true; };
  frame.src = url;
  assert.equal(completed, false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.messages[0].action, 'print');
  assert.equal(completed, true);
  assert.equal(frame.src, '');
});

test('a failed native print opens the PDF via the website fallback', async () => {
  const page = createPage();
  const blob = new Blob(['pdf'], { type: 'application/pdf' });
  const url = page.context.URL.createObjectURL(blob);
  const frame = new page.HTMLIFrameElement();
  page.fail();
  frame.src = url;
  await new Promise(resolve => setImmediate(resolve));
  page.context.window.open(url, '_blank');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(page.messages.map(message => message.action), ['print', 'open']);
});
