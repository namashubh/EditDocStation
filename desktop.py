import os
import shutil
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from pathlib import Path

from werkzeug.serving import make_server

_HERE = os.path.dirname(os.path.abspath(__file__)).removeprefix("\\\\?\\")
sys.path.insert(0, "\\\\?\\" + _HERE if os.name == "nt" else _HERE)
_APP_DATA = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "EditDocStation"
os.environ.setdefault("REMBG_HOME", str(_APP_DATA / "rembg"))


def log_startup(message):
    try:
        _APP_DATA.mkdir(parents=True, exist_ok=True)
        with (_APP_DATA / "startup.log").open("a", encoding="utf-8") as log:
            log.write(message + "\n")
    except OSError:
        pass

log_startup(f"Launcher module loaded from {_HERE}")
try:
    import app as site
except Exception as exc:
    log_startup(f"App import failed: {type(exc).__name__}: {exc}")
    raise


APP_URL = "http://127.0.0.1:5000/"


def find_browser():
    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local = os.environ.get("LOCALAPPDATA", "")
    candidates = [
        os.path.join(program_files_x86, r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(program_files, r"Microsoft\Edge\Application\msedge.exe"),
        os.path.join(program_files, r"Google\Chrome\Application\chrome.exe"),
        os.path.join(program_files_x86, r"Google\Chrome\Application\chrome.exe"),
        os.path.join(local, r"Google\Chrome\Application\chrome.exe"),
        shutil.which("msedge"),
        shutil.which("chrome"),
    ]
    return next((p for p in candidates if p and os.path.isfile(p)), None)


def server_is_running():
    try:
        with urllib.request.urlopen(APP_URL, timeout=1.5) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def show_error(message):
    import ctypes

    ctypes.windll.user32.MessageBoxW(0, message, "Edit Doc Station", 0x10)


def main():
    log_startup("Launcher started")
    if "--background" in sys.argv:
        if server_is_running():
            log_startup("Waiting for the existing local server to close")
            wait = threading.Event()
            while server_is_running():
                wait.wait(5)
        try:
            server = make_server("127.0.0.1", 5000, site.app, threaded=True)
            log_startup("Background service listening on 127.0.0.1:5000")
            server.serve_forever()
        except Exception as exc:
            log_startup(f"Background service failed: {type(exc).__name__}: {exc}")
            raise
        return

    browser = find_browser()
    log_startup(f"Browser: {browser or 'not found'}")
    if not browser:
        show_error("Microsoft Edge or Google Chrome is required to run Edit Doc Station.")
        return

    server = None
    running = server_is_running()
    log_startup(f"Existing local server: {running}")
    if not running:
        try:
            server = make_server("127.0.0.1", 5000, site.app, threaded=True)
            log_startup("Local server bound to 127.0.0.1:5000")
        except OSError:
            log_startup("Could not bind local server on port 5000")
            if not server_is_running():
                show_error("Could not start the local document service on port 5000.")
                return
        if server:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            log_startup("Local server thread started")

    profile = _APP_DATA / "Profiles" / "AppWindow"
    profile.mkdir(parents=True, exist_ok=True)
    log_startup(f"Browser profile created: {profile}")
    try:
        process = subprocess.Popen([
            browser,
            f"--app={APP_URL}",
            f"--user-data-dir={profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
        ])
        log_startup(f"App window process started: {process.pid}")
        process.wait()
    except OSError as exc:
        show_error(f"Could not open the Edit Doc Station window: {exc}")
    finally:
        if server:
            server.shutdown()


if __name__ == "__main__":
    main()