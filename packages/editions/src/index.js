// Explicit .js: unlike core and platform, this package is imported by
// vite.config.mjs and so is loaded by Node's own ESM resolver, which does not
// guess at extensions the way a bundler does. Leaving it off fails only at
// build-config load time, which is a confusing place to find out.
export {
  FEATURES,
  CAPABILITIES,
  EDITIONS,
  EDITION_META,
  isEdition,
  capabilitiesOf,
  defineFlags,
} from "./capabilities.js";
