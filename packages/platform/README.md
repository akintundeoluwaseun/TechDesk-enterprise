# @techdesk/platform

How a file reaches a person, in each shell TechDesk runs in.

This is the package that is *allowed* to know about windows and documents.
`@techdesk/core` is not — if a test in core ever needs a browser, something
belonged in here instead.

## The contract

One interface, in `src/types.js`, and three implementations:

| | save | share | open (print) |
|---|---|---|---|
| **browser** | anchor download | download — no real share sheet | new window, download if blocked |
| **electron** | same as browser | same | same |
| **capacitor** | write to `Documents/TechDesk` | share sheet | share sheet |

Saving saves. It never opens a chooser the shop has to answer before anything
is kept — tapping "save" and being asked which app to send it to is not
saving, and that was a real bug: the receipt ended up nowhere.

## Why Capacitor is registered rather than detected

`platform()` picks browser or electron by itself. It will not pick Capacitor,
because importing the Capacitor adapter means importing `@capacitor/filesystem`,
and that would make it a dependency of the desktop build.

The old answer to this was for each edition to ship its own stub of
`nativeSave.js`. One source can't do that, so the mobile entry point registers
its adapter instead — the same shape as the way the app binds core:

```js
import { setPlatform } from "@techdesk/platform";
import { capacitorAdapter } from "@techdesk/platform/capacitor";
setPlatform(capacitorAdapter);
```

Verified: the desktop bundle contains no `@capacitor/*` code at all. The only
occurrences of the word are `window.Capacitor` in shell detection and the name
in an error message.

Running under Capacitor with nothing registered **throws**. It does not fall
back to the browser adapter, because on Android that adapter's anchor click
does nothing whatsoever — the shop taps save and gets silence. Loud beats
quiet and wrong.

## What is not in here

Policy. Whether to toast, what to say when a save fails, whether a cancelled
share counts as an error — that is the app's, in `saveFile.js`. This package
answers "where does the file go", once per shell.

## Running the tests

    npm test -w @techdesk/platform
