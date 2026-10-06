# EditDocStation

A browser-based PDF and image toolkit, with a separate Python/Flask desktop version.

## Online App

Open **https://namashubh.github.io/EditDocStation/** and share that link with anyone. The online app runs entirely in the visitor's browser. Python, VS Code, a Windows server, and a running developer computer are not required.

Files are not uploaded. Processing libraries, PDF workers, fonts, and character maps are bundled with the site and served by GitHub Pages.

Available browser tools:

- Merge, split, remove pages, and rotate PDFs.
- PDF compression and PDF pages to JPG/PNG.
- Images to PDF.
- Visible PDF text replacement, annotations, signatures, watermarks, and page numbers.
- Image compression, resizing, and JPG/PNG/WEBP conversion.

Browser limitations:

- Office/HTML conversions, PDF-to-Office conversions, AI background removal, and password protection/unlocking remain desktop-only.
- Edit PDF highlights selectable text. Clicking a text box allows its visible text to be changed or cleared. Text replacements use substitute fonts on a white background and flatten only the edited pages into images; searchable text, links, forms, and other interactive content on those pages are lost. Unedited pages remain PDFs with their original content. Replaced pages cannot be edited as text again without OCR; retain your original PDF for further edits. Scanned/image-only pages have no selectable text. This is not secure redaction and works best on plain white page backgrounds.
- PDF compression rasterizes pages when it reduces file size. Searchable text, links, forms, and digital signatures are not preserved in the compressed copy. If the result would be larger, the original PDF is returned.
- Whiteout is only a visual cover, not secure redaction. Added signatures are visual, not certificate-based digital signatures. Changing an already digitally signed PDF invalidates its existing signature.
- Password-protected PDFs must be opened in the desktop version first.
- JPG, PNG, WEBP, BMP, and GIF input are supported where the browser can decode them. Animated images become one frame; TIFF is desktop-only. PNG quality cannot be reduced lossily. Impossible size targets return an error rather than a file over the requested limit.
- Limits are 100 MB total input, 100 files per operation, 300 PDF pages, and 16 megapixels per rendered image. Mobile devices may need smaller files. Document previews show up to six pages.
- Physical image units calculate pixel dimensions using the selected DPI; downloaded image DPI metadata follows browser encoding defaults.

Use a current Chrome, Edge, Firefox, or Safari browser. Local processing does not modify the selected original files.

## GitHub Pages

In repository Settings > Pages, publish the `main` branch from `/ (root)`. The root `index.html` is the app entry point. `.nojekyll` keeps the bundled assets unchanged. No Python workflow or external hosting account is needed.

To preview the web version locally, run `python -m http.server 5173` from this repository and open http://127.0.0.1:5173/. Opening the HTML directly as a file does not support the PDF worker modules.

## Browser Tests

Serve the repository over HTTP. Load `tests/browser-tests.js` on the app page with a script element, then call `await runBrowserTests()` in the browser console. It checks all 14 tools, PDF structure, rotated annotation pixels, image dimensions, ZIP filename collisions, and invalid input.

Dependency versions and licenses are listed in `THIRD_PARTY.md`.

## Desktop Version

1. Install Python on Windows.
2. Double-click `run.bat` to create the virtual environment, install dependencies, and start the server.
3. Open http://127.0.0.1:5000/ in your browser. Keep the server window open. This Python interface retains the desktop-only tools.

Microsoft Office or LibreOffice is required for supported Office-to-PDF conversions. Some features use Microsoft Edge or Google Chrome. AI background removal downloads model files on first use.

## Background Mode

After installing dependencies, double-click `start_background.vbs` to run the local server without a terminal window. It runs independently of VS Code and can take over after an existing local server closes.

To start automatically at Windows sign-in, create a shortcut to `start_background.vbs` in the Startup folder (open it with `shell:startup` from the Windows Run dialog).

The application is available only while the computer is awake and the user is signed in. Keep the project folder in place while a Startup shortcut points to it.

## Project Files

- `app.py`: Flask routes and document operations.
- `converters.py`: conversion and processing helpers.
- `desktop.py`: desktop window and background server launcher.
- `templates/` and `static/`: browser interface and assets.
- `requirements.txt`: Python dependencies.

The installer build scripts require additional local tooling and build-path configuration. Virtual environments, generated installers, model downloads, and local configuration are not included in this repository.