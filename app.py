import io
import logging
import mimetypes
import os
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, jsonify, render_template, request, send_file
from werkzeug.utils import secure_filename

try:
    import truststore  # trust the OS certificate store (corporate proxies) for model downloads
    truststore.inject_into_ssl()
except ImportError:
    pass

# Extended-length prefix keeps Windows from stripping a trailing space in the folder name.
_HERE = os.path.dirname(os.path.abspath(__file__)).removeprefix("\\\\?\\")
sys.path.insert(0, "\\\\?\\" + _HERE if os.name == "nt" else _HERE)

import converters as c  # noqa: E402
from converters import ToolError  # noqa: E402

app = Flask(__name__, root_path=_HERE)
app.config["MAX_CONTENT_LENGTH"] = 300 * 1024 * 1024  # 300 MB per request
log = logging.getLogger("docstation")
PAGES_ORIGIN = "https://namashubh.github.io"
WINDOWS_SETUP_NAME = "EditDocStation-1.0.2-Windows-x64-Offline.exe"
WINDOWS_SETUP_FILE = Path(_HERE).parent / "EditDocStation" / "release" / WINDOWS_SETUP_NAME


def is_allowed_pwa_origin(origin):
    parsed = urlsplit(origin or "")
    return origin == PAGES_ORIGIN or (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    )


@app.after_request
def allow_pwa_api(response):
    origin = request.headers.get("Origin")
    if origin and is_allowed_pwa_origin(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Methods"] = "GET, HEAD, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Expose-Headers"] = "Content-Disposition, X-Original-Size, X-Result-Size"
        response.headers.add("Vary", "Origin")
        if request.headers.get("Access-Control-Request-Private-Network") == "true":
            response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

PDF = {".pdf"}
IMAGES = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".tif", ".tiff"}
WORD = {".doc", ".docx", ".odt", ".rtf", ".txt"}
PPT = {".ppt", ".pptx", ".odp"}
EXCEL = {".xls", ".xlsx", ".ods", ".csv"}
HTML = {".html", ".htm"}


def save_uploads(work, allowed, field="files"):
    paths = []
    for i, f in enumerate(request.files.getlist(field)):
        if not f or not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext not in allowed:
            raise ToolError(f"'{f.filename}' is not supported here. Allowed: {', '.join(sorted(allowed))}")
        stem = secure_filename(Path(f.filename).stem) or "file"
        path = work / f"{i:03d}_{stem}{ext}"
        f.save(path)
        paths.append(path)
    return paths


def need(paths, label="a file"):
    if not paths:
        raise ToolError(f"Please upload {label}")
    return paths


def form_int(name, default):
    try:
        return int(float(request.form.get(name, default)))
    except (TypeError, ValueError):
        return default


def for_each(files, work, fn, zip_name):
    """Run fn(file) for every upload and return a single file or a zip."""
    outputs = []
    for f in files:
        result = fn(f)
        outputs.extend(result if isinstance(result, list) else [result])
    return c.single_or_zip(outputs, work, zip_name)


def office_tool(allowed, kind):
    def handler(work):
        files = need(save_uploads(work, allowed))
        return for_each(files, work,
                        lambda f: c.office_to_pdf(f, work / f"{c.clean_stem(f)}.pdf", kind), "converted_pdfs.zip")
    return handler


# Every handler receives a private temp folder and returns (file_path, download_name)
def h_merge(work):
    files = need(save_uploads(work, PDF), "PDF files")
    return c.merge_pdfs(files, work / "merged.pdf"), "merged.pdf"


def h_split(work):
    src = need(save_uploads(work, PDF))[0]
    outs = c.split_pdf(src, work, request.form.get("mode", "all"), request.form.get("ranges", ""))
    return c.single_or_zip(outs, work, f"{c.clean_stem(src)}_split.zip")


def h_remove_pages(work):
    src = need(save_uploads(work, PDF))[0]
    out = work / f"{c.clean_stem(src)}_edited.pdf"
    return c.remove_pages(src, out, request.form.get("pages", "")), out.name


def h_rotate(work):
    files = need(save_uploads(work, PDF))
    angle = form_int("angle", 90)
    pages = request.form.get("pages", "all")
    return for_each(files, work, lambda f: c.rotate_pdf(f, work / f"{c.clean_stem(f)}_rotated.pdf", angle, pages),
                    "rotated_pdfs.zip")


def h_compress(work):
    files = need(save_uploads(work, PDF))
    level = request.form.get("level", "recommended")
    return for_each(files, work, lambda f: c.compress_pdf(f, work / f"{c.clean_stem(f)}_compressed.pdf", level),
                    "compressed_pdfs.zip")


def h_pdf_to_word(work):
    files = need(save_uploads(work, PDF))
    return for_each(files, work, lambda f: c.pdf_to_word(f, work / f"{c.clean_stem(f)}.docx"), "word_files.zip")


def h_pdf_to_ppt(work):
    files = need(save_uploads(work, PDF))
    return for_each(files, work, lambda f: c.pdf_to_powerpoint(f, work / f"{c.clean_stem(f)}.pptx"),
                    "powerpoint_files.zip")


def h_pdf_to_excel(work):
    files = need(save_uploads(work, PDF))
    return for_each(files, work, lambda f: c.pdf_to_excel(f, work / f"{c.clean_stem(f)}.xlsx"), "excel_files.zip")


def h_pdf_to_jpg(work):
    files = need(save_uploads(work, PDF))
    dpi = max(50, min(600, form_int("dpi", 150)))
    mode, fmt = request.form.get("mode", "pages"), request.form.get("format", "jpg")
    return for_each(files, work, lambda f: c.pdf_to_images(f, work, mode, dpi, fmt), "pdf_images.zip")


def h_jpg_to_pdf(work):
    files = need(save_uploads(work, IMAGES), "images")
    out = work / "images.pdf"
    c.images_to_pdf(files, out, request.form.get("page_size", "a4"), request.form.get("orientation", "auto"),
                    form_int("margin", 20))
    return out, out.name


def h_html_to_pdf(work):
    files = save_uploads(work, HTML)
    out = work / (f"{c.clean_stem(files[0])}.pdf" if files else "webpage.pdf")
    c.html_to_pdf(out, url=request.form.get("url"), html_file=files[0] if files else None)
    return out, out.name


def h_edit(work):
    src = need(save_uploads(work, PDF))[0]
    images = {}
    for key, f in request.files.items(multi=True):
        if key.startswith("img_"):
            images[key] = f.read()
    suffix = "signed" if request.path.endswith("/sign") else "edited"
    out = work / f"{c.clean_stem(src)}_{suffix}.pdf"
    return c.edit_pdf(src, out, request.form.get("items"), images), out.name


def h_watermark(work):
    files = need(save_uploads(work, PDF))
    wm = request.files.get("watermark_image")
    image_bytes = wm.read() if wm and wm.filename else None
    return for_each(files, work,
                    lambda f: c.watermark_pdf(f, work / f"{c.clean_stem(f)}_watermarked.pdf", request.form, image_bytes),
                    "watermarked_pdfs.zip")


def h_page_numbers(work):
    files = need(save_uploads(work, PDF))
    pos = request.form.get("position", "bottom-center")
    if pos not in {f"{v}-{h}" for v in ("top", "bottom") for h in ("left", "center", "right")}:
        pos = "bottom-center"
    start, size = form_int("start", 1), max(6, min(48, form_int("font_size", 11)))
    return for_each(files, work,
                    lambda f: c.add_page_numbers(f, work / f"{c.clean_stem(f)}_numbered.pdf", pos, start, size),
                    "numbered_pdfs.zip")


def h_unlock(work):
    files = need(save_uploads(work, PDF))
    pw = request.form.get("password", "")
    return for_each(files, work, lambda f: c.unlock_pdf(f, work / f"{c.clean_stem(f)}_unlocked.pdf", pw),
                    "unlocked_pdfs.zip")


def h_protect(work):
    files = need(save_uploads(work, PDF))
    pw = request.form.get("password", "")
    return for_each(files, work, lambda f: c.protect_pdf(f, work / f"{c.clean_stem(f)}_protected.pdf", pw),
                    "protected_pdfs.zip")


def h_compress_image(work):
    files = need(save_uploads(work, IMAGES), "images")
    quality = max(5, min(100, form_int("quality", 70)))
    target_kb = max(0, form_int("target_kb", 0))
    fmt = request.form.get("format", "same")
    return for_each(files, work, lambda f: c.compress_image(f, work, quality, target_kb, fmt),
                    "compressed_images.zip")


def h_resize_image(work):
    files = need(save_uploads(work, IMAGES), "images")
    return for_each(files, work, lambda f: c.resize_image(f, work, request.form), "resized_images.zip")


def h_convert_image(work):
    files = need(save_uploads(work, IMAGES), "images")
    fmt = request.form.get("format", "jpeg")
    return for_each(files, work, lambda f: c.convert_image(f, work, fmt), "converted_images.zip")


def h_remove_background(work):
    files = need(save_uploads(work, IMAGES), "images")
    bg = request.files.get("bg_image")
    bg_bytes = bg.read() if bg and bg.filename else None
    return for_each(files, work, lambda f: c.remove_background(f, work, request.form, bg_bytes),
                    "background_removed.zip")


HANDLERS = {
    "merge": h_merge,
    "split": h_split,
    "remove-pages": h_remove_pages,
    "rotate": h_rotate,
    "compress": h_compress,
    "pdf-to-word": h_pdf_to_word,
    "pdf-to-powerpoint": h_pdf_to_ppt,
    "pdf-to-excel": h_pdf_to_excel,
    "pdf-to-jpg": h_pdf_to_jpg,
    "word-to-pdf": office_tool(WORD, "word"),
    "powerpoint-to-pdf": office_tool(PPT, "powerpoint"),
    "excel-to-pdf": office_tool(EXCEL, "excel"),
    "jpg-to-pdf": h_jpg_to_pdf,
    "html-to-pdf": h_html_to_pdf,
    "edit": h_edit,
    "sign": h_edit,
    "watermark": h_watermark,
    "page-numbers": h_page_numbers,
    "unlock": h_unlock,
    "protect": h_protect,
    "compress-image": h_compress_image,
    "resize-image": h_resize_image,
    "convert-image": h_convert_image,
    "remove-background": h_remove_background,
}


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify(status="ok", tools=sorted(HANDLERS), installer_available=WINDOWS_SETUP_FILE.is_file())


@app.route("/api/download/windows", methods=["GET", "HEAD"])
def download_windows_setup():
    if not WINDOWS_SETUP_FILE.is_file():
        return jsonify(error="The Windows setup is not available on this PC."), 404
    return send_file(WINDOWS_SETUP_FILE, as_attachment=True, download_name=WINDOWS_SETUP_NAME)


@app.post("/api/preview")
def preview():
    work = Path(tempfile.mkdtemp(prefix="docstation_"))
    try:
        src = need(save_uploads(work, PDF))[0]
        return jsonify(c.pdf_preview(src, form_int("page", 0)))
    except ToolError as e:
        return jsonify(error=str(e)), 400
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/api/render")
def render_document():
    """Render a result document (PDF or Office) to page images for the preview screen."""
    work = Path(tempfile.mkdtemp(prefix="docstation_"))
    try:
        src = need(save_uploads(work, PDF | WORD | PPT | EXCEL, field="file"))[0]
        ext = src.suffix.lower()
        if ext != ".pdf":
            kind = "word" if ext in WORD else "powerpoint" if ext in PPT else "excel"
            src = Path(c.office_to_pdf(src, work / "preview.pdf", kind))
        return jsonify(c.render_pages(src))
    except ToolError as e:
        return jsonify(error=str(e)), 400
    except Exception:
        log.exception("Preview render failed")
        return jsonify(error="could not render this file"), 500
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/api/tool/<tool>")
def run_tool(tool):
    handler = HANDLERS.get(tool)
    if not handler:
        return jsonify(error="Unknown tool"), 404
    work = Path(tempfile.mkdtemp(prefix="docstation_"))
    try:
        original_size = 0
        for f in request.files.getlist("files"):
            f.stream.seek(0, 2)
            original_size += f.stream.tell()
            f.stream.seek(0)
        result, name = handler(work)
        data = Path(result).read_bytes()
    except ToolError as e:
        return jsonify(error=str(e)), 400
    except Exception:
        log.exception("Tool %s failed", tool)
        return jsonify(error="Processing failed. The file may be damaged or unsupported."), 500
    finally:
        shutil.rmtree(work, ignore_errors=True)

    mimetype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    response = send_file(io.BytesIO(data), mimetype=mimetype, as_attachment=True, download_name=name)
    response.headers["X-Original-Size"] = str(original_size)
    response.headers["X-Result-Size"] = str(len(data))
    return response


@app.errorhandler(413)
def too_large(_):
    return jsonify(error="Files are too large (max 300 MB per request)"), 413


if __name__ == "__main__":
    import threading
    import webbrowser

    logging.basicConfig(level=logging.INFO)
    threading.Timer(1.2, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
