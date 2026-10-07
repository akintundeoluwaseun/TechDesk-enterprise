; The slideshow that plays while TechDesk is copied onto the PC.
;
; WHY. The install page is otherwise a progress bar over a scrolling list of
; file names: the least interesting thing a shop will ever see us do, during
; the one minute they are watching us with nothing else to look at. So the log
; is hidden and the space it had is given to pictures of what they downloaded.
;
; WHY AN AVI, OF ALL THINGS. The obvious build is a bitmap and a timer that
; swaps it. It does not work, and it fails in the most convincing way: the
; page appears, the first slide draws, the timer is created without complaint
; -- and the picture never changes, because NSIS cannot execute a line of
; script while an install section is running, and a timer callback is a line
; of script. This was built that way first and watched sit on slide one for a
; whole install.
;
; Windows' own animation control asks nobody's permission. SysAnimate32 plays
; a silent AVI on its own thread, so the slides advance while NSIS gets on
; with the install and never calls back into the script at all. The control
; reads only uncompressed or RLE AVI, which is why build/art/make_avi.py
; writes the plainest form there is.
;
; The control centres its frames and will not scale them, so a PC at 125%
; display scaling would show the dialog's grey around the edges. A stretched
; still of the same artwork sits behind it, and the edges are dark instead.
;
; NOTHING HERE MAY BREAK AN INSTALL. Every step checks what it got and gives
; up quietly: no dialog, no control, no file, and the page simply looks the
; way it always did, log and all. A dull installer beats one that cannot
; install.

!include "WinMessages.nsh"

!define TD_SS_BITMAP          0x0000000E
!define TD_SS_REALSIZECONTROL 0x00000040
!define TD_WS_CHILD           0x40000000
!define TD_WS_VISIBLE         0x10000000
!define TD_IMAGE_BITMAP       0
!define TD_LR_LOADFROMFILE    0x00000010

; Animation control: centre the frames and start as soon as it is opened.
;
; Not ACS_TRANSPARENT. It sounds harmless and it is not: the control then
; blends each frame against the PARENT's background colour, which is the
; dialog's grey, and every anti-aliased edge in the artwork -- every headline
; -- came out speckled with it. The frames are opaque and fill the control;
; there is nothing to see through.
!define TD_ACS_CENTER    0x0001
!define TD_ACS_AUTOPLAY  0x0004
!define TD_ACM_OPENA     0x0464   ; WM_USER+100
!define TD_ACM_OPENW     0x0467   ; WM_USER+103

Var tdAnim
Var tdBackdrop
Var tdBackdropBmp

; Runs once, when the install page appears.
Function tdSlideshowShow
  StrCpy $tdAnim 0
  StrCpy $tdBackdrop 0
  StrCpy $tdBackdropBmp 0

  ; The page's own dialog, and the log inside it. 1016 is MUI's list on the
  ; instfiles page; if either lookup fails we are on a dialog we do not
  ; understand and should leave it alone.
  FindWindow $R0 "#32770" "" $HWNDPARENT
  StrCmp $R0 0 done
  GetDlgItem $R1 $R0 1016
  StrCmp $R1 0 done

  ; Where the log sits, in the dialog's own coordinates. GetWindowRect answers
  ; in screen coordinates, so it has to be mapped before it can place a child
  ; -- skipping that is how a control ends up off the page entirely.
  System::Call '*(i,i,i,i) i .R2'
  StrCmp $R2 0 done
  System::Call 'user32::GetWindowRect(i $R1, i $R2)'
  System::Call 'user32::MapWindowPoints(i 0, i $R0, i $R2, i 2)'
  System::Call '*$R2(i .R3, i .R4, i .R5, i .R6)'
  System::Free $R2

  IntOp $R5 $R5 - $R3   ; width
  IntOp $R6 $R6 - $R4   ; height
  IntCmp $R5 80 done done 0
  IntCmp $R6 60 done done 0

  ; The log goes; the progress bar underneath it stays, because a shop still
  ; needs to see that something is happening.
  ShowWindow $R1 ${SW_HIDE}

  ; "Show details" goes for good. Hiding it is not enough: MUI shows it again
  ; the moment the install finishes, and it lands on top of the artwork -- a
  ; stray grey button over the last slide, which is the frame a shop looks at
  ; longest. There is nothing behind it to show any more anyway.
  GetDlgItem $R8 $R0 1027
  StrCmp $R8 0 +2
    System::Call 'user32::DestroyWindow(i $R8)'

  ; The still, stretched over the whole area, so nothing grey shows through.
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", \
    i ${TD_WS_CHILD}|${TD_WS_VISIBLE}|${TD_SS_BITMAP}|${TD_SS_REALSIZECONTROL}, \
    i $R3, i $R4, i $R5, i $R6, i $R0, i 0, i 0, i 0) i .R7'
  StrCmp $R7 0 no_backdrop
    StrCpy $tdBackdrop $R7
    System::Call 'user32::LoadImage(i 0, t "$PLUGINSDIR\td-slidebg.bmp", \
      i ${TD_IMAGE_BITMAP}, i 0, i 0, i ${TD_LR_LOADFROMFILE}) i .R8'
    StrCmp $R8 0 no_backdrop
      StrCpy $tdBackdropBmp $R8
      SendMessage $R7 ${STM_SETIMAGE} ${TD_IMAGE_BITMAP} $R8
  no_backdrop:

  ; The slideshow itself, over the top.
  System::Call 'user32::CreateWindowEx(i 0, t "SysAnimate32", t "", \
    i ${TD_WS_CHILD}|${TD_WS_VISIBLE}|${TD_ACS_CENTER}|${TD_ACS_AUTOPLAY}, \
    i $R3, i $R4, i $R5, i $R6, i $R0, i 0, i 0, i 0) i .R9'
  StrCmp $R9 0 no_anim

  StrCpy $tdAnim $R9
  ; ACM_OPEN takes the path in the build's own character width. Sending the
  ; wrong one of these opens nothing and reports nothing.
  !ifdef NSIS_UNICODE
    SendMessage $R9 ${TD_ACM_OPENW} 0 "STR:$PLUGINSDIR\td-slides.avi"
  !else
    SendMessage $R9 ${TD_ACM_OPENA} 0 "STR:$PLUGINSDIR\td-slides.avi"
  !endif
  Goto done

  no_anim:
    ; No animation and no backdrop either: put the log back rather than show
    ; a shop a blank rectangle for the length of an install.
    StrCmp $tdBackdrop 0 0 done
      ShowWindow $R1 ${SW_SHOW}

  done:
FunctionEnd

; Hands back the still's bitmap. The animation control owns its own frames and
; frees them when the dialog goes.
Function tdSlideshowStop
  StrCmp $tdBackdropBmp 0 +2
    System::Call 'gdi32::DeleteObject(i $tdBackdropBmp)'
  StrCpy $tdBackdropBmp 0
FunctionEnd
