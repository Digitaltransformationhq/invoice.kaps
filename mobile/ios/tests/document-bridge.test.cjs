// Run with node ios/tests/document-bridge.test.cjs from mobile/.
// This exercises the injected JavaScript; native presentation still requires an iOS device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const swift = fs.readFileSync(path.join(__dirname, '../App/App/SceneDelegate.swift'), 'utf8');
const script = swift.match(/private static let documentScript = #"""([\s\S]*?)"""#/)[1];

function setup(origin = 'https://invoice.kapsca.in') {
  const messages = [];
  const clicks = [];
  const opens = [];
  let next = 0;
  let clickListener;
  class Blob { constructor(size, type) { this.size = size; this.type = type; } }
  class Element { closest() { return null; } }
  class Anchor extends Element {
    constructor(href, name) { super(); this.href = href; this.download = name; }
    hasAttribute(name) { return name === 'download' && this.download !== null; }
    click() { clicks.push(this.href); }
  }
  class Frame { constructor() { this.style = { width: '0px', height: '0px' }; this.contentWindow = {}; } }
  Object.defineProperty(Frame.prototype, 'src', {
    configurable: true, get() { return this._src; }, set(value) { this._src = value; }
  });
  class FileReader {
    readAsDataURL() { this.result = 'data:application/pdf;base64,cGRm'; this.onload(); }
  }
  const URL = { createObjectURL: () => `blob:example/${++next}`, revokeObjectURL: () => {} };
  const window = {
    webkit: { messageHandlers: { invoiceDocument: { postMessage: (message) => messages.push(message) } } },
    open: (...args) => { opens.push(args); return 'browser'; },
  };
  vm.runInNewContext(script, {
    window, location: { origin }, document: { addEventListener: (_, fn) => { clickListener = fn; } },
    URL, Blob, Element, HTMLAnchorElement: Anchor, HTMLIFrameElement: Frame, FileReader,
  });
  return { messages, clicks, opens, Blob, Anchor, Frame, URL, window, clickListener };
}

{
  const app = setup();
  const url = app.URL.createObjectURL(new app.Blob(3, 'application/pdf'));
  new app.Anchor(url, 'invoice.pdf').click();
  assert.equal(app.messages.length, 1);
  assert.equal(app.messages[0].action, 'share');
  assert.equal(app.messages[0].name, 'invoice.pdf');
  assert.equal(app.messages[0].data, 'cGRm');
  assert.equal(app.clicks.length, 0);
  const ordinary = new app.Anchor('https://example.org/report', 'report.pdf');
  ordinary.click();
  assert.deepEqual(app.clicks, ['https://example.org/report']);
  assert.equal(app.window.open('https://wa.me/123', '_blank'), 'browser');
  assert.equal(app.opens.length, 1);
}
{
  const app = setup();
  const url = app.URL.createObjectURL(new app.Blob(3, 'application/json'));
  const anchor = new app.Anchor(url, 'gstr1.json');
  anchor.closest = () => anchor;
  let prevented = false;
  app.clickListener({ target: anchor, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => {} });
  assert.equal(prevented, true);
  assert.equal(app.messages[0].name, 'gstr1.json');
  app.URL.revokeObjectURL(url);
  new app.Anchor(url, 'gstr1.json').click();
  assert.equal(app.clicks.length, 1);
}
{
  const app = setup();
  const url = app.URL.createObjectURL(new app.Blob(3, 'application/pdf'));
  const frame = new app.Frame();
  let loaded = false;
  frame.onload = () => { frame.contentWindow.print(); loaded = true; };
  frame.src = url;
  assert.equal(frame.src, 'about:blank');
  assert.equal(app.messages.length, 0);
  frame.onload({});
  assert.equal(app.messages[0].action, 'print');
  assert.equal(loaded, true);
  const visible = new app.Frame();
  visible.style.width = '100px';
  visible.src = url;
  assert.equal(visible.src, url);
  assert.equal(app.messages.length, 1);
}
{
  const app = setup();
  const url = app.URL.createObjectURL(new app.Blob(3, 'application/pdf'));
  const frame = new app.Frame();
  Object.defineProperty(frame.contentWindow, 'print', { value: () => {}, writable: false });
  let loaded = false;
  frame.onload = () => { loaded = true; };
  frame.src = url;
  frame.onload({});
  assert.equal(frame.src, url);
  assert.equal(app.messages.length, 0);
  frame.onload({});
  assert.equal(loaded, true);
  assert.equal(app.messages.length, 0);
}
{
  const app = setup();
  const url = app.URL.createObjectURL(new app.Blob(20 * 1024 * 1024 + 1, 'application/pdf'));
  new app.Anchor(url, 'large.pdf').click();
  assert.equal(app.messages[0].action, 'error');
}
{
  const outside = setup('https://example.org');
  const url = outside.URL.createObjectURL(new outside.Blob(3, 'application/pdf'));
  new outside.Anchor(url, 'document.pdf').click();
  assert.equal(outside.messages.length, 0);
  assert.equal(outside.clicks.length, 1);
}
console.log('iOS document bridge JavaScript tests passed');
