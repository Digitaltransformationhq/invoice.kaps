import UIKit
import Capacitor
import WebKit

// A separate native adapter for documents produced by the unchanged website.
// WKWebView cannot hand a blob: URL to the operating system, so the injected
// script copies the generated document to this controller for share/print.
final class InvoiceBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private let documentHandlerName = "invoiceDocument"
    private let maximumDocumentSize = 20 * 1024 * 1024
    private var documentInProgress = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let controller = webView?.configuration.userContentController else { return }
        controller.add(WeakDocumentHandler(self), name: documentHandlerName)
        controller.addUserScript(WKUserScript(source: Self.documentScript,
                                               injectionTime: .atDocumentStart,
                                               forMainFrameOnly: true))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.name == documentHandlerName, message.frameInfo.isMainFrame,
              origin.`protocol` == "https", origin.host == "invoice.kapsca.in",
              origin.port == 0 || origin.port == 443,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String else { return }

        // A second request must not replace an active share or print sheet.
        guard !documentInProgress, presentedViewController == nil else { return }

        if action == "error" {
            showDocumentError(body["message"] as? String ?? "Could not prepare the document.")
            return
        }
        guard action == "share" || action == "print", let encoded = body["data"] as? String else {
            showDocumentError("Could not prepare the document. Please try again.")
            return
        }
        documentInProgress = true
        let limit = maximumDocumentSize
        let name = body["name"] as? String ?? "document"
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            // Decoding and writing a large document must not block the UI.
            guard encoded.utf8.count <= ((limit + 2) / 3) * 4,
                  let data = Data(base64Encoded: encoded), !data.isEmpty, data.count <= limit else {
                DispatchQueue.main.async { self?.finishWithError("Could not prepare the document. Please try again.") }
                return
            }
            if action == "print" {
                guard data.starts(with: Data("%PDF-".utf8)) else {
                    DispatchQueue.main.async { self?.finishWithError("The document is not a valid PDF.") }
                    return
                }
                DispatchQueue.main.async { self?.printDocument(data) }
            } else {
                let url = Self.prepareShareFile(data, suggestedName: name)
                DispatchQueue.main.async {
                    guard let self = self else {
                        if let url = url { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
                        return
                    }
                    guard let url = url else {
                        self.finishWithError("Could not save the document for sharing. Please try again.")
                        return
                    }
                    self.shareDocument(url)
                }
            }
        }
    }

    private func showDocumentError(_ message: String) {
        let alert = UIAlertController(title: "Document unavailable", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func finishWithError(_ message: String) {
        documentInProgress = false
        showDocumentError(message)
    }

    private nonisolated static func prepareShareFile(_ data: Data, suggestedName: String) -> URL? {
        // Discard path components and control characters from page-supplied names.
        let clean = suggestedName.components(separatedBy: CharacterSet(charactersIn: "/\\:").union(.controlCharacters)).joined(separator: "-")
        let filename = String(clean.prefix(150)).trimmingCharacters(in: .whitespacesAndNewlines)
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let url = directory.appendingPathComponent(filename.isEmpty || filename == "." || filename == ".." ? "document" : filename)
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            return url
        } catch {
            try? FileManager.default.removeItem(at: directory)
            return nil
        }
    }

    private func shareDocument(_ url: URL) {
        guard viewIfLoaded?.window != nil, presentedViewController == nil else {
            documentInProgress = false
            DispatchQueue.global(qos: .utility).async { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
            return
        }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        sheet.completionWithItemsHandler = { [weak self] _, _, _, _ in
            DispatchQueue.main.async { self?.documentInProgress = false }
            DispatchQueue.global(qos: .utility).async { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        }
        if let popover = sheet.popoverPresentationController {
            popover.sourceView = view
            popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        }
        present(sheet, animated: true)
    }

    private func printDocument(_ data: Data) {
        guard UIPrintInteractionController.isPrintingAvailable else {
            finishWithError("Printing is not available on this device.")
            return
        }
        guard viewIfLoaded?.window != nil, presentedViewController == nil else {
            documentInProgress = false
            return
        }
        let printer = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = "GSTInvoice Pro document"
        printer.printInfo = info
        printer.printingItem = data
        let completion: UIPrintInteractionController.CompletionHandler = { [weak self] _, _, error in
            self?.documentInProgress = false
            if error != nil { self?.showDocumentError("Could not print the document. Please try again.") }
        }
        let presented: Bool
        if UIDevice.current.userInterfaceIdiom == .pad {
            presented = printer.present(from: CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1), in: view, animated: true, completionHandler: completion)
        } else {
            presented = printer.present(animated: true, completionHandler: completion)
        }
        if !presented { finishWithError("Could not open the print dialog. Please try again.") }
    }

    private static let documentScript = #"""
    (() => {
      if (location.origin !== 'https://invoice.kapsca.in' || window.__invoiceDocumentBridge) return;
      window.__invoiceDocumentBridge = true;
      const handler = window.webkit?.messageHandlers?.invoiceDocument;
      if (!handler) return;
      const limit = 20 * 1024 * 1024;
      const blobs = new Map();
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => { const url = create(blob); if (blob instanceof Blob) blobs.set(url, blob); return url; };
      URL.revokeObjectURL = (url) => { blobs.delete(String(url)); return revoke(url); };
      function send(blob, action, name) {
        if (!(blob instanceof Blob) || !blob.size || blob.size > limit) {
          handler.postMessage({ action: 'error', message: 'The document is empty or exceeds the 20 MB limit.' });
          return;
        }
        const reader = new FileReader();
        reader.onerror = () => handler.postMessage({ action: 'error', message: 'Could not read the document. Please try again.' });
        reader.onload = () => handler.postMessage({ action, name, data: String(reader.result).split(',')[1] });
        reader.readAsDataURL(blob);
      }
      function download(anchor) {
        const url = anchor.href;
        const blob = blobs.get(url);
        if (!anchor.hasAttribute('download') || !blob) return false;
        send(blob, 'share', anchor.download || 'document');
        return true;
      }
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () { if (!download(this)) return click.call(this); };
      document.addEventListener('click', (event) => {
        const anchor = event.target instanceof Element ? event.target.closest('a[download]') : null;
        if (anchor && download(anchor)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      // The web app prints a PDF by loading it in a zero-sized iframe and
      // calling print() in its onload callback. Pass that exact case to iOS.
      const src = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
      if (src?.get && src?.set) Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
        configurable: src.configurable, enumerable: src.enumerable, get: src.get,
        set(value) {
          const blob = blobs.get(String(value));
          if (blob?.type === 'application/pdf' && this.style.width === '0px' && this.style.height === '0px') {
            const onload = this.onload;
            this.onload = function (event) {
              let overridden = false;
              try {
                const win = this.contentWindow;
                const noop = () => {};
                if (win) { win.print = noop; overridden = win.print === noop; }
              } catch (_) { /* Try the website's normal print path instead. */ }
              if (!overridden) {
                this.onload = onload;
                src.set.call(this, value);
                return;
              }
              try { send(blob, 'print', 'document.pdf'); }
              finally { if (onload) onload.call(this, event); }
            };
            return src.set.call(this, 'about:blank');
          }
          return src.set.call(this, value);
        }
      });
      const open = window.open;
      window.open = function (url, ...args) {
        const blob = blobs.get(String(url));
        if (blob?.type === 'application/pdf') { send(blob, 'print', 'document.pdf'); return null; }
        return open.call(this, url, ...args);
      };
    })();
    """#
}

private final class WeakDocumentHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = InvoiceBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
