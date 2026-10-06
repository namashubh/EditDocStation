Option Explicit

Dim shell, files, appDir, pythonw, launcher, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
appDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
pythonw = appDir & "\.venv\Scripts\pythonw.exe"
If Not files.FileExists(pythonw) Then
    pythonw = RTrim(appDir) & "\.venv\Scripts\pythonw.exe"
End If

If Not files.FileExists(pythonw) Then
    MsgBox "The app environment is missing. Run run.bat once, then try again.", 16, "Edit Doc Station"
    WScript.Quit 1
End If

launcher = appDir & "\desktop.py"
command = Chr(34) & pythonw & Chr(34) & " " & Chr(34) & launcher & Chr(34) & " --background"
shell.Run command, 0, False