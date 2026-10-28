; 이미 깔린 Inkline 위에 다시 설치할 때 — 완전히 지우고 새로 깔지, 설정 · 기록을 두고 덮어 깔지 묻는다.
; 작업 기록 폴더(My-History)와 스킬(~/.claude/skills)은 다른 AI 도구도 쓰므로 어느 쪽이든 두고, 조용한 설치(/S)는 덮어 깐다.
; 이 파일은 electron-builder 가 build/installer.nsh 로 찾아 넣는다. 한글이 있어 UTF-8 BOM 으로 둔다
!macro customInit
  ${IfNot} ${UAC_IsInnerInstance}
    ReadRegStr $R8 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $R8 != ""
    ${AndIf} ${FileExists} "$R8\${UNINSTALL_FILENAME}"
      MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "이미 설치된 ${PRODUCT_NAME} 이 있습니다.$\r$\n$\r$\n[예]  완전히 지운 뒤 새로 설치합니다.$\r$\n        앱 설정 · 코테 연습 기록도 함께 지웁니다.$\r$\n[아니요]  설정 · 기록은 그대로 두고 덮어 설치합니다.$\r$\n$\r$\n작업 기록 폴더(My-History)와 스킬은 어느 쪽이든 그대로 둡니다." /SD IDNO IDYES inkline_full IDNO inkline_keep
      Quit
      inkline_full:
        ExecWait '"$R8\${UNINSTALL_FILENAME}" /S /currentuser --delete-app-data _?=$R8' $R9
        ; _?= 로 돌리면 제거 프로그램이 자기 파일은 남긴다 — 그것만 지우고 빈 폴더를 치운다(설치 폴더를 통째로 지우지는 않는다)
        Delete "$R8\${UNINSTALL_FILENAME}"
        RMDir "$R8"
        ; 앱 데이터(%APPDATA%\Inkline)는 제거 프로그램이 남길 수 있어 직접 지운다
        RMDir /r "$APPDATA\Inkline"
      inkline_keep:
    ${EndIf}
  ${EndIf}
!macroend
