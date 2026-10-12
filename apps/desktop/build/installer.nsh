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

; ------------------------------------------------- retiring an old install
;
; How a shop ends up with two TechDesks, and why the new installer has to
; take this job off the old one.
;
; Updating runs the PREVIOUS version's uninstaller first, silently, to clear
; its files. Every uninstaller up to and including 4.16.0 asks "Have you
; backed up your TechDesk data? ... Continue uninstalling now?" from a
; MessageBox with no silent-mode default, and NSIS shows such a box even
; under /S. 4.16.1 fixed that -- but the fix is in the NEW uninstaller, and
; the one that blocks is the OLD one, already on the shop's disk. Nothing we
; ship can reach it. Measured, 4.15.1 -> 4.16.1 with /S:
;
;     t=10s  running=2 windows=[TechDesk Uninstall]
;     ...
;     t=300s running=2 windows=[TechDesk Uninstall]
;
; It never times out. electron-updater installs on app quit with /S, so a
; shop that simply closes TechDesk gets that question with no installer
; window behind it; answer No and nothing installs, while the app goes on
; saying an update is waiting.
;
; So this removes the old version itself, and clears its registry entry
; BEFORE electron-builder goes looking for one: uninstallOldVersion reads
; UninstallString, finds nothing, and returns without running anything.
;
; What it deletes is exactly what that uninstaller would have: the install
; folder, the desktop and Start Menu shortcuts, and the two registry keys.
; Nothing else exists to remove -- this app registers no file associations
; and no protocol handlers (build.fileAssociations and build.protocols are
; both unset), which is what makes taking the job over safe to do completely.
;
; It is NOT a general replacement for the uninstaller. It runs only when the
; installed version predates the fix; from 4.16.1 on, the old uninstaller
; answers itself and is left to its own job. This is a bridge over one hop,
; not a second copy of uninstall logic to keep in step forever.
;
; The shop's data is not touched, and never was by any of this: sales,
; repairs, stock and customers live in %APPDATA%\TechDesk, which no
; uninstaller here deletes.

!include WordFunc.nsh
!insertmacro VersionCompare

; ROOT is the registry root to retire from. TAG only makes the labels unique,
; because this is expanded once per root. Shortcut paths come from $DESKTOP
; and $SMPROGRAMS, which follow SetShellVarContext -- so the caller sets the
; context to match ROOT before expanding this.
!macro tdRetireFrom ROOT TAG
  ; $0 the version found, $1 the comparison, $2 the folder, $3 shortcut name.
  ClearErrors
  ReadRegStr $0 ${ROOT} "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  StrCmp $0 "" td_retired_${TAG}

  ; Only versions from before the uninstaller could answer itself.
  ; VersionCompare returns 2 when the SECOND argument is the newer one.
  ${VersionCompare} "$0" "4.16.1" $1
  StrCmp $1 2 0 td_retired_${TAG}

  ReadRegStr $2 ${ROOT} "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $2 "" td_retired_${TAG}

  ; The guard, and the reason this is safe to do at all. $2 comes out of the
  ; registry and the next thing done with it removes a folder, so it has to be
  ; PROVEN to be a TechDesk folder, not merely non-empty. A folder with our
  ; executable in it is ours. Anything else is left exactly where it is, and
  ; the ordinary path runs instead.
  IfFileExists "$2\${APP_EXECUTABLE_FILENAME}" 0 td_retired_${TAG}

  DetailPrint "Removing TechDesk $0..."

  ; The shortcut may have been renamed; the uninstaller reads the name back
  ; the same way rather than assuming it.
  ReadRegStr $3 ${ROOT} "${INSTALL_REGISTRY_KEY}" ShortcutName
  StrCmp $3 "" 0 +2
    StrCpy $3 "${PRODUCT_FILENAME}"

  WinShell::UninstAppUserModelId "${APP_ID}"
  WinShell::UninstShortcut "$DESKTOP\$3.lnk"
  Delete "$DESKTOP\$3.lnk"
  WinShell::UninstShortcut "$SMPROGRAMS\$3.lnk"
  Delete "$SMPROGRAMS\$3.lnk"

  RMDir /r "$2"

  DeleteRegKey ${ROOT} "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey ${ROOT} "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  DeleteRegKey ${ROOT} "${INSTALL_REGISTRY_KEY}"

  ; So the desktop drops the icon without waiting for a refresh.
  System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'

  td_retired_${TAG}:
  ClearErrors
!macroend

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

  ; ---- the old version, retired here rather than left to its own uninstaller
  ;
  ; This sits at the top of the install section, immediately before
  ; electron-builder's uninstallOldVersion -- the only point that exists
  ; between "the shop pressed Install" and "the old uninstaller is launched".
  ; It is not what a macro called customCheckAppRunning is for, and there is
  ; nowhere else it can go: the hooks either run in .onInit, before the shop
  ; has committed to anything, or after the old uninstaller has already
  ; blocked. See the long note at the top of this file for why it has to
  ; happen before.
  ; Both hives, named outright, rather than SHELL_CONTEXT and whatever
  ; $installMode happens to be. The first version of this cleaned
  ; SHELL_CONTEXT and then the other hive only when $installMode was
  ; "CurrentUser" -- and on a PC that had BOTH copies it cleaned the
  ; per-machine one and left the per-user one, because install mode had
  ; resolved to "all" and neither branch covered the per-user copy.
  ; electron-builder then ran that old uninstaller and the update blocked on
  ; the same dialog this whole release exists to get past.
  ;
  ; There are only two places a TechDesk can be registered, we want both gone
  ; whichever one this install is replacing, and tdRetireFrom is a no-op when
  ; a hive holds nothing. So there is no reason to work it out: say both.
  SetShellVarContext current
  !insertmacro tdRetireFrom HKCU user

  ; The all-users copy. Removing it writes to HKLM and Program Files, so it
  ; happens only with administrator rights; without them it is left alone and
  ; named at the end instead (see customInstall), because a shop that cannot
  ; see why there are two of everything cannot fix it.
  ;
  ; Choosing "Anyone who uses this computer" on 4.16.0's options page (gone
  ; since 4.16.1) is what put one there. Measured on a clean machine:
  ;
  ;   for me       %LOCALAPPDATA%\Programs\techdesk   HKCU   own desktop
  ;   all users    C:\Program Files\TechDesk          HKLM   All Users desktop
  ;
  ; Same registry GUID, two different hives, so neither install can see or
  ; replace the other, and Windows draws both desktops as one. That is how a
  ; PC ends up showing two icons and two Add/Remove entries for one app.
  ${If} ${UAC_IsAdmin}
    SetShellVarContext all
    !insertmacro tdRetireFrom HKLM machine
  ${EndIf}

  ; Put the context back to the one this install is actually using, since the
  ; rest of the section writes its shortcuts through it.
  ${If} $installMode == "all"
    SetShellVarContext all
  ${Else}
    SetShellVarContext current
  ${EndIf}
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
  ; ---- for this user, decided here and not left to be worked out
  ;
  ; customInstallMode below skips the "who should this be installed for?"
  ; page, and that is enough when there IS a page. A silent install runs no
  ; pages at all, so nothing calls it, and initMultiUser decides instead --
  ; by reading the registry. On a PC that has BOTH a per-user and a
  ; per-machine TechDesk it picks per-machine, which points SHELL_CONTEXT at
  ; HKLM, and electron-builder then goes looking for the all-users copy's
  ; uninstaller and runs it: the one that stops on "Continue uninstalling
  ; now?" and never comes back. Measured, with the old version of this file:
  ;
  ;   t=10s run=2 pf=yes pu=no win=[TechDesk Uninstall]   ... to t=400s
  ;
  ; The two paths also disagreed with each other, which is its own bug: the
  ; same installer installed per-user from the wizard and per-machine from
  ; the command line, on the same PC.
  ;
  ; So it is settled here instead. customInit is expanded immediately after
  ; initMultiUser inside .onInit -- late enough to overrule it, early enough
  ; that everything downstream, SHELL_CONTEXT and $INSTDIR included, is built
  ; from the answer. From 4.16.1 on there is only one kind of install.
  ;
  ; Setting the mode is not enough on its own. electron-builder's install
  ; section re-decides it before anything else runs:
  ;
  ;     ${if} $hasPerMachineInstallation == "1"
  ;     ${andIf} ${Silent}
  ;       ...
  ;       !insertmacro setInstallModePerAllUsers
  ;
  ; -- on the reasoning that a silent upgrade OF a per-machine install needs
  ; to stay per-machine, or writing to Program Files will fail. Sound in
  ; general, wrong for us: we are not upgrading that copy, we are replacing
  ; it with a per-user one and clearing it away. With the mode set but the
  ; flag left standing, the probe read:
  ;
  ;     1-afterInit     mode=[CurrentUser] instdir=[...\Local\Programs\techdesk]
  ;     2-sectionStart  mode=[all]         instdir=[C:\Program Files\TechDesk]
  ;
  ; So clear the flag the decision is made from, not just the decision. The
  ; per-machine copy is still dealt with -- customCheckAppRunning removes it
  ; where it can and customInstall names it where it cannot -- but it no
  ; longer drags the new install into Program Files behind it.
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"
  !insertmacro setInstallModePerUser

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

  ; The all-users copy we could not remove, named rather than left as a
  ; mystery. We only get here if one is still registered under HKLM, which
  ; means this installer was not running as administrator and could not touch
  ; it (see customCheckAppRunning). Saying nothing would leave a shop with two
  ; identical icons, two Add/Remove entries, and no way to tell which is
  ; which.
  ;
  ; /SD IDOK, without exception. A box with no silent default is the whole bug
  ; this release exists to fix, and reintroducing it here -- in the installer
  ; that is meant to end it -- would hang the next update exactly as before.
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  StrCmp $0 "" td_no_machine_copy
    MessageBox MB_OK|MB_ICONINFORMATION \
      "TechDesk is also installed on this PC for all users, in $0.$\r$\n$\r$\nThat is a second copy. It is why you may see two TechDesk icons and two TechDesk entries in Add or remove programs. It updates on its own and will not go away by itself.$\r$\n$\r$\nTo clear it: open Add or remove programs, find the other TechDesk, and uninstall it. You will need an administrator to do that, and it is safe -- both copies use the same sales, repairs and stock, and uninstalling does not delete any of it.$\r$\n$\r$\nThe copy just installed is ready to use either way." \
      /SD IDOK
  td_no_machine_copy:
!macroend
