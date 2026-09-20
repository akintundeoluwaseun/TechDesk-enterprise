// The contract every shell has to satisfy.
//
// TechDesk runs in three places and each delivers a file differently: a
// desktop gets a download, a phone gets a write into its own Documents folder,
// a browser tab gets an anchor click. Above this line nobody cares which --
// the receipt code builds a document and asks for it to be saved.
//
// JSDoc rather than TypeScript because the rest of the codebase is JS and one
// typed island would mean a build step for everybody. Editors read this.

/**
 * What happened to a file. `ok` is the only field a caller must look at.
 *
 * `via` says which road it took -- "download", "saved", "share", "viewer",
 * "cancelled" -- and is for logs and tests, not for branching on.
 *
 * `folder` is where the file actually landed, quoted from what the platform
 * returned rather than a folder name we assumed. Android redirects Documents
 * on some devices, and telling a shop the wrong folder is worse than telling
 * them nothing.
 *
 * @typedef {Object} DeliveryResult
 * @property {boolean} ok
 * @property {"download"|"saved"|"share"|"viewer"|"cancelled"} [via]
 * @property {string} [uri]
 * @property {string} [folder]
 * @property {string} [error]
 */

/**
 * @typedef {Object} PlatformAdapter
 * @property {"browser"|"electron"|"capacitor"} name
 *
 * @property {(blob: Blob, filename: string) => Promise<DeliveryResult>} saveFile
 *   Put the file where this person can find it again. Saving saves: it must
 *   never open a chooser the shop has to answer before anything is kept.
 *
 * @property {(blob: Blob, filename: string) => Promise<DeliveryResult>} shareFile
 *   Hand the file to whatever shares things here. Only from a button that
 *   says share.
 *
 * @property {(blob: Blob, filename: string) => Promise<DeliveryResult>} openFile
 *   Show the file in whatever views this kind of file, so nothing has to be
 *   fished back out of a downloads folder to be shown to a customer.
 *
 * @property {(url: string) => void} openExternal
 *   Open a link outside the app -- WhatsApp, a web page.
 */

export {};
