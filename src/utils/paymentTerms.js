// Payment terms that decide where the customer's money goes. The server marks a
// payment paid only when the on-chain token, amount, recipients and split match
// its own Payment row (coinleyserver#363), so these must come from the backend,
// never from the URL: a crafted link on our domain could otherwise send the
// customer's funds to an attacker, and the order would still never complete.
export const BACKEND_ONLY_FIELDS = [
  'amount',
  'amountInWei',
  'token',
  'network',
  'networkShortName',
  'chainId',
  'contractAddress',
  'tokenContract',
  'tokenDecimals',
  'recipient1',
  'recipient2',
  'recipient3',
  'recipient1Percentage',
  'recipient2Percentage',
  'recipient3Percentage'
];

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// The public payment endpoint returns percentages (98.25); the splitter takes
// basis points (9825). parseInt(98.99 * 100) is 9898, so round instead.
export const toBasisPoints = (percentage) => {
  if (percentage === undefined || percentage === null || percentage === '') return '';
  const value = Number(percentage);
  return Number.isFinite(value) ? String(Math.round(value * 100)) : '';
};

// Parse a basis-point value strictly: no silent 10000/0 fallback.
export const parseBasisPoints = (value) => {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return parsed <= 10000 ? parsed : null;
};

// URL params only supply display/navigation values (paymentId, merchant name
// fallback, callbacks); every money field comes from the backend payment.
export const mergeWithBackend = (urlParams, backend) => {
  if (!backend) {
    throw new Error('Payment details could not be loaded. Please scan a fresh payment QR code.');
  }

  const merged = { ...urlParams };
  for (const field of BACKEND_ONLY_FIELDS) {
    merged[field] = backend[field] ?? '';
  }
  merged.recipient3 = merged.recipient3 || ZERO_ADDRESS;
  merged.recipient3Percentage = merged.recipient3Percentage || '0';
  merged.merchant = backend.merchant || urlParams.merchant || 'Demo Merchant';
  return merged;
};

// Split percentages must be present, whole basis points, and recipient1 must
// receive something. Returns an error message or null.
export const validateSplit = (paymentData) => {
  const r1 = parseBasisPoints(paymentData.recipient1Percentage);
  const r2 = parseBasisPoints(paymentData.recipient2Percentage);
  const r3 = parseBasisPoints(paymentData.recipient3Percentage || '0');
  if (r1 === null || r2 === null || r3 === null || r1 === 0) {
    return 'Payment configuration is incomplete. Split details could not be loaded.';
  }
  if (r1 + r2 + r3 > 10000) {
    return 'Payment configuration is invalid. Split exceeds 100%.';
  }
  return null;
};
