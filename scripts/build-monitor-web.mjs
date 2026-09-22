// Monitor, on the web, published alongside the main web app.
//
// Monitor was Android-only: an APK, side-loaded, on the owner's phone. That
// is a high bar for "let me see how the shop is doing" -- and it is already a
// plain web app underneath, so the only thing keeping it off the web was that
// nothing built it for the web.
//
// It goes out INSIDE the web app's build, at /monitor/, rather than as a
// second site. One deploy, one domain, nothing new to set up: the owner opens
// techdesk-one.vercel.app/monitor and adds it to their home screen. Its own
// manifest and icons are in apps/monitor/public, so what they get is Monitor,
// not a second copy of TechDesk.
//
// apps/monitor is deliberately NOT a workspace -- it has its own Capacitor
// version line and its own release tag -- so its dependencies are installed
// here rather than by the root `npm ci`.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const monitor = join(root, "apps", "monitor");
const from = join(monitor, "dist");
const into = join(root, "apps", "web", "dist", "monitor");

function run(cmd, args, cwd) {
  console.log(`  ${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

if (!existsSync(join(monitor, "node_modules"))) {
  // `npm ci` needs the lockfile to match; `npm install` is what the Android
  // workflow uses and what works from a clean checkout here too.
  run(npm, ["install"], monitor);
}

run(npm, ["run", "build"], monitor);

if (!existsSync(join(from, "index.html"))) {
  console.error("Monitor built nothing at apps/monitor/dist/index.html");
  process.exit(1);
}

// The web app's build has to exist first: this goes inside it, and a stale
// copy from a previous run would be published as if it were current.
if (!existsSync(join(root, "apps", "web", "dist", "index.html"))) {
  console.error("Build the web app first -- apps/web/dist/index.html is not there.");
  process.exit(1);
}

rmSync(into, { recursive: true, force: true });
mkdirSync(into, { recursive: true });
cpSync(from, into, { recursive: true });

console.log(`Monitor published into the web build at /monitor/`);
