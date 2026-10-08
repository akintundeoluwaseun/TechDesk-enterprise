; Custom NSIS hooks, wired in via build.nsis.include in package.json.

; ------------------------------------------------------------ compression
;
; electron-builder hard-codes `SetCompressor zlib` -- it is not reachable
; through the `compression` option, which only chooses between this and no
; compression at all. The reasoning is sound for an ordinary Electron app:
; the whole payload is one app-64.7z that is already LZMA-compressed and is
; stored with compression off, so the only thing zlib ever sees is a few
; small DLLs and bitmaps, and zlib unpacks them faster.
;
; It stops being sound once this installer carries a thirty-megabyte
; animation. Deflate works in a 32 KB window, which is a tenth of ONE frame,
; so it cannot see that frame 2 is nearly frame 1 and stores all ninety of
; them nearly whole:
;
;     zlib   td-slides.avi -> 5,183,592 bytes   (measured in 4.16.0)
;     lzma   td-slides.avi ->   874,731 bytes
;
; 4.3 MB, on a download a shop in Lagos may be paying for by the megabyte.
;
; makensis takes the last SetCompressor it is given, and electron-builder
; passes theirs as a -X command line argument, which runs before the script;
; this file is included near the top of the script, before any File. So this
; line wins, and `makensis -WX` -- warnings as errors, which electron-builder
; also turns on -- compiles it without complaint. Verified both ways.
;
; Not /SOLID: solid compression makes NSIS unpack to a temporary file first,
; and it buys 776 bytes here. Measured, not assumed.
SetCompressor lzma

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
; /SD IDYES, because this macro does not only run when somebody chose to
; uninstall. Installing an update runs the OLD version's uninstaller first,
; silently, to clear the previous files -- and an NSIS MessageBox without a
; silent-mode default is shown anyway, even to a silent uninstaller. So every
; update stopped on "Have you backed up your TechDesk data? ... Continue
; uninstalling now?", over a frozen progress bar, in the middle of an UPDATE
; that the shop never thought of as an uninstall. Answering No aborted it.
;
; With the default, an uninstaller nobody started answers itself and carries
; on; a person uninstalling from Add/Remove Programs still gets the question,
; which is the only time it was ever meant for them.
;
; (Found by running the installer over a previous install. It is not new in
; 4.16.0 -- the same macro and the same missing default shipped in 4.15.1 and
; before, where the update was one-click and the dialog even less expected.)
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
    /SD IDYES \
    IDYES +2
  Abort
!macroend

; ---------------------------------------------------------------- the skin
;
; Both pages a shop sees are one picture edge to edge: a still on the welcome
; page, and on the install page a slideshow of what TechDesk does, with the
; progress underneath it. That minute is the only time a shop watches us with
; nothing else to look at, and MUI's own wizard spends it on a white header
; band, a margin, and a scrolling list of file names.
;
; Four hooks, each the only place electron-builder lets this happen:
;
;   customInit               runs inside .onInit -- where the artwork is
;                            unpacked, before any page can ask for one.
;   customWelcomePage        replaces the welcome page, so its SHOW function
;                            can be named. It still inserts MUI's own page.
;   customPageAfterChangeDir expanded immediately before MUI_PAGE_INSTFILES,
;                            which is what lets THAT page's SHOW function be
;                            named in time. It adds no page of its own.
;   customInstall            the end of the install section, with the page
;                            still up: the artwork's bitmap is handed back.
;
; The code is in build/slideshow.nsh; electron-builder puts build resources on
; the include path. All of it is written to fail quietly -- a missing file or
; an unexpected dialog leaves MUI's ordinary page exactly as it was.
!ifndef BUILD_UNINSTALLER
  !include "slideshow.nsh"
!endif

!macro customInit
  ; $PLUGINSDIR is this instance's own temporary folder, and is cleaned up for
  ; us. Extracting here rather than into $INSTDIR keeps the artwork off the
  ; shop's disk once the install is done.
  ;
  ; The two STILLS only. The animation is thirty megabytes, and unpacking it
  ; here -- inside .onInit, before any window exists -- bought several seconds
  ; of nothing at all happening after a shop double-clicks the installer. It
  ; is unpacked by the install page instead, which is the first moment anyone
  ; needs it and by which time there is a window to look at.
  InitPluginsDir
  File "/oname=$PLUGINSDIR\td-slidebg.bmp"  "${BUILD_RESOURCES_DIR}\slidebg.bmp"
  File "/oname=$PLUGINSDIR\td-welcome.bmp"  "${BUILD_RESOURCES_DIR}\welcome.bmp"
!macroend

; --------------------------------------------------- who it installs for
;
; Turning the one-click installer into a wizard brought a page with it that
; nobody asked for: "Choose Installation Options -- who should this
; application be installed for?", with "Anyone who uses this computer" and
; "Only for me". electron-builder adds it whenever an assisted installer is
; not pinned to per-machine.
;
; It is the wrong question to put to a shop. The person at the counter does
; not know which answer is right, both answers work, and "all users" quietly
; needs an administrator -- so the honest-looking choice is the one that can
; fail. Up to 4.15.1 the one-click installer never asked: it installed for
; the person running it. This keeps that exactly, and skips the page.
;
; electron-builder provides this hook for it. Setting the flag makes the
; page's own PRE function choose per-user and Abort, which is how NSIS skips
; a page -- it is not hidden, it is never shown.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW tdWelcomeShow
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW tdSlideshowShow
!macroend

!macro customInstall
  Call tdSlideshowStop
!macroend
