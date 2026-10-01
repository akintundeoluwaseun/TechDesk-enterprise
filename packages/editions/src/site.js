// Where TechDesk lives on the internet. One constant, one file.
//
// This exists because the address was written out by hand in the activation
// screen, the Connect to HQ screen, Monitor's login screen and the .deb
// metadata -- and when it was changed, it was changed in some of them. The
// app spent a release telling shops to visit a domain that did not resolve,
// which for a shop trying to pay is the same as being turned away.
//
// A URL nobody can type twice cannot be wrong in one place and right in
// another. Everything that points at the product points here.
export const SITE_ORIGIN = "https://www.techdesk.space";

/** A page on the site, e.g. sitePage("download.html"). */
export function sitePage(page = "") {
  return page ? `${SITE_ORIGIN}/${page.replace(/^\//, "")}` : SITE_ORIGIN;
}

/** The same thing without the scheme, for showing to a person. */
export function siteLabel(page = "") {
  return sitePage(page).replace(/^https:\/\//, "").replace(/\.html$/, "");
}
