# TechDesk Monitor

The owner's read-only view of every branch, on their phone. An Enterprise
feature, which is why it lives in this repo, but its own app: its own package
id (`com.techdesk.monitor`), its own version, and its own release tag.

## Running it

    npm install
    npm run dev

It talks to the live backend. To see it with data but without a real branch,
point the `hq-data` calls at fixtures in your browser's devtools, or connect a
desktop and let it sync.

## How it signs in

HQ types their registered number, a code is texted to it, and the app gets a
session token. Not Supabase Auth -- see `supabase/functions/README.md` in the
website repo for why.

The token is the only credential on the phone. It is kept through Capacitor
Preferences, which is real app storage on Android; losing it costs a sign-in,
not data.

**`session.js` boxes the Capacitor plugin rather than returning it.** Plugins
are Proxy objects, and returning one from an `async` function makes JavaScript
treat it as a thenable and call `.then()` on it -- which the proxy answers as a
plugin method that does not exist, so the await never settles and the app hangs
on its loading screen. That is not obvious from the outside, hence the comment
in the file and this note.

## Read only

Nothing in this app writes. There is no endpoint it could write through: the
functions it calls answer questions and nothing else.

## Building the APK

Push a `monitor-v*` tag, or run the **Build TechDesk Monitor for Android**
workflow by hand. Without the four `ANDROID_*` secrets it produces a
debug-signed APK, which side-loads but cannot be upgraded in place by a later
signed build.
