// The shop-sharing client is core's; the native side it calls is bound in
// bindCore, exactly as the HQ client is.
import "./bindCore";
export { shop, SHAREABLE, shareLabel, mergeShared } from "@techdesk/core";
