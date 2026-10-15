; Per-user install into %LOCALAPPDATA%\Programs\SenstoSales (ARCHITECTURE §13.2, INV-82). Tauri's per-user default is
; %LOCALAPPDATA%\SenstoSales, which is the data folder, so that default moves to Programs. An upgrade keeps the folder
; of the earlier install, and a folder the user picked elsewhere stays as picked.
; Included before PRODUCTNAME is defined, hence the literal name.

!define MUI_CUSTOMFUNCTION_GUIINIT SenstoProgramsDir

; The directory page shows the moved default.
Function SenstoProgramsDir
  ${If} $INSTDIR == "$LOCALAPPDATA\SenstoSales"
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\SenstoSales"
  ${EndIf}
FunctionEnd

; Silent installs (/S) have no GUI; the install section starts here, before any file or registry write.
!macro NSIS_HOOK_PREINSTALL
  Call SenstoProgramsDir
  SetOutPath $INSTDIR
!macroend
