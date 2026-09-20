import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { defineFlags, EDITION_META, isEdition } from "@techdesk/editions";

// WHICH EDITION IS THIS BUILD?
//
// Build time, from the environment -- never a setting the running app can
// read or write. That is the point. An edition stored in localStorage is an
// edition the customer can change, and the devtools are one shortcut away:
// a Solo licence would become Enterprise in about ten seconds.
//
// Being a build constant means each flag is a literal true or false in the
// source the bundler sees, so a branch guarded by a capability this edition
// does not have is deleted along with whatever it imported. A runtime check
// can hide a feature; only a build-time one can leave it out.
//
//   TECHDESK_EDITION=solo npm run build
//
// Defaults to enterprise because that is what this app has always been, and
// steps 5 and 6 fold the other two in.
const edition = process.env.TECHDESK_EDITION || "enterprise";
if (!isEdition(edition)) {
  throw new Error(
    `TECHDESK_EDITION="${edition}" is not an edition. ` +
      `Building a binary labelled one thing and behaving like another is not a mistake to discover later.`
  );
}

// index.html is served before any of the app's own code runs, so its title
// cannot come from a define. It is the window's name while the app is still
// starting, and a Solo build flashing "TechDesk Enterprise" is exactly the
// kind of detail that tells a customer the product is three things wearing
// one coat.
const editionTitle = {
  name: "techdesk-edition-title",
  transformIndexHtml(html) {
    return html.replace(
      /<title>[^<]*<\/title>/,
      `<title>${EDITION_META[edition].productName}</title>`
    );
  },
};

export default defineConfig({
  plugins: [react(), editionTitle],
  base: "./",
  define: defineFlags(edition),
  server: {
    port: 5173,
  },
  build: {
    // One output directory, not one per edition: electron/main.js and
    // electron-builder both expect dist/, and a release builds one edition
    // then packages it before starting the next.
    outDir: "dist",
    emptyOutDir: true,
  },
});
