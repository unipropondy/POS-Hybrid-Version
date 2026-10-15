!macro customInstall
  CreateDirectory "$INSTDIR\logs"

  ; Copy bundled log files from resources/logs if present
  IfFileExists "$INSTDIR\resources\logs\*.log" 0 +2
    CopyFiles /SILENT "$INSTDIR\resources\logs\*.log" "$INSTDIR\logs\"

  ; Guarantee backend.log exists
  IfFileExists "$INSTDIR\logs\backend.log" +4 0
    FileOpen $0 "$INSTDIR\logs\backend.log" w
    FileWrite $0 "[SETUP] UniPro POS Backend Logging Active.$\r$\n"
    FileClose $0

  ; Guarantee frontend.log exists
  IfFileExists "$INSTDIR\logs\frontend.log" +4 0
    FileOpen $1 "$INSTDIR\logs\frontend.log" w
    FileWrite $1 "[SETUP] UniPro POS Frontend Logging Active.$\r$\n"
    FileClose $1

  Delete "$INSTDIR\logs\readme.txt"

  ; Create Desktop and Start Menu shortcuts directly to the logs folder
  CreateShortCut "$DESKTOP\UniPro POS Logs.lnk" "$WINDIR\explorer.exe" '"$INSTDIR\logs"' "" "" "" "" "Open UniPro POS Logs Folder"
  CreateShortCut "$SMPROGRAMS\UniPro POS\UniPro POS Logs.lnk" "$WINDIR\explorer.exe" '"$INSTDIR\logs"' "" "" "" "" "Open UniPro POS Logs Folder"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\UniPro POS Logs.lnk"
  Delete "$SMPROGRAMS\UniPro POS\UniPro POS Logs.lnk"
!macroend
