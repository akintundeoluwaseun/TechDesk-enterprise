; Custom NSIS hook, wired in via build.nsis.include in package.json.
; electron-builder calls this macro during the uninstaller, before any
; files are removed.
;
; Uninstalling does NOT delete the app's data folder (userData) by
; default -- this app never sets deleteAppDataOnUninstall, so sales,
; repairs, inventory, and customers are safe either way. This dialog
; exists because most users don't know that, and because it's cheap
; insurance before someone wipes a drive, moves to a new PC, or manually
; deletes the data folder afterward. Answering "No" aborts the
; uninstall so they can go back and take a backup (Settings -> Device ->
; Download backup) first; "Yes" continues normally.
!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Have you backed up your TechDesk data?$\r$\n$\r$\nUninstalling will NOT delete your saved sales, repairs, inventory, or customer data -- it stays on this PC. But if you're about to wipe this device or want a safety copy, back up first via Settings -> Device -> Download backup.$\r$\n$\r$\nContinue uninstalling now?" \
    IDYES +2
  Abort
!macroend
