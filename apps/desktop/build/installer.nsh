; Custom NSIS hooks, wired in via build.nsis.include in package.json.

; ---------------------------------------------------------------- installing
;
; "TechDesk is running. Close it." -- on a PC where it was not.
;
; A shop installed TechDesk, the installer stopped and said the app was
; running in the background, and nothing was. That is electron-builder's own
; check, and there are three ordinary ways it ends up right about the process
; and wrong about the person:
;
;   1. An Electron app leaves helper processes behind when it crashes or is
;      killed. They are all called TechDesk.exe and none of them has a
;      window, so the process list says yes and the taskbar says no.
;   2. The installer offers to run TechDesk when it finishes. Run the
;      installer again afterwards -- to repair, or over a download that
;      finished twice -- and the app it just started is the app it now
;      refuses to install over.
;   3. Windows takes a moment to reap a process after its window closes.
;      Close TechDesk, start the installer straight away, and the check sees
;      the corpse.
;
; In every one of them the honest answer is not a question. Nothing in
; TechDesk is unsaved -- every sale, repair and stock change is written the
; moment it is made, which is what makes closing it safe to simply do. So
; this closes it, politely first and then firmly, and speaks only if that
; fails.
;
; If it does fail it says the one thing that helps. "Close it manually" is
; useless advice for a window that is not there, and the old dialog's only
; buttons were Retry and Cancel -- a shop that cannot find the app to close
; had nothing left to try.
!macro customCheckAppRunning
  ; $R1 attempts, $R2 tasklist output, $R3 its first character.
  StrCpy $R1 0

  td_check:
    ; All users, not only this one. A per-machine install writes into
    ; Program Files, and a copy running in somebody else's session holds
    ; those files just as tightly as one running here.
    nsExec::ExecToStack '"$SYSDIR\tasklist.exe" /NH /FO CSV /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}"'
    Pop $R0
    Pop $R2

    ; tasklist could not be run at all -- missing, or blocked by policy.
    ; Nothing has been proven either way, and refusing to install on the
    ; strength of a command that never ran is the worse mistake.
    StrCmp $R0 "error" td_clear

    ; A match is a CSV row and starts with a quote. No match prints
    ; "INFO: No tasks are running ...", which does not -- and that is the
    ; whole test, deliberately, because the INFO line is translated on a
    ; Windows that is not in English and the quote is not.
    StrCpy $R3 $R2 1
    StrCmp $R3 '"' 0 td_clear

    IntOp $R1 $R1 + 1

    ; The first two rounds ask; after that, insist. Asking first gives a
    ; window that IS open the chance to close itself, which is what somebody
    ; sitting in front of it expects to see. /T takes the helper processes
    ; with it, which is the point -- killing only the one with a window
    ; leaves the ones holding the files.
    ;
    ; IntCmp jumps on equal, less, greater: rounds 1 and 2 ask, 3 up force.
    IntCmp $R1 2 td_ask td_ask td_force

    td_ask:
      DetailPrint "Closing TechDesk..."
      nsExec::Exec '"$SYSDIR\taskkill.exe" /IM "${APP_EXECUTABLE_FILENAME}" /T'
      Pop $R0
      Sleep 1500
      Goto td_again

    td_force:
      DetailPrint "Closing TechDesk..."
      nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
      Pop $R0
      Sleep 1500

    td_again:
      ; Five rounds is about eight seconds of trying. Past that it is not a
      ; process that is about to exit; it is one this installer cannot touch
      ; -- another Windows account, or a copy running as administrator.
      IntCmp $R1 5 td_stuck td_check td_stuck

  td_stuck:
    MessageBox MB_ABORTRETRYIGNORE|MB_ICONEXCLAMATION \
      "TechDesk is still open somewhere on this PC, and this installer cannot close it.$\r$\n$\r$\nThat usually means it is running under a different Windows account, or was started as administrator. Nothing of yours is at risk -- your sales, repairs and stock are already saved.$\r$\n$\r$\nWhat works: restart the PC, then run this installer before opening TechDesk.$\r$\n$\r$\nRetry -- try closing it once more.$\r$\nIgnore -- install anyway.$\r$\nAbort -- stop, and restart the PC first." \
      /SD IDIGNORE IDRETRY td_retry IDIGNORE td_clear
    Quit

  td_retry:
    StrCpy $R1 0
    Goto td_check

  td_clear:
!macroend

; -------------------------------------------------------------- uninstalling
;
; electron-builder calls this during the uninstaller, before any files are
; removed.
;
; Uninstalling does NOT delete the app's data folder (userData) -- this app
; never sets deleteAppDataOnUninstall, so sales, repairs, inventory and
; customers are safe either way. This dialog exists because most people do
; not know that, and because it is cheap insurance before someone wipes a
; drive, moves to a new PC, or deletes the data folder by hand afterwards.
; "No" aborts so they can take a backup (Settings -> Device -> Download
; backup) first; "Yes" carries on.
!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Have you backed up your TechDesk data?$\r$\n$\r$\nUninstalling will NOT delete your saved sales, repairs, inventory, or customer data -- it stays on this PC. But if you're about to wipe this device or want a safety copy, back up first via Settings -> Device -> Download backup.$\r$\n$\r$\nContinue uninstalling now?" \
    IDYES +2
  Abort
!macroend
