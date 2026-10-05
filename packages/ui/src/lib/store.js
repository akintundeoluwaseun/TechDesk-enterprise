// Which shop this build is for. The Google Play build is made with
// TECHDESK_STORE=play: Play doesn't allow paying for features inside the app
// except through Google, so that build has no prices, no checkout and no
// free test upgrade -- Business and Enterprise are switched on with an
// activation code only. Every other build (website APK, desktop, web) is
// unchanged.
// eslint-disable-next-line no-undef
export const STORE = typeof __TECHDESK_STORE__ !== "undefined" ? __TECHDESK_STORE__ : "";
export const PLAY_STORE = STORE === "play";
