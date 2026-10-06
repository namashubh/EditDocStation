# Browser Dependencies

Runtime libraries are bundled under `static/vendor/` and served by GitHub Pages. No document data is sent to npm or a CDN.

| Library | Version | License | Upstream |
| --- | --- | --- | --- |
| pdf-lib | 1.17.1 | MIT; see `static/vendor/pdf-lib.LICENSE.md` | https://github.com/Hopding/pdf-lib |
| JSZip | 3.10.1 | MIT option; see `static/vendor/jszip.LICENSE.markdown` | https://github.com/Stuk/jszip |
| PDF.js | 4.10.38 | Apache-2.0; see `static/vendor/pdfjs/LICENSE` | https://github.com/mozilla/pdf.js |
| ONNX Runtime Web | 1.22.0 | MIT; see `static/vendor/background/ONNXRuntime.LICENSE` and `ONNXRuntime.NOTICES.txt` | https://github.com/microsoft/onnxruntime |
| U2NetP model | rembg v0.0.0 release | Apache-2.0; see `static/vendor/background/U2Net.LICENSE` | https://github.com/xuebinqin/U-2-Net |
| Lucide icons | 0.468.0 | ISC; see `static/vendor/background/lucide.LICENSE` | https://lucide.dev |

PDF.js character maps and standard fonts retain the license files distributed in the upstream package. PDF rendering disables evaluation of PDF-provided font code.

These runtime files come from the corresponding pinned npm package archives. The app does not require Node.js or an npm install to run on GitHub Pages.

The U2NetP ONNX model originates from https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx and matches the upstream MD5 checksum `8e83ca70e441ab06c318d82300c84806`. It is hosted directly on GitHub Pages, not fetched from a third-party inference API.

## Background Photos

Four background templates are downloaded from Unsplash under the [Unsplash License](https://unsplash.com/license). Original sources:

- Forest: https://images.unsplash.com/photo-1441974231531-c6227db76b6e
- Beach: https://images.unsplash.com/photo-1507525428034-b723cf961d3e
- Mountains: https://images.unsplash.com/photo-1469474968028-56623f02e42e
- City: https://images.unsplash.com/photo-1519501025264-65ba15a82390

Templates are resized to 1600 pixels wide and encoded as JPG. These are background templates, not photos supplied by users. All user test photos are excluded from the public repository.