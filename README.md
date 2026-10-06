# EditDocStation

A local document-editing application with a Flask web interface and a Windows desktop launcher.

## Run Locally

1. Install Python on Windows.
2. Double-click `run.bat` to create the virtual environment, install dependencies, and start the server.
3. Open http://127.0.0.1:5000/ in your browser. Keep the server window open.

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