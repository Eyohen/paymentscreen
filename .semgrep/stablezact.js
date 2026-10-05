// Test fixtures for .semgrep/stablezact.yml (paymentscreen).
// Run: semgrep --test --config .semgrep/stablezact.yml .semgrep/stablezact.js
// `ruleid:` lines must match; `ok:` lines must not.
// Excluded from the real scan (--exclude=.semgrep in CI).

// ============================================================
// stablezact-no-money-field-from-url
// ============================================================
function moneyFromUrl(urlParams, fetchedPayment) {
  const q = new URLSearchParams(window.location.search);

  // ruleid: stablezact-no-money-field-from-url
  const r1 = q.get("recipient1");
  // ruleid: stablezact-no-money-field-from-url
  const wallet = q.get("merchantWallet");
  // ruleid: stablezact-no-money-field-from-url
  const contract = q.get("splitterContractAddress");
  // ruleid: stablezact-no-money-field-from-url
  const recipient1 = urlParams.recipient1 || fetchedPayment.recipient1;
  // ruleid: stablezact-no-money-field-from-url
  const ca = urlParams.contractAddress || fetchedPayment.contractAddress;

  // server-wins: the correct pattern
  // ok: stablezact-no-money-field-from-url
  const safe1 = fetchedPayment.merchantWallet || fetchedPayment.recipient1;
  // ok: stablezact-no-money-field-from-url
  const pid = q.get("paymentId");
  // ok: stablezact-no-money-field-from-url
  const pref = q.get("preferredWallet");
}

// ============================================================
// stablezact-no-unvalidated-apiurl-from-query
// ============================================================
function apiFromQuery() {
  const q = new URLSearchParams(window.location.search);
  // ruleid: stablezact-no-unvalidated-apiurl-from-query
  const base = q.get("apiUrl") || import.meta.env.VITE_COINLEY_API_URL;

  // ok: stablezact-no-unvalidated-apiurl-from-query
  const resolved = resolveApiBaseUrl();
}
