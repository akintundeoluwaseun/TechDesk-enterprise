// Filled in once by the developer after deploying relay/worker.js (see
// relay/README.md) -- these are what let the app send the daily digest
// through a real account without every shop needing their own SMTP setup.
// CLIENT_KEY isn't a true secret (it ships inside the app, so it's
// extractable), it's just enough to keep the relay from being a wide-open
// send-email endpoint; the relay's own per-recipient rate limit is the real
// abuse guard.
module.exports = {
  RELAY_URL: "",
  CLIENT_KEY: "",
};
