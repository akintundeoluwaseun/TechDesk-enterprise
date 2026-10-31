# TechDesk Setup

The Windows installer. A WPF application, built from `TechDesk.Setup/`, which
carries the app inside itself and puts it on the PC.

Up to 4.16.2 this was electron-builder's NSIS target. NSIS cannot run a line
of script while files are being copied, which is why the old installer played
a pre-rendered video: a timer never fires, so nothing can be drawn in response
to progress. WPF has no such limit, which is the whole reason for the change.

## Building it

    cd apps/desktop
    npm run setup:win          # app folder, then installer

or the two halves separately:

    npx electron-builder --win dir --publish never
    node setup/build-setup.mjs

`build-setup.mjs` tars the unpacked app, compresses it with Brotli, publishes
the WPF program as one self-contained `.exe`, appends the payload to it, and
writes `latest.yml`. Compression quality defaults to 10 and can be lowered for
a faster loop:

    node setup/build-setup.mjs --quality 4

Needs the .NET 8 SDK. On Linux it builds too, as long as the SDK is
Microsoft's own build rather than Ubuntu's -- Ubuntu's `dotnet-sdk-8.0`
package omits `Microsoft.NET.Sdk.WindowsDesktop`, so WPF projects cannot be
loaded at all.

## What it costs, measured

| | 4.16.2, NSIS | this |
|---|---|---|
| installer download | 76.3 MB | ~145 MB |
| install folder | 266 MB | 329 MB |
| update download | a few MB, differential | the whole installer |

The installer program alone is 62.9 MB before the app is added, and that is a
floor, not a starting point: the .NET runtime and WPF ship inside it because a
shop's PC has no reason to have either, and WPF cannot be trimmed -- the SDK
refuses outright with NETSDK1168. `InvariantGlobalization` was tried and
measured at exactly the same 62.9 MB, so it buys nothing and is not used.

The install folder grows by the 63 MB uninstaller, which is the same program
with the payload truncated off. A .NET uninstaller cannot be smaller than its
runtime. It is kept as a real program rather than, say, a flag on the app,
so that uninstalling still works when the app itself is broken.

**Updates are now full downloads.** electron-builder's NSIS target also
produced a `.blockmap`, which let electron-updater fetch only the changed
parts of a new installer. That does not survive the change: the payload is one
Brotli stream, so a byte changing early in the app moves everything after it
and there is nothing for a block map to match. For shops on metered mobile
data this is the most expensive part of the trade, and it is the one thing
here that cannot be engineered away without going back to shipping an NSIS
artifact for updates.

## The parts

| file | what it is for |
|---|---|
| `Program.cs` | entry point, and the gate that keeps WPF out of the silent path |
| `Engine/Target.cs` | where TechDesk lives on a PC: a contract with the NSIS installer, not a preference |
| `Engine/CommandLine.cs` | the switches electron-updater passes: `/S`, `--updated`, `--force-run`, `/D=` |
| `Engine/Payload.cs` | finding and unpacking the app appended to this `.exe` |
| `Engine/Installer.cs` | unpack beside, swap, roll back on failure |
| `Engine/Uninstaller.cs` | removal, and the question about the shop's records |
| `MainWindow.xaml` | the four pages and their animation |

## Two things that must not be changed casually

**`asInvoker` in `app.manifest`.** TechDesk installs into the user's own
`%LOCALAPPDATA%` and `HKCU` and needs no administrator. Asking for one would
bring back the per-machine copy that put two TechDesk entries in Add/Remove
Programs -- the fault 4.16.1 and 4.16.2 were spent undoing -- and would hang
every unattended update behind a UAC prompt with nobody there to answer it.

**The GUID in `Engine/Target.cs`.** `8c82b694-e53c-5c71-a9ac-69978103636f` is
uuid-v5 of the appId, and it is the identity of the install as far as Windows
is concerned. Write the uninstall entry under a different key and Windows sees
a second product rather than an upgrade, and the shop gets two rows again.

## What has been verified, and what has not

Verified by running the real `.exe` under Wine, in a clean prefix:

- a silent install: exits 0, unpacks all 74 payload files byte-for-byte
  identical to the source, writes both shortcuts and one registry entry under
  the right GUID, leaves no staging folders behind
- an update on top of it (`--updated /S`, which is exactly what
  electron-updater runs): the shop's records in `%APPDATA%\TechDesk` survive,
  and a stale file planted in the install folder is gone afterwards, so the
  swap really does replace rather than merge
- a silent uninstall: app and shortcuts gone, registry key gone, **records
  kept**, and only the running uninstaller left behind, queued for deletion on
  the next restart
- `latest.yml`: sha512 checked independently with openssl, and identical in
  shape to the file electron-builder published for 4.16.2

**Not verified: the window itself has never been drawn.** WPF will not start
under Wine 9 in this container -- it dies inside its own font shaper
(`TypefaceMap.MapUnresolvedCharacters`) because the prefix has no Windows
fonts, and installing substitutes and registering the faces did not satisfy
it. The XAML does compile, so there are no markup errors and every storyboard
target resolves, but no screenshot of this installer exists and nobody has
watched the animation run. **It needs one pass on a real Windows PC before it
ships to anyone.**
