/**
 * Pins this app to a specific version of the backend API (issue #290).
 *
 * The server mounts every router twice: at /api/v1/... and at the original
 * /api/... path. Both run identical code, and the unversioned path is a
 * permanent alias rather than something being retired. Asking for the
 * versioned path anyway is what protects this app from a future v2 changing
 * behaviour underneath it.
 *
 * Call sites keep writing plain '/api/...' paths. The version is applied where
 * the request URL is assembled, so an endpoint added later cannot forget it.
 *
 * IMPORTANT: this app can be pointed at more than one backend at runtime, via
 * the `apiUrl` query parameter (see apiBase.js). Every host it is allowed to
 * reach must therefore serve the versioned paths before this is deployed. If
 * one does not, set VITE_API_VERSION to an empty string to fall back to the
 * unversioned paths without a code change.
 */

export const API_VERSION =
  import.meta.env.VITE_API_VERSION !== undefined
    ? import.meta.env.VITE_API_VERSION
    : 'v1';

// Paths the server deliberately does not mount under a version. /api/health is
// a liveness probe on the process rather than part of the payments API, and
// /api/versions is how a client discovers versions in the first place, so
// neither can require knowing one up front. Verified against staging:
// /api/v1/health returns 404 while /api/health returns 200.
const UNVERSIONED_PATHS = new Set([
  '/api/health',
  '/api/health/detailed',
  '/api/versions',
]);

const ALREADY_VERSIONED = /^\/api\/v\d+(\/|$)/;

/**
 * Rewrites an unversioned API path to its versioned equivalent. Anything that
 * is not an /api/ path is returned untouched, so absolute URLs and third-party
 * endpoints pass straight through.
 *
 * @param {string} endpoint e.g. '/api/payments/process'
 * @param {string} [version] version segment, or '' / null to opt out
 * @returns {string} e.g. '/api/v1/payments/process'
 */
export function versionEndpoint(endpoint, version = API_VERSION) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/api/')) return endpoint;
  if (!version) return endpoint;
  if (ALREADY_VERSIONED.test(endpoint)) return endpoint;

  // Compared without the query string, or '/api/health?probe=1' would slip
  // past the exemption and 404.
  const pathOnly = endpoint.split('?')[0];
  if (UNVERSIONED_PATHS.has(pathOnly)) return endpoint;

  return `/api/${version}${endpoint.slice('/api'.length)}`;
}

/**
 * Convenience for the call sites that build a full URL from a resolved base.
 *
 * @param {string} base a base URL with no trailing slash
 * @param {string} endpoint an /api/... path
 */
export function apiUrlFor(base, endpoint) {
  return `${base}${versionEndpoint(endpoint)}`;
}
