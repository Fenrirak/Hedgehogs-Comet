# Hedgehog’s Comet

Free Japanese revision for NZ beginners. GitHub Pages hosts the static website; optional Firebase Authentication and Firestore provide username/password accounts and private sync. No payment feature or paid translation API is included. Guest mode works before Firebase is configured.

## Project layout

- The project root contains the website pages, styles, scripts and workers. `vendor/` contains their third-party runtime assets.
- `scripts/` contains the local preview server and release script.
- `tests/` contains the app and Firestore tests.
- `functions/` contains the optional handwriting backend. Firebase configuration and rules live at the project root.
- `.github/workflows/` contains the GitHub Pages workflow.

Browser practice is tied to the site’s origin. Export practice or a full backup before switching hostnames or moving between a local preview and the deployed site.

## Try it locally

Install Node.js 22 or later, then run `node scripts/preview.mjs` from this folder. Open `http://127.0.0.1:4173`. Use a Japanese speech voice installed in your device/browser. Some voices need an internet connection. The preview serves only the public website files and vendored runtime assets.

Opening the HTML as a `file:` URL is a limited preview: OneNote workers, dictionary loading and model translation need an HTTP(S) website. Use the local preview server to load the full site.

## Publish on GitHub Pages

1. Copy the complete project into your GitHub repository, including the hidden `.github/` directory and `.gitignore` file. Do not upload students' backups, notebooks or service-account files.
2. In repository Settings → Pages, select **GitHub Actions** as the source.
3. In Settings → Secrets and variables → Actions → Variables, set `SITE_URL` to the final HTTPS URL including the repository path, for example `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`. Set `OWNER_CONTACT` to the operator's real name/organisation, appropriate address and privacy contact email. These values are public.
4. Push to `main` or run **Publish Hedgehog’s Comet**. The workflow checks the app, generates real canonical URLs, structured data, `sitemap.xml` and `robots.txt`, inserts the operator contact in the legal pages and publishes the staged website files.
5. Review the privacy/terms pages against your actual operating arrangements before student rollout. The release script deliberately refuses to publish missing URL/contact information. The source sitemap has no fake URLs; it is populated at release time. The creator page is marked noindex and excluded from the sitemap.
6. You may submit the deployed sitemap to search engines. Indexing is not guaranteed. On a project Pages URL, the sitemap is under `/YOUR-REPOSITORY/sitemap.xml`; crawlers normally request `/robots.txt` at the domain root. If you control the root Pages repository/custom domain, put the root robots file there too. The project robots file alone cannot control the domain root.

Manual release: `node scripts/release.mjs --site-url https://YOUR-HOST/YOUR-PATH/ --contact "Your operator and privacy contact details"`. Serve the publish directory printed by the script.

## Enable optional Firebase accounts

No Firebase project was available to configure during this build. Accounts remain visibly disabled until these steps are completed. The Firebase plugin is available in the Codex plugin directory if you want to connect it for a later setup session.

1. Create/select your Firebase project. Register a web app and create **Cloud Firestore Standard** in a suitable region. Choose production/locked rules, not test mode. You do not need Firebase Hosting or Storage for this app.
2. Enable Authentication → Email/Password. Students type a username and password; the adapter maps a normalised username to `username@users.kotoba.invalid` for Firebase's password provider. This is a synthetic identifier, not a real email address. Do not enable email-verification requirements or email-based reset workflows for these synthetic addresses. There is no email recovery. Password change and account deletion require the current password. No password is written to Firestore or app local storage.
3. Add the GitHub Pages hostname and any custom hostname under Authentication → Settings → Authorised domains. Set a strong Firebase password policy (at least 12 characters) and review sign-up/abuse limits. Frontend length checks are not a substitute for backend policy.
4. Paste the console's **public web app config** into `config.js`, replacing `firebase: null`. Never add Admin SDK/service-account/private keys to a website or Git repository.
5. Run `npm install`, then `npx firebase login`. Select your project with `npx firebase use --add`. Deploy `firestore.rules` and `firestore.indexes.json` with `npx firebase deploy --only firestore --project YOUR_PROJECT_ID`.
6. Run `npm run test:rules` with a supported Java runtime installed for the Firestore emulator. The included tests check owner access, unauthenticated access, cross-user reads/writes/deletes, malformed records and size limits. They were prepared but not run here because Java/Firebase emulator infrastructure was unavailable. Do not enable student accounts until these pass and you have tested two real devices and two different accounts.
7. Optional: register Firebase App Check with reCAPTCHA Enterprise, add the public site key in `config.js`, test legitimate clients, then enable enforcement in Firebase. This can reduce abuse. Confirm quotas, monitoring and current provider pricing before enabling billing. The app is free to learners; infrastructure free tiers still have finite quotas.
8. Test signup, wrong-password handling, syncing, offline edits, deleting a practice on one device, signing out on a shared device, password changes and deleting an account. Publish the final configuration through GitHub Pages.

Auth persists for the browser session. Account and guest browser copies are separated. Students explicitly opt in to merging guest notes at sign-in. Signing out does not erase the account's browser cache; explain clearing site data on shared operating-system accounts. Account deletion deletes its active cloud records and local account cache. It cannot erase an already-offline copy on another device or provider backups/logs.

## Data and changing providers later

`sync.mjs` contains the Firebase adapter; `state.mjs` contains the provider-independent merge and serialisation model. Auth and database work can be replaced without rewriting the practice studio. Each user has a private `/users/{uid}/state/` collection. State is chunked to stay below the Firestore document limit, and updated atomically in a transaction. Notes merge by ID/update time, deletions use tombstones, and word ratings merge by update time. Settings/drafts use the latest device timestamp. Clock skew or simultaneous editing of the same note can choose one version: export before major multi-device edits. This is private access control, not end-to-end encryption or collaborative document editing.

Sync waits 3 seconds after edits and retries on reconnection. A waiting/paused status does not mean an edit reached the cloud; keep the tab open until it says synced. Device saving and full JSON backups work without a Firebase project. Full backups restore via the account panel, including in guest mode.

## OneNote notebook import

In OneNote desktop, choose File → Export → Notebook → **OneNote Package (.onepkg)**. Upload that package in Add material. `.one` sections and `.one`/`.onepkg` files inside ZIPs are supported too. Reader downloads are served with the site; the notebook stays on the device. A timed worker opens the CAB archive with libarchive, parses OneNote text properties with Pyodide/pyOneNote, and returns typed text for mandatory review. No notebook macros, attachments or embedded code are executed.

The reader supports typed text, not image/handwriting OCR inside OneNote, and does not recreate notebook layout. Some protected/unsupported notebook versions require PDF/DOCX export. Recovered objects can include historical revisions; reading order may differ. Review against the notebook and remove unwanted/old material before use. Limits: 20 MB per input, 80 MB expanded archive, 60 sections, 40 MB per extracted section, 200,000 characters per practice, 500 player items. Large school notebooks may need section exports. PDF/image OCR remains available separately.

Validation used a public Unicode fixture from [onenote.rs](https://github.com/msiemens/onenote.rs/tree/master/crates/parser/tests/samples), packed as an MSZIP CAB. CAB extraction and typed-text parsing succeeded in Node WebAssembly. This is not a blanket compatibility guarantee for your school's notebooks. The browser worker integration still needs a hosted-site check with representative exports.

## Audio, English and romaji

Removed the silent warm-up utterance, idle cancellations and arbitrary 160-character slicing inside sentences. Full sentences are queued with the selected Japanese voice. Pauses and repetitions still deliberately create boundaries; Web Speech does not expose raw PCM audio, so it cannot apply a waveform fade to fix driver/voice clicks. Actual smoothness needs listening on your students' devices. If a voice has a startup bump, try another installed Japanese voice. Very long sentences can still hit device speech limits.

English uses the browser's local Translator API when available, otherwise a pinned Transformers.js/Marian Japanese→English model in a worker. Students explicitly allow model downloads; first use can download hundreds of MB and take several minutes. No text is sent to an external translation API. Unsupported/low-memory devices show a clear error. Translation is a machine suggestion. The model entry point and files were checked, but end-to-end inference was not run here.

Romaji uses vendored Kuroshiro/Kuromoji dictionaries. Kanji and particle handling were tested with `私はりんごを食べます。`, producing spaced Hepburn `watashi wa ringo o tabe masu .`. Context-sensitive readings and names still need a human check. These tools do not change the source Japanese.

## Checks

`npm test`: source checks, parsing/scheduling/substitution tests, sync merge tests and DOM runtime tests with a stub speech engine. The DOM test checks startup, guest saving, ratings, exact speech queue, idle cancellation, paragraphs and the unconfigured-account guard. The speech stub does not validate acoustic quality. `npm run test:rules` uses Firebase emulators separately.

Passed here: JS syntax, all existing core checks, merge/deletion/Unicode chunk checks, DOM runtime checks, actual dictionary conversion, and CAB→OneNote typed-text recovery. Browser visual/audio/OCR/model-inference checks and live Firebase/GitHub deployment remain unverified. Earlier browser preview access was declined by the local-origin approval gate; no browser workaround was used.

## Upstream references and licences

See `THIRD-PARTY.md`. Key implementation references: [Firebase password accounts](https://firebase.google.com/docs/auth/web/password-auth), [owner-based Firestore rules](https://firebase.google.com/docs/firestore/security/rules-conditions), [transactions](https://firebase.google.com/docs/firestore/manage-data/transactions), [GitHub Pages](https://docs.github.com/en/pages/quickstart), [local browser translation](https://developer.chrome.com/docs/ai/translator-api), [Japanese→English model](https://huggingface.co/Xenova/opus-mt-ja-en), and [NZ privacy statement guidance](https://www.privacy.org.nz/resources-and-learning/a-z-topics/whats-the-difference-between-a-privacy-statement-notice-and-policy/).


## Current lesson and import changes
Recommended practice items now use hiragana only, including loanwords. Romaji and English are separate automatic display toggles on the player; the standalone translation panel was removed. Existing lesson meanings/readings need no download. Imported items generate hints when enabled. English prefers the browser translator; fallback eight-bit weights total about 109 MB, compared with about 280 MB for the available four-bit weights, so the smaller eight-bit variant is retained. Runtime/tokenizer downloads add to these sizes.

.one sections are selectable directly and within ZIPs. PDFs accept 200 pages (the 20 MB and extracted-text limits still apply). Handwriting mode uses Google Cloud Vision DOCUMENT_TEXT_DETECTION with Japanese hints; it is prepared but disabled until the operator configures it. Enable Cloud Vision API and billing, install dependencies in functions/, deploy the included Firebase callable, configure App Check, and set handwritingEnabled:true in config.js. The backend requires sign-in and App Check and limits usage to 20 images per account per UTC day. Students explicitly select cloud handwriting mode; their image is sent to Google for recognition. This can cost the operator money and has not been tested with live credentials. Local Tesseract remains the printed-text path and is not represented as reliable handwriting recognition. Always review transcription. Source: https://docs.cloud.google.com/vision/docs/handwriting and https://docs.cloud.google.com/vision/docs/languages .

Handwriting deployment: in functions/ run npm install, then from the project root run npx firebase deploy --only functions:recogniseHandwriting --project YOUR_PROJECT_ID. Enable a Firestore TTL policy on handwritingQuota.expiresAt so short-lived usage records expire. Student clients cannot read/write these quota records. Configure provider quotas and a spending budget; per-account quotas are not a global spending cap. No billing was enabled by this build.


## Sentence Mixer
Open Speech & paragraphs. Step 1: select a source sentence or type one. Step 2: click a word chip, select exact text, or type the original word in a replacement row. Step 3: choose your current/imported reference and click word choices, or type comma-separated alternatives directly in that row. Step 4: preview and review the highlighted changed area, then load a sentence for listening. Every occurrence of each exact original is replaced. Other text stays unchanged. The worked example demonstrates all steps. Part-of-speech labels are reminders, not an automatic grammar checker. Changes invalidate old previews. Existing local storage/auth/backup identifiers stay stable through the rename.
