// The account client is core's; the native side it calls is bound in bindCore.
import "./bindCore";
export {
  account,
  getPushCursor, setPushCursor, getPullCursor, setPullCursor,
  getAccountGateDecision, setAccountGateDecision,
  getCachedAccountStatus,
} from "@techdesk/core";
