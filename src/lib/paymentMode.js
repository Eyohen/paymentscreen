// Pure URL-param routing for paymentscreen's two flows.
//  'sdk-host' → new any-token flow (merchant public key + amount, no baked chain/contract)
//  'baked'    → existing EnhancedMobilePaymentFlow (chainId/contractAddress present)
export function resolvePaymentMode(search) {
  const p = new URLSearchParams(search || '');
  const hasBaked = Boolean(p.get('chainId') || p.get('contractAddress'));
  const hasHosted = Boolean(p.get('amount') && p.get('merchant'));
  if (!hasBaked && hasHosted) return 'sdk-host';
  return 'baked';
}

export function parseHostedParams(search) {
  const p = new URLSearchParams(search || '');
  return {
    amount: p.get('amount') || '',
    currency: (p.get('currency') || 'USD').toUpperCase(),
    merchant: p.get('merchant') || '',
    orderId: p.get('orderId') || undefined,
    customerEmail: p.get('email') || undefined,
    shopifyGid: p.get('shopify_gid') || p.get('shopifyGid') || undefined,
    shopifyShopDomain: p.get('shopify_shop') || p.get('shopifyShopDomain') || undefined,
    shopifyOrderId: p.get('shopify_order_id') || p.get('shopifyOrderId') || undefined,
    // Server-to-server settlement callback (Stablezact pings this on confirmation).
    // Carried into payment metadata so the manual-payment pilot learns when to settle.
    callbackUrl: p.get('callback_url') || p.get('callbackUrl') || undefined,
    source: p.get('source') || undefined,
    cancelUrl: p.get('cancel_url') || p.get('cancelUrl') || undefined,
    test: p.get('test') === 'true',
  };
}
