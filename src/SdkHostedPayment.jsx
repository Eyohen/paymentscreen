/* eslint-disable react/prop-types */
import { useEffect, useRef } from 'react';
import { CoinleyProvider, useCoinley } from 'coinley-pay';
import 'coinley-pay/dist/style.css';
import { parseHostedParams } from './lib/paymentMode';

// Same backend resolution paymentscreen already uses elsewhere.
const API_URL = import.meta.env.VITE_COINLEY_API_URL || 'https://hub.stablezact.com';

// Opens the SDK payment modal exactly once, on mount, with the amount from the URL.
function AutoOpen({ amount, currency, orderId, customerEmail, shopifyGid, shopifyShopDomain, shopifyOrderId, callbackUrl, source, cancelUrl, test }) {
  const { openPayment } = useCoinley();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    openPayment(
      {
        amount: Number(amount),
        currency,
        customerEmail,
        // Top-level so the SDK sends it as the payment's callbackUrl (usePaymentFlow
        // reads config.callbackUrl). Also mirrored into metadata below as a fallback.
        ...(callbackUrl ? { callbackUrl } : {}),
        metadata: {
          ...(orderId ? { orderId } : {}),
          ...(source ? { source } : {}),
          ...(shopifyGid ? { shopifyPaymentSessionGid: shopifyGid } : {}),
          ...(shopifyShopDomain ? { shopifyShopDomain } : {}),
          ...(shopifyOrderId ? { shopifyOrderId } : {}),
          ...(callbackUrl ? { callbackUrl } : {}),
          ...(cancelUrl ? { shopifyCancelUrl: cancelUrl } : {}),
          ...(test ? { shopifyTest: true } : {}),
        },
      },
      {
        onSuccess: (data) => console.warn('[paymentscreen] SDK payment success', data && data.payment && data.payment.id),
        onError: (err) => console.error('[paymentscreen] SDK payment error', (err && err.message) || err),
      }
    );
  }, [amount, currency, orderId, customerEmail, shopifyGid, shopifyShopDomain, shopifyOrderId, callbackUrl, source, cancelUrl, test, openPayment]);
  return null;
}

export default function SdkHostedPayment() {
  const { amount, currency, merchant, orderId, customerEmail, shopifyGid, shopifyShopDomain, shopifyOrderId, callbackUrl, source, cancelUrl, test } = parseHostedParams(window.location.search);

  if (!amount || Number(amount) <= 0 || !merchant) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Invalid payment link</h1>
          <p style={{ color: '#666', fontSize: 14 }}>This link is missing a valid amount or merchant key.</p>
        </div>
      </div>
    );
  }

  return (
    <CoinleyProvider publicKey={merchant} apiUrl={API_URL}>
      <style>{'#coinley-payment-container:empty{pointer-events:none;}'}</style>
      <AutoOpen
        amount={amount}
        currency={currency}
        orderId={orderId}
        customerEmail={customerEmail}
        shopifyGid={shopifyGid}
        shopifyShopDomain={shopifyShopDomain}
        shopifyOrderId={shopifyOrderId}
        callbackUrl={callbackUrl}
        source={source}
        cancelUrl={cancelUrl}
        test={test}
      />
    </CoinleyProvider>
  );
}
