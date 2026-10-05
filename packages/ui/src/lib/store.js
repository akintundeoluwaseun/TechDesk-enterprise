// Which shop this build is for. The Google Play build is made with
// TECHDESK_STORE=play: Play doesn't allow paying for features inside the app
// except through Google, so that build has no prices, no checkout and no
// free test upgrade -- Business and Enterprise are switched on with an
// activation code only. Every other build (website APK, desktop, web) is
// unchanged.
// eslint-disable-next-line no-undef
export const STORE = typeof __TECHDESK_STORE__ !== "undefined" ? __TECHDESK_STORE__ : "";
export const PLAY_STORE = STORE === "play";

// Business and Enterprise are sold by hand as codes, on every build: the
// shop contacts TechDesk (WhatsApp, phone, email), pays, and types the code
// in. The Upgrade screen shows the prices, the contacts and the code box,
// and no online checkout. Set to false to bring the in-app checkout back.
export const CODES_ONLY = true;
