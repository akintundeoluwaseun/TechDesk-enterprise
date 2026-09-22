// The sync client is core's; the native side it calls is bound in bindCore,
// exactly as the HQ client is.
import "./bindCore";
export { sync, SYNCABLE, syncLabel, mergeSynced, pruneUnreachable } from "@techdesk/core";
