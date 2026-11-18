# Third-party software

- libarchive.js 2.0.2: MIT; vendored licence in `vendor/libarchive/LICENSE`; libarchive/WASM components retain upstream notices. Includes Comlink Apache-2.0 notice in the bundled JS. Source: https://github.com/nika-begiashvili/libarchivejs
- pyOneNote main branch source (upstream version 0.0.2): Apache-2.0; `vendor/pyonenote/LICENSE`. Kotoba Club modified FileNode.py on 18 November 2026 to implement nested property arrays/sets per [MS-ONESTORE 2.6.9](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-onestore/c76fbab9-f528-4f31-8c6f-6f43dcb1199d). Source: https://github.com/DissectMalware/pyOneNote
- Pyodide 0.27.7: MPL-2.0; licence in `vendor/pyodide/LICENSE`. Includes Python and Emscripten components under their upstream licences. Source: https://github.com/pyodide/pyodide
- Kuroshiro 1.2.0 / Kuromoji analyzer 1.1.0: MIT notices in `vendor/romaji/`. Kuromoji 0.1.2 dictionary/package Apache-2.0 notice is also retained there. Sources: https://github.com/hexenq/kuroshiro and https://github.com/takuyaa/kuromoji.js
- Lazy external dependencies: Firebase JS 11.10.0 (Apache-2.0), Transformers.js 3.8.1 (Apache-2.0), Xenova/opus-mt-ja-en model (upstream model card/licence applies), JSZip 3.10.1 (MIT/GPL dual licence), Tesseract.js 5.1.1 (Apache-2.0), PDF.js 4.10.38 (Apache-2.0), and Google Fonts under their font licences.

The public OneNote test fixture is used only for development and is not included in this release archive. Original third-party notices are retained in vendored files. The site does not claim ownership of imported student material.
