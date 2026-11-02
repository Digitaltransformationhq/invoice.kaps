package in.kapsca.invoice;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends BridgeActivity {
    private static final String APP_ORIGIN = "https://invoice.kapsca.in";
    private static final int MAX_BYTES = 8 * 1024 * 1024;
    private byte[] pendingFile;
    private final ExecutorService documentWorker = Executors.newSingleThreadExecutor();
    private final ActivityResultLauncher<Intent> saveFile = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(), result -> {
            final byte[] bytes = pendingFile;
            pendingFile = null;
            if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || bytes == null) return;
            final Uri uri = result.getData().getData();
            if (uri == null) return;
            new Thread(() -> {
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new Exception("Unable to open destination");
                    out.write(bytes);
                    runOnUiThread(() -> toast("File saved"));
                } catch (Exception e) {
                    runOnUiThread(() -> toast("Could not save the file. Please try again."));
                }
            }).start();
        });

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (bridge == null) return;
        WebView webView = bridge.getWebView();
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            toast("Update Android System WebView to enable document downloads and sharing.");
            return;
        }
        try {
            String script;
            try (InputStream input = getAssets().open("mobile-bridge.js")) {
                ByteArrayOutputStream result = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int count;
                while ((count = input.read(buffer)) != -1) result.write(buffer, 0, count);
                script = new String(result.toByteArray(), StandardCharsets.UTF_8);
            }
            Set<String> allowed = Collections.singleton(APP_ORIGIN);
            WebViewCompat.addWebMessageListener(webView, "InvoiceAndroid", allowed,
                (view, message, source, mainFrame, reply) -> {
                    if (!mainFrame || !"https".equals(source.getScheme()) ||
                        !"invoice.kapsca.in".equals(source.getHost()) ||
                        (source.getPort() != -1 && source.getPort() != 443)) return;
                    String raw = message.getData();
                    documentWorker.execute(() -> handleMessage(raw, reply));
                });
            WebViewCompat.addDocumentStartJavaScript(webView, script, allowed);
            // Capacitor starts loading during super.onCreate; reload once so the
            // origin-restricted listener exists before any website script runs.
            webView.loadUrl(APP_ORIGIN);
        } catch (Exception e) {
            toast("Document support could not start. Please use the website in your browser.");
        }
    }

    private void handleMessage(String raw, JavaScriptReplyProxy reply) {
        if (raw == null || raw.length() > (MAX_BYTES * 4 / 3) + 16384) {
            runOnUiThread(() -> toast("This file is too large. Please use the website in your browser."));
            return;
        }
        long id = 0;
        try {
            JSONObject message = new JSONObject(raw);
            id = message.optLong("id", 0);
            final long requestId = id;
            String action = message.optString("action");
            if ("external".equals(action)) {
                Uri uri = Uri.parse(message.optString("url"));
                String scheme = uri.getScheme();
                if ("https".equals(scheme) || "mailto".equals(scheme) || "tel".equals(scheme)) {
                    runOnUiThread(() -> {
                        try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                        catch (ActivityNotFoundException e) { toast("No app is available to open this link."); }
                    });
                }
                return;
            }
            if (!"save".equals(action) && !"share".equals(action) && !"open".equals(action) && !"print".equals(action)) return;
            byte[] bytes = Base64.decode(message.getString("data"), Base64.DEFAULT);
            if (bytes.length > MAX_BYTES) throw new IllegalArgumentException("File too large");
            String name = message.optString("name", "document").replaceAll("[^a-zA-Z0-9._-]", "_");
            if (name.isEmpty()) name = "document";
            if (name.length() > 120) name = name.substring(name.length() - 120);
            String mime = message.optString("type", "application/octet-stream");
            if (!mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")) mime = "application/octet-stream";
            if ("save".equals(action)) {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
                runOnUiThread(() -> {
                    if (pendingFile != null) { respond(reply, requestId, false, "Finish saving the current file first."); return; }
                    pendingFile = bytes;
                    try { saveFile.launch(intent); respond(reply, requestId, true, ""); }
                    catch (Exception e) { pendingFile = null; respond(reply, requestId, false, "Could not open the file picker."); }
                });
            } else {
                File directory = new File(getCacheDir(), "shared-documents");
                if (!directory.exists() && !directory.mkdirs()) throw new Exception("Cannot create cache");
                File[] oldFiles = directory.listFiles();
                if (oldFiles != null) for (File file : oldFiles)
                    if (System.currentTimeMillis() - file.lastModified() > 24 * 60 * 60 * 1000L) file.delete();
                File file = new File(directory, System.currentTimeMillis() + "-" + name);
                try (FileOutputStream output = new FileOutputStream(file)) { output.write(bytes); }
                if ("print".equals(action)) {
                    if (!"application/pdf".equals(mime)) throw new IllegalArgumentException("Only PDF files can be printed");
                    runOnUiThread(() -> {
                        try {
                            PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                            if (manager == null) throw new IllegalStateException("Print service unavailable");
                            manager.print("Invoice document", new PdfPrintAdapter(file), null);
                            respond(reply, requestId, true, "");
                        } catch (Exception e) {
                            respond(reply, requestId, false, "Could not open Android printing.");
                        }
                    });
                    return;
                }
                Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", file);
                Intent intent;
                if ("share".equals(action)) {
                    intent = new Intent(Intent.ACTION_SEND).setType(mime)
                        .putExtra(Intent.EXTRA_STREAM, uri).putExtra(Intent.EXTRA_TEXT, message.optString("text"));
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } else {
                    intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                }
                final Intent chooser = Intent.createChooser(intent, "share".equals(action) ? "Share document" : "Open document");
                runOnUiThread(() -> {
                    try { startActivity(chooser); respond(reply, requestId, true, ""); }
                    catch (Exception e) { respond(reply, requestId, false, "No app is available to open this file."); }
                });
            }
        } catch (Exception e) {
            final long requestId = id;
            runOnUiThread(() -> respond(reply, requestId, false, "Could not process the file. Please try again or use the website in your browser."));
        }
    }

    private void respond(JavaScriptReplyProxy reply, long id, boolean ok, String error) {
        try { reply.postMessage(new JSONObject().put("id", id).put("ok", ok).put("error", error).toString()); }
        catch (Exception ignored) { toast(error.isEmpty() ? "Unable to complete the request." : error); }
    }

    private final class PdfPrintAdapter extends PrintDocumentAdapter {
        private final File file;
        PdfPrintAdapter(File file) { this.file = file; }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                             CancellationSignal cancellation, LayoutResultCallback callback, Bundle extras) {
            if (cancellation.isCanceled()) { callback.onLayoutCancelled(); return; }
            PrintDocumentInfo info = new PrintDocumentInfo.Builder("document.pdf")
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN).build();
            callback.onLayoutFinished(info, true);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                            CancellationSignal cancellation, WriteResultCallback callback) {
            documentWorker.execute(() -> {
                // The source is a finished PDF. Copying it preserves quality,
                // but cannot remove selected pages. Never report a complete
                // PDF as a successful partial-page print.
                if (pages.length != 1 || !PageRange.ALL_PAGES.equals(pages[0])) {
                    try { destination.close(); } catch (Exception ignored) { }
                    callback.onWriteFailed("Select all pages, or open the PDF in a viewer to print selected pages.");
                    return;
                }
                try (FileInputStream in = new FileInputStream(file);
                     OutputStream out = new ParcelFileDescriptor.AutoCloseOutputStream(destination)) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = in.read(buffer)) != -1) {
                        if (cancellation.isCanceled()) break;
                        out.write(buffer, 0, count);
                    }
                } catch (Exception e) {
                    callback.onWriteFailed("Could not prepare the PDF for printing.");
                    return;
                }
                // The destination must be closed before the spooler consumes it.
                if (cancellation.isCanceled()) callback.onWriteCancelled();
                else callback.onWriteFinished(new PageRange[]{ PageRange.ALL_PAGES });
            });
        }
    }

    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }

    @Override
    public void onDestroy() {
        documentWorker.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (bridge != null && bridge.getWebView().canGoBack()) bridge.getWebView().goBack();
        else super.onBackPressed();
    }
}
