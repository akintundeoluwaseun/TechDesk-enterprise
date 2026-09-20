# @techdesk/ui

The shop, as a person sees it. One renderer; the shells differ, the screens
do not.

    apps/desktop   Electron          -> a native side, a downloads folder
    apps/mobile    Capacitor         -> Documents/TechDesk, a share sheet
    (web)          a browser tab     -> an anchor download

Each shell is an `index.html`, a `main.jsx`, and a build config. Everything
else — every page, every component, the data layer binding, the tier — is
here, once. A sale that behaved differently on a phone than on a desktop
would be a bug, not a feature, so there is one suite and both shells inherit
it.

## What a shell has to do

Two things, before anything renders:

```js
import { setPlatform } from "@techdesk/platform";
import { capacitorAdapter } from "@techdesk/platform/capacitor";
setPlatform(capacitorAdapter);   // mobile only; the others are detected

import "@techdesk/ui/bindCore";  // every shell
```

`bindCoreIsWired.test.js` checks both entry points do it. A shell that forgets
reads an empty in-memory store and shows a shop with no settings, throwing
nothing at all — which is how receipts once shipped with the logo missing.

## Head office on a phone

There is no Electron bridge in a WebView, and the HQ client used to ask
`IS_DESKTOP_APP` and answer "no" by refusing. That is why the Android app had
no head office: not a missing feature, a feature that said `not_desktop` to
everyone who tried.

`@techdesk/core` picks a transport now — the native host when there is one,
the in-page client otherwise. The in-page one is the Web App's, already in
production, with the token fix in it. So the phone app inherits head office
rather than having it ported.

Whether a shop **may** use it is a different question, asked of the tier here
and of `businesses.plan` on the server. Only the second one decides anything.
