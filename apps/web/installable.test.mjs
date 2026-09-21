// What an iPhone needs to install this, checked on the files themselves.
//
// Two things were wrong at once and both were invisible on Android:
//
//   1. Safari has never fired beforeinstallprompt, so a page that only
//      listens for it offers an iPhone nothing. There was no offer at all.
//   2. iOS takes the home-screen icon from apple-touch-icon and composites
//      it onto BLACK. The icon was a near-white mark on a transparent
//      background -- 42% of it fully transparent -- so what a shop got was a
//      black square.
//
// Checked against the PNG bytes rather than a screenshot, because the bug is
// in the alpha channel and a screenshot of it on white looks fine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pub = (f) => join(here, "public", f);

/** width, height and colour type, straight out of the IHDR chunk. */
function png(file) {
  const d = readFileSync(pub(file));
  assert.equal(d.subarray(1, 4).toString(), "PNG", `${file} is not a PNG`);
  return {
    width: d.readUInt32BE(16),
    height: d.readUInt32BE(20),
    colourType: d[25],
    // 4 = grey+alpha, 6 = RGBA. tRNS marks transparency in a palette image.
    hasAlpha: d[25] === 4 || d[25] === 6 || d.subarray(0, 2000).includes(Buffer.from("tRNS")),
  };
}

test("the iOS home-screen icon is opaque", () => {
  const icon = png("apple-touch-icon.png");
  // The whole bug. iOS puts a transparent icon on a black background, and a
  // white-on-transparent mark disappears into it.
  assert.equal(icon.hasAlpha, false, "apple-touch-icon must have no alpha channel");
});

test("and it is the size iOS asks for", () => {
  const icon = png("apple-touch-icon.png");
  assert.equal(icon.width, 180);
  assert.equal(icon.height, 180);
});

test("the manifest icons are opaque too", () => {
  for (const f of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    assert.equal(png(f).hasAlpha, false, `${f} must have no alpha channel`);
  }
});

test("the maskable icon is a separate file from the plain one", () => {
  // They were the same file. A launcher that crops a circle out of a maskable
  // icon took a bite out of the mark, because the mark ran to the edges.
  const manifest = JSON.parse(readFileSync(pub("manifest.webmanifest"), "utf8"));
  const maskable = manifest.icons.filter((i) => i.purpose === "maskable");
  const plain = manifest.icons.filter((i) => i.purpose === "any");
  assert.ok(maskable.length > 0, "there must be a maskable icon");
  for (const m of maskable) {
    assert.ok(
      !plain.some((p) => p.src === m.src),
      `${m.src} is offered as both maskable and any`,
    );
  }
});

test("the page points iOS at that icon, and says it can run standalone", () => {
  const html = readFileSync(join(here, "index.html"), "utf8");
  assert.match(html, /rel="apple-touch-icon"[^>]*href="[^"]*apple-touch-icon\.png"/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  assert.match(html, /name="apple-mobile-web-app-title"/);
});

test("the install offer has a path that does not need beforeinstallprompt", () => {
  const js = readFileSync(join(here, "src", "install.js"), "utf8");
  // Safari will never fire it, so something has to notice iOS by hand.
  assert.match(js, /iPad\|iPhone\|iPod/);
  assert.match(js, /Add to Home Screen/);
  // And it must not offer instructions to a browser that cannot follow them:
  // Chrome and Firefox on iOS cannot add to the home screen at all.
  assert.match(js, /CriOS/);
  // iPadOS reports itself as a Mac, so the touch count is what tells them
  // apart from a desktop Safari where none of this applies.
  assert.match(js, /maxTouchPoints/);
});
