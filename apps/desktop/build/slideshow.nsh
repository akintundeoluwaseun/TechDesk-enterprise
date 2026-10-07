; The installer's own skin: one picture, edge to edge, and a strip of progress.
;
; WHAT THIS REPLACES. MUI draws a wizard: a white header band with a title and
; a small bitmap, then the page inset inside a margin, then a button bar. Four
; different surfaces and three borders around whatever you put in it. The
; artwork ended up as a stamp in the middle of a form.
;
; So the header is hidden, the page dialog is moved up over it and stretched
; to both edges, and what is left is a banner across the top with the progress
; underneath -- the shape of every installer anyone enjoys looking at.
;
; NOTHING IS HARD-CODED. Dialog units are not pixels, and they are not the
; same number of pixels on a PC at 125% display scaling, so a layout written
; as constants is right on the machine it was written on and wrong everywhere
; else. The measurements are taken at run time, and the furniture is found by
; WHERE IT IS rather than by control id: anything above the page is the header
; and gets hidden, anything below it is the button bar and is left alone. That
; also means we do not have to be right about which id MUI gave what.
;
; WHY AN AVI. NSIS cannot execute a line of script while an install section is
; running, so a timer that swaps bitmaps never fires -- the slideshow sat on
; frame one for a whole install. Windows' animation control plays an AVI on
; its own thread and asks nobody.
;
; NOTHING HERE MAY BREAK AN INSTALL. Every step checks what it got and gives
; up quietly: no dialog, no control, no file, and the page is left exactly as
; MUI drew it, header and log and all. A plain installer beats one that cannot
; install.

!include "WinMessages.nsh"

!define TD_SS_BITMAP          0x0000000E
!define TD_SS_REALSIZECONTROL 0x00000040
!define TD_WS_CHILD           0x40000000
!define TD_WS_VISIBLE         0x10000000
!define TD_IMAGE_BITMAP       0
!define TD_LR_LOADFROMFILE    0x00000010
!define TD_SWP_NOZORDER       0x0004
!define TD_SWP_NOACTIVATE     0x0010

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

; How tall the strip under the banner is, in pixels at 100% scaling. It holds
; the line of text and the progress bar, and nothing else.
!define TD_STRIP_H 44

; The size of the frames in slides.avi, which build/art/scenes.py sets as
; W, H. These two have to agree with it: the control is built to this size so
; that it has no margin of its own to paint.
!define TD_ANIM_W 500
!define TD_ANIM_H 228

; And the welcome picture, which build/art/make-installer-art.py sets as
; WELCOME. Same reason: it is placed at its own size, not stretched.
!define TD_WELCOME_W 500
!define TD_WELCOME_H 280

Var tdAnim
Var tdBmp          ; whatever bitmap we loaded, freed at the end
Var tdPageW        ; the page dialog, after it has been stretched
Var tdPageH

; ---------------------------------------------------------------------------
; Takes the page dialog edge to edge and returns its new size in $tdPageW/H.
; $R0 comes back holding the page dialog, or 0 if we should leave well alone.
Function tdFullBleed
  StrCpy $tdPageW 0
  StrCpy $tdPageH 0

  FindWindow $R0 "#32770" "" $HWNDPARENT
  StrCmp $R0 0 give_up

  System::Call '*(i,i,i,i) i .R1'
  StrCmp $R1 0 give_up

  ; The wizard's own client area: how wide we are allowed to be.
  System::Call 'user32::GetClientRect(i $HWNDPARENT, i $R1)'
  System::Call '*$R1(i, i, i .R2, i .R3)'      ; R2 = width, R3 = height

  ; Where MUI put the page, before we move it. Everything above this line is
  ; header; everything below it is the button bar.
  System::Call 'user32::GetWindowRect(i $R0, i $R1)'
  System::Call 'user32::MapWindowPoints(i 0, i $HWNDPARENT, i $R1, i 2)'
  System::Call '*$R1(i .R4, i .R5, i, i .R6)'  ; R5 = page top, R6 = page bottom

  ; A window too narrow to be the wizard. Better to show MUI's own page than
  ; to start moving things around on something we do not recognise. There is
  ; deliberately no check on the page's top edge: the welcome page legitimately
  ; starts at zero, having no header, and a guard against that bailed out on
  ; it every time and left MUI's own sidebar showing.
  IntCmp $R2 200 give_up give_up 0

  ; Walk the wizard's own children. Anything that ends above the page is the
  ; header and goes; the first thing that starts below the page tells us where
  ; the button bar begins, which is as far down as we may grow.
  StrCpy $R7 $R3        ; lowest known top of the bottom furniture
  StrCpy $R8 0          ; control id
  next_child:
    System::Call 'user32::GetDlgItem(i $HWNDPARENT, i $R8) i .R9'
    StrCmp $R9 0 after_child
      System::Call 'user32::GetWindowRect(i $R9, i $R1)'
      System::Call 'user32::MapWindowPoints(i 0, i $HWNDPARENT, i $R1, i 2)'
      System::Call '*$R1(i, i .r0, i, i .r1)'  ; $0 = top, $1 = bottom

      ; Ends at or above the page's top edge: header furniture.
      IntCmp $1 $R5 0 0 not_header
        ShowWindow $R9 ${SW_HIDE}
        Goto after_child
      not_header:

      ; Starts at or below the page's bottom edge: the button bar. Keep it,
      ; but remember how high up it reaches -- the SMALLEST top wins.
      IntCmp $0 $R6 0 not_footer 0
        IntCmp $0 $R7 after_child 0 after_child
          StrCpy $R7 $0
      not_footer:
  after_child:
    IntOp $R8 $R8 + 1
    IntCmp $R8 1300 0 next_child next_child

  System::Free $R1

  ; A little air above the buttons, and never taller than the window.
  ;
  ; IntCmp jumps on equal, then less, then greater, and getting that order
  ; the wrong way round here clamped the page to the FULL window height
  ; whenever it was correctly shorter -- so the page grew over the button bar
  ; and swallowed Install and Cancel whole.
  IntOp $R7 $R7 - 6
  IntCmp $R7 $R3 fits fits 0
    StrCpy $R7 $R3
  fits:
  IntCmp $R7 120 give_up give_up 0

  System::Call 'user32::SetWindowPos(i $R0, i 0, i 0, i 0, i $R2, i $R7, \
    i ${TD_SWP_NOZORDER}|${TD_SWP_NOACTIVATE})'
  StrCpy $tdPageW $R2
  StrCpy $tdPageH $R7
  Return

  give_up:
    StrCpy $R0 0
FunctionEnd

; Stretches one bitmap over a rectangle of the page. Returns the control, or 0.
; $9 must hold the page dialog; the bitmap handle comes back in $8.
Function tdPlaceBitmap
  ; $1..$4 = x, y, w, h   $5 = file name inside $PLUGINSDIR
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", \
    i ${TD_WS_CHILD}|${TD_WS_VISIBLE}|${TD_SS_BITMAP}|${TD_SS_REALSIZECONTROL}, \
    i $1, i $2, i $3, i $4, i $9, i 0, i 0, i 0) i .r7'
  StrCpy $8 0
  StrCmp $7 0 done
  System::Call 'user32::LoadImage(i 0, t "$PLUGINSDIR\$5", \
    i ${TD_IMAGE_BITMAP}, i 0, i 0, i ${TD_LR_LOADFROMFILE}) i .r8'
  StrCmp $8 0 done
  SendMessage $7 ${STM_SETIMAGE} ${TD_IMAGE_BITMAP} $8
  done:
FunctionEnd

; The same, but drawn at the bitmap's own size instead of stretched to the
; control. Takes the same $1..$5 and $9.
Function tdPlaceBitmapExact
  System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", \
    i ${TD_WS_CHILD}|${TD_WS_VISIBLE}|${TD_SS_BITMAP}, \
    i $1, i $2, i $3, i $4, i $9, i 0, i 0, i 0) i .r7'
  StrCpy $8 0
  StrCmp $7 0 done
  System::Call 'user32::LoadImage(i 0, t "$PLUGINSDIR\$5", \
    i ${TD_IMAGE_BITMAP}, i 0, i 0, i ${TD_LR_LOADFROMFILE}) i .r8'
  StrCmp $8 0 done
  SendMessage $7 ${STM_SETIMAGE} ${TD_IMAGE_BITMAP} $8
  done:
FunctionEnd

; ---------------------------------------------------------------------------
; The welcome page: the same banner, standing still, instead of a sidebar and
; three paragraphs of boilerplate nobody reads.
Function tdWelcomeShow
  Call tdFullBleed
  StrCmp $R0 0 done
  StrCpy $R6 $R0

  ; MUI's own welcome furniture -- the sidebar bitmap and the two blocks of
  ; text -- are children of the PAGE, so the sweep above did not touch them.
  StrCpy $R8 0
  hide_next:
    System::Call 'user32::GetDlgItem(i $R6, i $R8) i .R9'
    StrCmp $R9 0 +2
      ShowWindow $R9 ${SW_HIDE}
    IntOp $R8 $R8 + 1
    IntCmp $R8 1300 0 hide_next hide_next

  ; The ground first, stretched to whatever the page is, so the edges are our
  ; blue rather than the dialog's grey.
  StrCpy $9 $R6
  StrCpy $1 0
  StrCpy $2 0
  StrCpy $3 $tdPageW
  StrCpy $4 $tdPageH
  StrCpy $5 "td-slidebg.bmp"
  Call tdPlaceBitmap

  ; Then the picture itself at its own size, centred and NOT stretched.
  ; Stretched, it was resampled from 500 wide to the page's 497 by dropping
  ; whole columns of pixels -- which is invisible on a gradient and chews
  ; visible holes in twelve-pixel text. Three pixels of our own blue around
  ; the edge costs nothing; mangled type costs the whole impression.
  IntOp $1 $tdPageW - ${TD_WELCOME_W}
  IntOp $1 $1 / 2
  IntOp $2 $tdPageH - ${TD_WELCOME_H}
  IntOp $2 $2 / 2
  StrCpy $3 ${TD_WELCOME_W}
  StrCpy $4 ${TD_WELCOME_H}
  StrCpy $5 "td-welcome.bmp"
  Call tdPlaceBitmapExact
  StrCpy $tdBmp $8

  done:
FunctionEnd

; ---------------------------------------------------------------------------
; The install page: the banner across the top, the progress underneath it.
Function tdSlideshowShow
  StrCpy $tdAnim 0

  Call tdFullBleed
  StrCmp $R0 0 done
  StrCpy $R6 $R0

  ; The log goes. "Show details" is destroyed rather than hidden, because MUI
  ; shows it again the moment the install finishes and it lands on top of the
  ; artwork -- a stray grey button over the last frame, which is the one a
  ; shop looks at longest. There is nothing behind it to show any more.
  GetDlgItem $R9 $R6 1016
  StrCmp $R9 0 +2
    ShowWindow $R9 ${SW_HIDE}
  GetDlgItem $R9 $R6 1027
  StrCmp $R9 0 +2
    System::Call 'user32::DestroyWindow(i $R9)'

  ; The branding line along the bottom. It sits in the strip, beside the
  ; progress bar, saying which installer toolkit built this -- which is of
  ; interest to nobody holding the PC. It is kept by the sweep above because
  ; it lives below the page, so it is named here.
  GetDlgItem $R9 $HWNDPARENT 1256
  StrCmp $R9 0 +2
    ShowWindow $R9 ${SW_HIDE}
  GetDlgItem $R9 $HWNDPARENT 1028
  StrCmp $R9 0 +2
    ShowWindow $R9 ${SW_HIDE}

  ; The banner: everything above the strip.
  IntOp $R7 $tdPageH - ${TD_STRIP_H}
  IntCmp $R7 60 done done 0

  StrCpy $9 $R6
  StrCpy $1 0
  StrCpy $2 0
  StrCpy $3 $tdPageW
  StrCpy $4 $R7
  StrCpy $5 "td-slidebg.bmp"
  Call tdPlaceBitmap          ; flat ground, so a scaled display shows our dark
  StrCpy $tdBmp $8

  ; The animation control is made exactly the size of the frames and centred,
  ; rather than stretched across the banner and left to centre them itself.
  ; It paints whatever is left over inside it with the DIALOG's background
  ; brush, so a banner two pixels taller than the artwork drew a two-pixel
  ; white seam along the top edge -- the one thing a full-bleed picture cannot
  ; have. Sized to the frames, there is nothing left over; the still behind it
  ; covers the margin instead, in our own dark.
  IntOp $R3 $tdPageW - ${TD_ANIM_W}
  IntOp $R3 $R3 / 2
  IntOp $R4 $R7 - ${TD_ANIM_H}
  IntOp $R4 $R4 / 2
  System::Call 'user32::CreateWindowEx(i 0, t "SysAnimate32", t "", \
    i ${TD_WS_CHILD}|${TD_WS_VISIBLE}|${TD_ACS_CENTER}|${TD_ACS_AUTOPLAY}, \
    i $R3, i $R4, i ${TD_ANIM_W}, i ${TD_ANIM_H}, i $R6, i 0, i 0, i 0) i .R9'
  StrCmp $R9 0 no_anim
    StrCpy $tdAnim $R9
    ; ACM_OPEN takes the path in the build's own character width. Sending the
    ; wrong one of these opens nothing and reports nothing.
    !ifdef NSIS_UNICODE
      SendMessage $R9 ${TD_ACM_OPENW} 0 "STR:$PLUGINSDIR\td-slides.avi"
    !else
      SendMessage $R9 ${TD_ACM_OPENA} 0 "STR:$PLUGINSDIR\td-slides.avi"
    !endif
  no_anim:

  ; The strip: the line of text that says what is happening, then the bar.
  ; Both are MUI's own controls, moved rather than replaced, so they keep
  ; working exactly as they did.
  IntOp $R5 $tdPageH - ${TD_STRIP_H}
  IntOp $R4 $tdPageW - 32

  GetDlgItem $R9 $R6 1006                      ; the current-step text
  StrCmp $R9 0 +4
    IntOp $R3 $R5 + 6
    System::Call 'user32::SetWindowPos(i $R9, i 0, i 16, i $R3, i $R4, i 14, \
      i ${TD_SWP_NOZORDER}|${TD_SWP_NOACTIVATE})'

  GetDlgItem $R9 $R6 1004                      ; the progress bar
  StrCmp $R9 0 +4
    IntOp $R3 $R5 + 24
    System::Call 'user32::SetWindowPos(i $R9, i 0, i 16, i $R3, i $R4, i 12, \
      i ${TD_SWP_NOZORDER}|${TD_SWP_NOACTIVATE})'

  done:
FunctionEnd

; Hands back whatever bitmap we loaded. The animation control owns its own
; frames and frees them when the dialog goes.
Function tdSlideshowStop
  StrCmp $tdBmp 0 +2
    System::Call 'gdi32::DeleteObject(i $tdBmp)'
  StrCpy $tdBmp 0
FunctionEnd
