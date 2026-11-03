; ICG Windows installer (Inno Setup 6.3 or newer; x64compatible needs 6.3).
; Build with installers\windows\build.ps1, which supplies the defines below
; and the Sign Tool definition on the ISCC command line.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef FileVersion
  #define FileVersion "0.0.0.0"
#endif
#ifndef PremiereDir
  #define PremiereDir "..\build\cep\com.icg.premiere"
#endif
#ifndef ResolveDir
  #define ResolveDir "..\..\apps\resolve\dist"
#endif
#ifndef OutputDir
  #define OutputDir "..\build\windows"
#endif

#define PremiereDest "{commoncf32}\Adobe\CEP\extensions\com.icg.premiere"
#define ResolveDest "{commonappdata}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.icg.resolve"

[Setup]
AppId={{7C2E1F7A-5B7B-4C8E-9D3A-1F4B8E6C2A10}
AppName=ICG
AppVersion={#AppVersion}
AppVerName=ICG {#AppVersion}
AppPublisher=ICG
VersionInfoVersion={#FileVersion}
VersionInfoProductTextVersion={#AppVersion}
DefaultDirName={autopf}\ICG
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyMemo=no
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename=ICG-{#AppVersion}-win64
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=ICG
UninstallFilesDir={app}
#ifdef SignToolName
SignTool={#SignToolName}
SignedUninstaller=yes
SignToolRetryCount=3
#endif

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
SelectComponentsDesc=ICG installs into the Hosts you select. Hosts found on this machine are pre-selected.

[Types]
Name: "full"; Description: "Premiere Pro and DaVinci Resolve Studio"
Name: "custom"; Description: "Choose Hosts"; Flags: iscustom

[Components]
Name: "premiere"; Description: "Premiere Pro panel (Premiere Pro 23 and newer)"; Types: full
Name: "resolve"; Description: "DaVinci Resolve Studio plugin (Resolve Studio 19 and newer)"; Types: full

[InstallDelete]
; Replace, never merge: files removed in a newer version must not linger.
Type: filesandordirs; Name: "{#PremiereDest}"; Components: premiere
Type: filesandordirs; Name: "{#ResolveDest}"; Components: resolve

[Files]
; The CEP folder is the extracted signed ZXP. Do NOT add the "sign" flag to
; these files: Authenticode would rewrite them and invalidate the ZXP
; signature CEP checks at load time.
Source: "{#PremiereDir}\*"; DestDir: "{#PremiereDest}"; Components: premiere; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "{#ResolveDir}\*"; DestDir: "{#ResolveDest}"; Components: resolve; Flags: recursesubdirs createallsubdirs ignoreversion

[UninstallDelete]
Type: filesandordirs; Name: "{#PremiereDest}"
Type: filesandordirs; Name: "{#ResolveDest}"

[Code]
function IsPremiereInstalled(): Boolean;
var
  FindRec: TFindRec;
begin
  Result := RegKeyExists(HKLM64, 'SOFTWARE\Adobe\Premiere Pro') or
            RegKeyExists(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Adobe Premiere Pro.exe');
  if Result then Exit;
  if FindFirst(ExpandConstant('{commonpf64}\Adobe\Adobe Premiere Pro *'), FindRec) then
  begin
    try
      repeat
        if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then
          Result := True;
      until Result or not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

function IsResolveInstalled(): Boolean;
begin
  Result := FileExists(ExpandConstant('{commonpf64}\Blackmagic Design\DaVinci Resolve\Resolve.exe')) or
            RegKeyExists(HKLM64, 'SOFTWARE\Blackmagic Design\DaVinci Resolve');
end;

procedure InitializeWizard();
var
  Selected: String;
begin
  Selected := '';
  if IsPremiereInstalled() then
    Selected := 'premiere';
  if IsResolveInstalled() then
  begin
    if Selected <> '' then
      Selected := Selected + ',';
    Selected := Selected + 'resolve';
  end;
  { Nothing detected: offer both rather than an empty page. }
  if Selected = '' then
    Selected := 'premiere,resolve';
  WizardSelectComponents(Selected);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if (CurPageID = wpSelectComponents) and
     not (WizardIsComponentSelected('premiere') or WizardIsComponentSelected('resolve')) then
  begin
    MsgBox('Select at least one Host.', mbError, MB_OK);
    Result := False;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo,
  MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoComponentsInfo + NewLine + NewLine + 'Destination folders:' + NewLine;
  if WizardIsComponentSelected('premiere') then
    Result := Result + Space + ExpandConstant('{#PremiereDest}') + NewLine;
  if WizardIsComponentSelected('resolve') then
    Result := Result + Space + ExpandConstant('{#ResolveDest}') + NewLine;
  Result := Result + NewLine + 'Restart Premiere Pro / DaVinci Resolve after installing.';
end;
