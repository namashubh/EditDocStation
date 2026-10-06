Option Explicit

Dim shell, request, appUrl, appDir, runCommand
Set shell = CreateObject("WScript.Shell")
appUrl = "http://127.0.0.1:5000/"
appDir = "C:\Users\515795\Desktop\SHUBHAM_APPLICATION_STATION\DOCUMENT EDITING TOOL "

On Error Resume Next
Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
request.SetTimeouts 800, 800, 800, 800
request.Open "GET", appUrl, False
request.Send
If Err.Number = 0 And request.Status = 200 Then
    shell.Run appUrl, 1, False
    WScript.Quit
End If
Err.Clear
On Error GoTo 0

runCommand = Chr(34) & appDir & "run.bat" & Chr(34)
Dim shell, appDir, pythonw, launcher, command
Set shell = CreateObject("WScript.Shell")
appDir = "C:\Users\515795\Desktop\SHUBHAM_APPLICATION_STATION\DOCUMENT EDITING TOOL "
pythonw = "C:\Users\515795\Desktop\SHUBHAM_APPLICATION_STATION\DOCUMENT EDITING TOOL\.venv\Scripts\pythonw.exe"
launcher = appDir & "\desktop.py"

If Not CreateObject("Scripting.FileSystemObject").FileExists(pythonw) Then
    MsgBox "The app environment is missing. Run run.bat once to install it, then click this shortcut again.", 16, "Edit Doc Station"
    WScript.Quit 1
End If

command = Chr(34) & pythonw & Chr(34) & " " & Chr(34) & launcher & Chr(34)
shell.Run command, 0, False
