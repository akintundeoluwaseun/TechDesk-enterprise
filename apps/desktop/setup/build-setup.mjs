#!/usr/bin/env node
// Assembles the Windows installer.
//
// Up to 4.16.2 this was electron-builder's job: its NSIS target produced both
// the installer and the latest.yml that installed copies read to discover an
// update. The installer is now a WPF application, so that second half has to
// be done here as well -- and it is the half with teeth. If latest.yml is
// wrong or missing, every TechDesk already out there quietly stops updating,
// and nothing visible breaks to tell anyone.
//
// Steps:
//   1. tar the built app (electron-builder's win-unpacked)
//   2. compress it with Brotli
//   3. publish the WPF installer, self-contained, as one .exe
//   4. append the payload to that .exe, with a footer saying where it starts
//   5. write latest.yml, so electron-updater can find and verify the result
//
// Why Brotli and not LZMA, which NSIS used and which compresses better: the
// installer must unpack itself using only what the .NET runtime already
// carries. Brotli and tar are both in the base class library. An LZMA payload
// would mean shipping a native decoder inside the installer, which is both
// more to go wrong and the exact shape antivirus dislikes.
//
// Measured on the real 265 MB payload, for the record:
//   gzip -9      108.8 MB   2.44:1    18s
//   brotli q9     88.5 MB   3.00:1   190s
//   brotli q10    81.6 MB   3.25:1   572s   <- the default
//   NSIS LZMA     ~75 MB    3.5:1    (what it used to be)
// q11 costs roughly another ten minutes for about three more megabytes, which
// is not a trade worth making on every release.

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, stat, rm, copyFile } from "node:fs/promises";
import { createBrotliCompress, constants as zlib } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args.set(a.slice(2), process.argv[i + 1]?.startsWith("--") ? true : process.argv[++i]);
}

const unpacked = resolve(args.get("unpacked") ?? join(desktop, "release", "win-unpacked"));
const outDir = resolve(args.get("out") ?? join(desktop, "release"));
const quality = Number(args.get("quality") ?? process.env.TECHDESK_SETUP_QUALITY ?? 10);
const work = join(outDir, ".setup-work");

const version = args.get("version")
  ?? JSON.parse(await readFile(join(desktop, "package.json"), "utf8")).version;

// Hyphens, not spaces. This is the name the asset already has on the releases
// repo, because electron-builder renamed it that way on upload, and it is the
// name written into every latest.yml published so far. An installed TechDesk
// builds its download URL from that file, so changing the shape of this name
// breaks updating for everyone already running the app.
const exeName = `TechDesk-Setup-${version}.exe`;

const say = (m) => console.log(`[setup] ${m}`);
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

async function run(cmd, cmdArgs, cwd) {
  say(`${cmd} ${cmdArgs.join(" ")}`);
  await new Promise((ok, fail) => {
    const p = spawn(cmd, cmdArgs, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    p.on("error", fail);
    p.on("close", (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} exited with ${code}`)));
  });
}

await stat(join(unpacked, "TechDesk.exe")).catch(() => {
  throw new Error(
    `No TechDesk.exe in ${unpacked}. Run electron-builder with the "dir" target first.`);
});

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(outDir, { recursive: true });

// ---------------------------------------------------------------- 1. tar
// tar is used rather than zip because the payload is one stream to be read
// start to finish, never seeked into: a zip's central directory would be dead
// weight. bsdtar ships with Windows 10 and later, so this works on the runner.
const tarPath = join(work, "payload.tar");
await run("tar", ["-cf", tarPath, "-C", unpacked, "."]);
const tarSize = (await stat(tarPath)).size;
say(`payload: ${mb(tarSize)} uncompressed`);

// ------------------------------------------------------------- 2. compress
const brPath = join(work, "payload.tar.br");
const started = Date.now();
await pipeline(
  createReadStream(tarPath),
  createBrotliCompress({
    params: {
      [zlib.BROTLI_PARAM_QUALITY]: quality,
      [zlib.BROTLI_PARAM_LGWIN]: 24,
      [zlib.BROTLI_PARAM_SIZE_HINT]: tarSize,
    },
  }),
  createWriteStream(brPath),
);
const brSize = (await stat(brPath)).size;
say(`compressed to ${mb(brSize)} at quality ${quality} in ${Math.round((Date.now() - started) / 1000)}s`);

// -------------------------------------------------------------- 3. publish
const publishDir = join(work, "publish");
await run("dotnet", [
  "publish", join(here, "TechDesk.Setup", "TechDesk.Setup.csproj"),
  "-c", "Release",
  "-r", "win-x64",
  "--self-contained", "true",
  "-p:PublishSingleFile=true",
  "-p:IncludeNativeLibrariesForSelfExtract=true",
  "-p:EnableCompressionInSingleFile=true",
  `-p:Version=${version}`,
  "-o", publishDir,
  "--nologo",
]);

const stub = join(publishDir, "TechDeskSetup.exe");
const stubSize = (await stat(stub)).size;
say(`installer program: ${mb(stubSize)}`);

// ------------------------------------------------- 4. append the payload
// The app is appended to the end of the .exe rather than embedded as a .NET
// resource. A resource lives inside the main assembly, and the single-file
// bundler compresses that assembly on publish -- so an 81 MB
// already-compressed payload would be Brotli-compressed a second time, for
// no gain and several minutes. Appended bytes are left alone.
//
// The footer goes last so it can be found by reading backwards from the end.
// If this installer is ever code-signed, signtool appends its certificate
// table after all of this; Payload.cs handles that by also looking just
// before the certificate table, so signing later does not break it.
const exePath = join(outDir, exeName);
await copyFile(stub, exePath);

const footer = Buffer.alloc(32);
Buffer.from("TECHDESK-PAYLOAD", "ascii").copy(footer, 0);
footer.writeBigInt64LE(BigInt(brSize), 16);
footer.writeBigInt64LE(BigInt(tarSize), 24);

await new Promise((ok, fail) => {
  const out = createWriteStream(exePath, { flags: "a" });
  out.on("error", fail);
  out.on("finish", ok);
  const payload = createReadStream(brPath);
  payload.on("error", fail);
  payload.on("end", () => out.end(footer));
  payload.pipe(out, { end: false });
});

const finalSize = (await stat(exePath)).size;
say(`${exeName}: ${mb(finalSize)}`);

// ------------------------------------------------------- 5. latest.yml
// What an installed TechDesk reads to learn there is a new version, and to
// check that what it downloaded is the file this build produced. The sha512
// is base64 of the raw digest, not hex -- electron-updater compares it
// verbatim, so hex here means every update is rejected as corrupt.
const digest = await new Promise((ok, fail) => {
  const h = createHash("sha512");
  const s = createReadStream(exePath);
  s.on("error", fail);
  s.on("data", (c) => h.update(c));
  s.on("end", () => ok(h.digest("base64")));
});

const latest = [
  `version: ${version}`,
  "files:",
  `  - url: ${exeName}`,
  `    sha512: ${digest}`,
  `    size: ${finalSize}`,
  `path: ${exeName}`,
  `sha512: ${digest}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
].join("\n");

await writeFile(join(outDir, "latest.yml"), latest, "utf8");
say("latest.yml written");

await rm(work, { recursive: true, force: true });
say("done");
