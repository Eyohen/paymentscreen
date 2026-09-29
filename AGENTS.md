# AGENTS.md — paymentscreen

Hosted customer payment page for Coinley/Stablezact. Customers reach it from payment links (`?paymentId=...`) to pay a merchant in stablecoins from a browser wallet via the PaymentSplitter contract, or via a Relay swap/bridge into a CREATE2 deposit address. Stack: React 18, Vite, wagmi/viem, Zustand, React Query, Tailwind. `main` deploys through Azure Static Web Apps; `staging` is ahead of `main` (API-URL allowlist, v1 API paths, dependency fixes), and these rules describe `staging`. This page builds and signs the customer's token approval and payment transaction, so any data it takes from the URL instead of the server decides where money goes.


## Code Review Rules

Every pull request is reviewed from a security perspective. This is a payments company: code here moves stablecoins, holds merchant data, or runs inside a merchant's checkout. Treat every change as money-adjacent until shown otherwise.

### How to review

- Do not review only the changed lines. Follow the change into its callers, callees, authentication and authorization middleware, database queries, API contracts, webhooks, configuration, environment handling, dependencies, and any payment status transition it can reach.
- Review in two passes. First defensively, against the checklists below. Then as an attacker: *"If I controlled the browser, the API client, wallet input, HTTP headers, the request body, a webhook payload, URL parameters and the timing of requests, how could I steal money, redirect money, read data that isn't mine, gain privileges, or take the service down?"* Trace real paths through this repository.
- Do not invent vulnerabilities. Report only what you can trace to code in this repository. Where a test or a safe local reproduction can confirm an issue, say how.
- Do not modify code. Comment on the pull request; the developer decides whether to apply a fix.
- The repo-specific rules below override the generic checklists when they are more precise.

### Severity

Codex posts P0 and P1 findings on GitHub. Map severity like this:

- **P0 (Critical):** funds can be stolen, redirected, double-paid or frozen; authentication or authorization can be bypassed; a private key, API secret or signing secret can leak; remote code execution.
- **P1 (High):** another merchant's or customer's data can be read or changed (BOLA/IDOR); a payment can be marked paid without the money arriving, or refunded when it shouldn't be; webhook spoofing or replay; SSRF; a check that protects money can be skipped under a realistic race or error path; secrets or full wallet/PII data written to logs.
- Medium and Low issues (hardening, defence in depth, noisy logging) do not need a comment unless they combine with something above into a P0/P1 path.

### Findings format

For every finding give:

- **Severity** (P0/P1, and Critical/High)
- **Where:** file and the specific code
- **Vulnerability:** one sentence
- **Attack scenario:** the concrete steps an attacker takes
- **Impact:** what they get (money, data, access, outage)
- **Mapping:** OWASP Top 10 2025 / OWASP API Top 10 2023 / CWE where it fits
- **Fix:** the recommended remediation, with a suggested code change where useful

### Web and API checklist (OWASP Top 10 2025, OWASP API Top 10 2023)

Broken access control and BOLA/IDOR · broken object property authorization (mass assignment, over-exposed fields) · broken function-level authorization (admin routes reachable by merchants, merchant routes by customers) · authentication failures · security misconfiguration · software supply chain (new or changed dependencies, install scripts, lockfile changes, CDN scripts) · cryptographic failures · injection (SQL, NoSQL, command, template, header, log) · insecure design · software and data integrity failures · security logging and monitoring failures · incorrect handling of exceptional conditions (errors that fail open) · resource exhaustion and missing rate limits · sensitive business-flow abuse · SSRF · improper API inventory (debug, test or legacy routes left reachable) · unsafe consumption of third-party APIs.

### Payment checklist

Amount manipulation · currency or token manipulation · token-contract spoofing · wallet or settlement-address substitution · incorrect chain/network validation · webhook spoofing, signature verification and timestamp/replay checks · duplicate payment processing and idempotency bypass · race conditions around status changes · payment-status manipulation · refund manipulation (destination, amount, double refund) · price/exchange-rate manipulation · transaction-confirmation assumptions (reorgs, pending vs confirmed) · merchant/customer data isolation · privilege escalation · secrets, keys, full addresses or PII in logs.

### Trust boundaries

- The page is opened from a link that anyone can craft. Every query parameter is
  attacker-controlled: `paymentId`, `amount`, `amountInWei`, `token`, `tokenContract`,
  `contractAddress`, `chainId`, `network`, `recipient1..3`, `recipient*Percentage`,
  `splitterPaymentId`, `tokenDecimals`, `merchant`, `preferredWallet`, `isMobile`, `apiUrl` and
  `debug`. They are read in `src/App.jsx`, `getValidatedUrlParams` in
  `src/EnhancedMobilePaymentFlow.jsx` and `getUrlParams` in `src/AppWithWagmi.jsx`.
- The only trustworthy source for what the customer pays is the server's public payment object, `GET
  /api/payments/public/:paymentId` (coinleyserver `controller/payment.js`). It returns `amount`,
  `status`, `splitterContractAddress`, `merchantWallet`, `coinleyWallet`, `merchantPercentage`,
  `coinleyPercentage`, `Token` (contract address and decimals), `Network` (chainId, explorerUrl),
  `Merchant.businessName`, `expiresAt` and a reduced `metadata`. The splitter ABI and address come
  from `GET /api/payments/contract/:chainId`. The CREATE2 deposit address for swap/bridge payments
  comes from `POST /api/deposits/create` (`src/hooks/useSwapPayment.js`).
- Third-party inputs: Relay quotes and transaction data from `https://api.relay.link`
  (`src/config/relayConfig.js`, `src/hooks/useRelayBridge.js`) and Alchemy RPC reads. The wallet
  (injected connectors only, configured in `src/wagmiConfig.js`) is also untrusted: chain and
  account can change at any moment.
- The backend host is `resolveApiBaseUrl()` in `src/config/apiBase.js` (on `staging`): the
  build-time `VITE_COINLEY_API_URL` default, or an `apiUrl` query value only if it is https and on
  `ALLOWED_API_HOSTS`. On `main` this file does not exist and `createApiClient` in
  `src/EnhancedMobilePaymentFlow.jsx` uses `apiUrl` from the query string without validation.
  `src/AppWithWagmi.jsx` and `src/hooks/useSwapPayment.js` always use `VITE_COINLEY_API_URL`
  directly.
- Payment status is decided by the server (`/api/payments/status/:id`, `/api/payments/verify-qr`,
  deposit monitor). `POST /api/payments/process` (`notifyBackend`) is a hint from the client, not
  proof of payment.

### Money and account rules that must hold

- Recipient, splitter contract, token contract, chain, amount and decimals used in `approve`,
  `simulateContract` and `writeContract` must come from the server payment object for this
  `paymentId`, never from the URL. Today `mergePaymentData` in both
  `src/EnhancedMobilePaymentFlow.jsx` and `src/AppWithWagmi.jsx` does the reverse
  (`urlParams.recipient1 || backend.recipient1`, and the same for `contractAddress`,
  `tokenContract`, `chainId`, `amount`, `amountInWei`), and `resetFlow` in `src/AppWithWagmi.jsx`
  resets to raw URL params. Any PR touching these functions must move to server-wins. Any PR that
  adds another URL-over-server fallback is P0: a crafted link on our domain makes the customer
  approve an attacker's contract, or pay an attacker's address.
- `approve` must name the server's splitter address as spender, for the exact amount. Flag unlimited
  approvals (`maxUint256`), a spender from any other source, or an approval before the payment
  object has loaded.
- If the server payment is missing, not `pending`, or past `expiresAt`, the page must not start a
  transfer. Flag new code paths that pay without first fetching `/api/payments/public/:id`, or that
  continue after that fetch fails (fail closed). Neither flow currently checks `status` or
  `expiresAt` before paying; do not make that worse.
- Chain: before `writeContract`, the wallet's chain must equal the server payment's
  `Network.chainId`. Switching chain after the payment data loads must re-validate, not reuse stale
  addresses. Token contract fallbacks (`KNOWN_TOKEN_CONTRACTS` / `getKnownTokenContract`) are
  acceptable only when the server gave none, and must be keyed by the server's chain and symbol.
- Amount: compute on-chain units from the server amount and server decimals using `parseUnits`,
  never from `amountInWei` or `tokenDecimals` in the URL, and never from floats. The server compares
  deposits exactly, with no underpayment tolerance: any rounding down, or display that is less
  precise than the server amount, produces an unpayable payment.
- Swap/bridge (`src/hooks/useSwapPayment.js`, `src/hooks/useRelayBridge.js`): the Relay quote
  `recipient` must be the `depositAddress` returned by `/api/deposits/create` for this payment, and
  the `to`/`data` Relay returns go straight to `sendTransaction`. Flag any change that sends Relay
  calldata without a recipient bound to the server deposit address, or lets the placeholder quote
  (recipient = customer wallet) be executed. The server should derive `amount` for
  `/api/deposits/create` from `existingPaymentId`; flag PRs that start trusting a client-sent
  amount.
- Success UI: show "paid" only from a server status (`completed`/`swept`) or a mined receipt
  matching the server's parameters. `setCurrentStep('success')` straight after `writeContract`
  (current behaviour) is UX only. Never tell a merchant integration that the payment succeeded from
  the client. There is no return, success or cancel redirect today; any added one must be an
  absolute https URL taken from the server payment for this ID and checked against an allowlist,
  never a query param.
- `apiUrl` allowlist (`ALLOWED_API_HOSTS`): adding a host, allowing `http:` for a non-local host,
  loosening the hostname match (suffix, `includes`, regex), or reading `apiUrl` anywhere other than
  `resolveApiBaseUrl` is P0. That host receives the API credentials and supplies the addresses the
  customer pays. `localhost` and `127.0.0.1` on the list mean a production build honours
  `?apiUrl=http://localhost...`; do not extend that.

### Secrets, tokens and logging

- There is no user session. The only secrets are build-time env vars, and every `VITE_*` value is
  public in the shipped JS. `VITE_COINLEY_API_KEY` and `VITE_COINLEY_API_SECRET` are read in
  `src/AppWithWagmi.jsx` and `src/EnhancedMobilePaymentFlow.jsx` and sent as
  `X-API-Key`/`X-API-Secret`. The committed `.env` contains real values for both, so every build
  (Azure Static Web Apps builds from the repo with no env override) embeds a merchant's legacy API
  secret in a public page. Any PR that keeps, adds or re-populates a `VITE_*` secret, or adds
  `x-api-secret` to a request, is P0. Use the payment ID and public endpoints, or `X-Public-Key`,
  instead.
- `.env` and `.env.production` are tracked despite `.env` being in `.gitignore`. Flag any PR that
  changes secret values in tracked env files. A real key must be rotated server-side, not just
  deleted from the repo.
- `src/hooks/useRelayBridge.js` hard-codes an Alchemy API key. Do not add more literal provider
  keys; a key with write or billing power in client code is P1.
- Console and debug output: `getValidatedUrlParams` logs the full URL and all params; the debug
  panel is on when `?debug=true` (`src/utils/debugUtils.js`); `addDebugLog` data can be copied to
  the clipboard; `src/stores/paymentStore.js` persists the last 50 debug logs to `localStorage`
  (`coinley-payment-store`). Never log API credentials, full request headers, signed transactions or
  anything a wallet returns beyond addresses and hashes. Use `sanitizeForLog` in
  `src/utils/debugUtils.js` for objects that could contain headers.
- `localStorage.coinley_wallet_address` (`src/AppWithWagmi.jsx`) caches the customer's address. Do
  not use it as the payer identity for anything the server trusts.
- There is no analytics or session replay in this repo today. Adding Clarity, GA4, Mixpanel or
  similar on this page needs masking of addresses, amounts and query strings, and it must not
  capture the URL (it carries `paymentId` and, today, recipient parameters).

### Rendering and navigation safety

- No `dangerouslySetInnerHTML`, `innerHTML` or `eval` under `src/`. Introducing any of them over URL
  or API data (for example `merchant`, `Merchant.businessName`, token symbol or error text) is P0: a
  script on this origin can swap the address the customer pays.
- `href` sinks: explorer links go through `getExplorerUrl` in `src/utils/formatUtils.js` (fixed host
  map keyed by network name), and wallet deeplinks in `renderProviderTimeout`
  (`src/EnhancedMobilePaymentFlow.jsx`) and `src/AppWithWagmi.jsx` wrap `window.location.href` in
  MetaMask, Trust and Coinbase URL schemes. Keep both host-fixed. Any `href`, `window.open` or
  `location` assignment taking a URL from query params or API data needs a scheme and host check.
- Text from the URL (`merchant`, `token`, `network`, `amount`) is rendered as the merchant name,
  token and amount the customer sees. Even as plain text this is a phishing surface. Display values
  must come from the server payment, and a PR that shows URL-provided names or amounts next to a pay
  button deserves a finding.
- Address display: the customer's own address is shown truncated (`slice(0, 6)...slice(-4)`), which
  is fine. Any displayed or copyable recipient or deposit address must be the full server value, and
  copy buttons must copy exactly what is shown.
- `index.html` loads only Google Fonts and an inline loader script. New external scripts are a
  supply-chain finding. `vercel.json` rewrites all paths to `/`; there is no CSP or
  `frame-ancestors`. The page could be framed by a phishing site, so do not add flows that pay
  without an explicit click in the page.

### Known past issues (do not reintroduce)

- Unvalidated `apiUrl` query param: a crafted link pointed the page at an attacker backend that
  received the API key and secret and supplied the pay-to addresses. Fixed on `staging` by
  `src/config/apiBase.js` (PR #6); `main` still has the old code. Line ~1828 of
  `src/EnhancedMobilePaymentFlow.jsx` still reads raw `apiUrl`, but only for a debug log; do not let
  it become a request base again.
- Backend mismatch: paymentscreen bakes its backend at build time, and a payment created on one
  backend returns "Payment not found" on another (staging vs production databases). Do not "fix"
  that by trusting URL payment data when the fetch fails.
- `notifyBackend` was treated as the completion signal and payments stayed `pending`. Status must
  come from the server's verifying endpoints.
- Displayed amounts less precise than the server amount made payments unpayable (the server has zero
  underpayment tolerance). Keep display and quantisation in step.
- Dependency remediation (PR #5) cut Dependabot alerts from 37 to 16 on `staging`. Flag lockfile
  changes that downgrade `wagmi`, `viem` or `@tanstack/react-query`, and new install scripts.

### Not issues in this repo

- `paymentId` in the URL is a bearer reference by design; `/api/payments/public/:id` intentionally
  exposes what the customer needs to pay. Do not report the ID itself as sensitive.
- Merchant and fee wallet addresses and split percentages visible in the public payment object are
  public by design (they end up on-chain).
- The Relay API URL, the public RPC URLs in `src/wagmiConfig.js` and Google Fonts are public.
- `src/hooks/usePaymentApi.js`, `src/hooks/useProviderDetection.js` and most of
  `src/stores/paymentStore.js` are not imported by the running flows. Findings there matter only if
  a PR wires them in.
- `qr-generator.html`, `test-alignment.js`, `test-url.js` and `PAYMENT_FIX_SUMMARY.md` are not part
  of the build.
- Server-side verification gaps (BOLA on payment IDs, `/api/payments/process` trusting the client)
  belong to coinleyserver; mention them only when a change here makes them easier to reach.
