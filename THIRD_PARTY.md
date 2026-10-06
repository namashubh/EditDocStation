# Browser Dependencies

Runtime libraries are bundled under `static/vendor/` and served by GitHub Pages. No document data is sent to npm or a CDN.

| Library | Version | License | Upstream |
| --- | --- | --- | --- |
| pdf-lib | 1.17.1 | MIT; see `static/vendor/pdf-lib.LICENSE.md` | https://github.com/Hopding/pdf-lib |
| JSZip | 3.10.1 | MIT option; see `static/vendor/jszip.LICENSE.markdown` | https://github.com/Stuk/jszip |
| PDF.js | 4.10.38 | Apache-2.0; see `static/vendor/pdfjs/LICENSE` | https://github.com/mozilla/pdf.js |

PDF.js character maps and standard fonts retain the license files distributed in the upstream package. PDF rendering disables evaluation of PDF-provided font code.

These runtime files come from the corresponding pinned npm package archives. The app does not require Node.js or an npm install to run on GitHub Pages.