# GSTInvoice Pro mobile app

This separate Capacitor project is a **testing build**, not a finished or
store-ready mobile app. It points at the existing HTTPS website so its screens,
data and `/api/sb` proxy stay on their existing origin. It does not change the
website or copy its source. An internet connection and a working deployment of
`https://invoice.kapsca.in` are required.

The Capacitor `server.url` setting is documented for live reload, not production
deployment. A remotely loaded app may also be subject to app-store policies and
will change whenever the website is deployed. Treat this configuration as a
device-testing prototype; select and validate a production packaging strategy
before publishing. The app ID `in.kapsca.invoice` is provisional and must be
confirmed before signing or store registration.

## Set up the prototype

From this directory, with Node.js 22 or newer:

```sh
npm ci
npm run sync
npm run open:android
```

Android requires Android Studio, a supported JDK and Android SDK. To build iOS,
run the setup on a Mac with Xcode and the required Apple tooling, then run
`npm run open:ios`. Follow the current [Capacitor environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).
The Android and iOS project files are included. A debug APK was built at
`android/app/build/outputs/apk/debug/app-debug.apk`. An iOS build requires a
Mac with Xcode.

`www/index.html` is a minimal required local web asset for Capacitor. With the
current remote URL it is not an offline version of the application. Do not
assume business data can be accessed or edited offline.

## Mobile features and checks

The native adapters handle generated document downloads and PDF printing;
Android also provides a file-sharing bridge. They accept messages only from the
invoice website's HTTPS origin. Android uses the system file picker for
downloads; iOS offers the share sheet. Android transfers files up to 8 MiB and
iOS supports up to 20 MiB. For Android printing, print all pages or open the
PDF in a viewer to select pages.

Run the isolated bridge checks from this directory:

```sh
node tests/android-bridge.test.cjs
node ios/tests/document-bridge.test.cjs
```

These checks exercise JavaScript, not the native UI or a device.

## Before release

Test sign-in, session persistence, sign-out and password-reset links on actual
Android and iOS devices. Test invoices and other PDFs (preview, print, download
and share), file and image selection, spreadsheet import/export, external links,
and the device Back button. WebView support for these browser APIs differs from
normal browsers and may require native integration. Deep links, iOS branding,
release signing, privacy disclosures and store configuration still need work.
No device testing has been completed, so feature parity is not
verified. The existing website's service worker does not cache account data for
offline operations.
