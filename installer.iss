#define AppName "Edit Doc Station"
#define AppVersion "1.0.0"
#define AppId "{{7CB13716-69CF-4635-A0B1-2FF6F9F41C21}"
#define DistDir GetEnv("EDS_DIST")
#define ModelDir GetEnv("EDS_MODELS")
#define OutputDir GetEnv("EDS_OUTPUT")
#define IconPath GetEnv("EDS_ICON")

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Edit Doc Station
DefaultDirName={localappdata}\Programs\Edit Doc Station
DefaultGroupName=Edit Doc Station
PrivilegesRequired=lowest
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=Edit Doc Station Setup
SetupIconFile={#IconPath}
UninstallDisplayIcon={app}\Edit Doc Station.exe
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Files]
Source: "{#DistDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ModelDir}\*"; DestDir: "{localappdata}\EditDocStation\rembg\models"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Edit Doc Station"; Filename: "{app}\Edit Doc Station.exe"; WorkingDir: "{app}"; IconFilename: "{app}\Edit Doc Station.exe"
Name: "{autodesktop}\Edit Doc Station"; Filename: "{app}\Edit Doc Station.exe"; WorkingDir: "{app}"; IconFilename: "{app}\Edit Doc Station.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Edit Doc Station.exe"; Description: "Launch Edit Doc Station"; Flags: postinstall nowait skipifsilent