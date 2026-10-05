// Every TechDesk icon, from one mark: brand/techdesk.svg (the website's logo).
//
//   node brand/make-icons.mjs        (needs Playwright's Chromium)
//
// Writes the web app's favicon and home-screen icons, the desktop app's
// icon, and the Android app's launcher and splash artwork. The PNGs are
// checked in; this is how they were made, so the next change to the mark is
// one edit and one command.
//
// The rules the platforms impose:
//   iOS home-screen icons must be full-bleed and opaque -- iOS rounds the
//   corners itself and shows black wherever there's transparency.
//   Android's maskable / adaptive icons are cropped to the launcher's shape,
//   so the mark sits inside the middle ~60%.
//   The desktop icon keeps its own rounded tile with a little margin, the
//   way macOS and Windows icons are drawn.
//
// Monitor has its own icon (apps/monitor/assets), so the two apps can be told
// apart on one home screen.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PW = process.env.PLAYWRIGHT || "/opt/node22/lib/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);

const master = readFileSync(join(ROOT, "brand/techdesk.svg"), "utf8");
const GRAD = `<defs><linearGradient id="td-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs>`;
const mark = master.match(/<g transform[\s\S]*?<\/g>/)[0];

// The mark on a 64x64 canvas. tile: "round" | "full" | "none"; scale: how big
// the mark is (1 = as on the website); pad: margin around a round tile.
function svg({ tile = "round", scale = 1, pad = 0 }) {
  const t = 32 - 32 * scale; // keep the mark centred while scaling it
  // "framed": the app icon -- gradient to the edges, the website's rounded
  // tile faintly lighter inside it, and the mark on that (scale ~0.77).
  if (tile === "framed" || tile === "framed-round" || tile === "frame-only") {
    const pad2 = 32 - 32 * scale, side = 64 * scale;
    const outer = tile === "framed-round" ? `<rect x="${pad}" y="${pad}" width="${64 - 2 * pad}" height="${64 - 2 * pad}" rx="${14 * (64 - 2 * pad) / 64}" fill="url(#td-g)"/>` : tile === "frame-only" ? "" : `<rect width="64" height="64" fill="url(#td-g)"/>`;
    const k = (64 - 2 * pad) / 64; // a rounded outer tile shrinks everything inside it
    const inner = `<rect x="${32 - side * k / 2}" y="${32 - side * k / 2}" width="${side * k}" height="${side * k}" rx="${16 * scale * k}" fill="#fff" fill-opacity=".045"/>`;
    const tt = 32 - 32 * scale * k;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}${outer}${inner}<g transform="translate(${tt} ${tt}) scale(${scale * k})">${mark}</g></svg>`;
  }
  const bg = tile === "none" ? "" : tile === "full"
    ? `<rect width="64" height="64" fill="url(#td-g)"/>`
    : `<rect x="${pad}" y="${pad}" width="${64 - 2 * pad}" height="${64 - 2 * pad}" rx="${16 * (64 - 2 * pad) / 64}" fill="url(#td-g)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}${bg}<g transform="translate(${t} ${t}) scale(${scale})">${mark}</g></svg>`;
}

const b = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
async function png(file, size, body, { bg = "transparent", canvas = size } = {}) {
  const p = await b.newPage({ viewport: { width: canvas, height: canvas } });
  await p.setContent(`<html><body style="margin:0;background:${bg};width:${canvas}px;height:${canvas}px;display:flex;align-items:center;justify-content:center">
    <div style="width:${size}px;height:${size}px">${body.replace("<svg ", `<svg width="${size}" height="${size}" `)}</div></body></html>`);
  mkdirSync(dirname(join(ROOT, file)), { recursive: true });
  await p.screenshot({ path: join(ROOT, file), omitBackground: bg === "transparent" });
  await p.close();
  console.log("wrote", file);
}

// The app icon is the "framed" design (the picture the owner chose): the
// gradient to the edges, a faint lighter tile, the mark on it.
const ICON = { tile: "framed", scale: 0.8 };

// Web app (also the PWA on phones), and the favicon every build serves.
for (const app of ["web", "mobile", "desktop"]) writeFileSync(join(ROOT, `apps/${app}/public/favicon.svg`), master);
await png("apps/web/public/icon-192.png", 192, svg(ICON));
await png("apps/web/public/icon-512.png", 512, svg(ICON));
await png("apps/web/public/apple-touch-icon.png", 180, svg(ICON));
await png("apps/web/public/icon-maskable-512.png", 512, svg({ tile: "framed", scale: 0.66 }));

// Desktop: electron-builder makes the .ico / .icns from this. The same
// design with rounded outer corners and a little margin, as desktop icons are drawn.
await png("apps/desktop/build/icon.png", 1024, svg({ tile: "framed-round", scale: 0.8, pad: 3.5 }));

// Android (@capacitor/assets): adaptive background (the gradient) and
// foreground (the faint tile and the mark, inside the launcher's safe zone),
// a legacy icon, and the splash, light and dark.
await png("apps/mobile/assets/icon-only.png", 1024, svg(ICON));
await png("apps/mobile/assets/icon-foreground.png", 1024, svg({ tile: "frame-only", scale: 0.64 }));
await png("apps/mobile/assets/icon-background.png", 1024, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRAD}<rect width="64" height="64" fill="url(#td-g)"/></svg>`);
await png("apps/mobile/assets/splash.png", 440, svg({ tile: "framed-round", scale: 0.8 }), { bg: "#ffffff", canvas: 2732 });
await png("apps/mobile/assets/splash-dark.png", 440, svg({ tile: "framed-round", scale: 0.8 }), { bg: "#0f1115", canvas: 2732 });
await b.close();
