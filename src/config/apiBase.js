/**
 * Resolves the backend API base URL for the payment screen.
 *
 * The `apiUrl` query parameter exists so that a payment created against a
 * non-default backend (e.g. staging) is fetched from the server that created
 * it. Because it arrives from the URL it is attacker-controlled, and this page
 * both sends merchant API credentials to that host and trusts the deposit
 * address it returns — so an unvalidated value lets a crafted link redirect
 * customer funds and harvest credentials.
 *
 * Only our own hosts are honoured; anything else falls back to the build-time
 * default.
 */

const DEFAULT_API_URL =
  import.meta.env.VITE_COINLEY_API_URL || 'https://hub.coinley.io';

// Hosts this page is allowed to talk to. The build-time default is added below
// so environment-specific deploys keep working without editing this list.
const ALLOWED_API_HOSTS = new Set([
  'hub.stablezact.com',
  'hub.coinley.io',
  'talented-mercy-production.up.railway.app',
  'localhost',
  '127.0.0.1',
]);

try {
  ALLOWED_API_HOSTS.add(new URL(DEFAULT_API_URL).hostname);
} catch {
  // Malformed VITE_COINLEY_API_URL — the static list above still applies.
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * @param {string} [search] location.search to read `apiUrl` from.
 * @returns {string} A trusted API base URL with any trailing slash removed.
 */
export function resolveApiBaseUrl(search) {
  const query =
    search ?? (typeof window !== 'undefined' ? window.location.search : '');
  const candidate = new URLSearchParams(query).get('apiUrl');

  if (!candidate) return stripTrailingSlash(DEFAULT_API_URL);

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    console.warn('[apiBase] Ignoring malformed apiUrl parameter');
    return stripTrailingSlash(DEFAULT_API_URL);
  }

  const isLocal = LOCAL_HOSTS.has(parsed.hostname);

  // Never downgrade to plaintext for a remote host — credentials travel here.
  if (parsed.protocol !== 'https:' && !isLocal) {
    console.warn(`[apiBase] Ignoring non-HTTPS apiUrl: ${parsed.protocol}//`);
    return stripTrailingSlash(DEFAULT_API_URL);
  }

  if (!ALLOWED_API_HOSTS.has(parsed.hostname)) {
    console.warn(`[apiBase] Ignoring untrusted apiUrl host: ${parsed.hostname}`);
    return stripTrailingSlash(DEFAULT_API_URL);
  }

  return stripTrailingSlash(candidate);
}

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

export { ALLOWED_API_HOSTS, DEFAULT_API_URL };
