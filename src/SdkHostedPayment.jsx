/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CoinleyProvider, useCoinley } from 'coinley-pay';
import 'coinley-pay/dist/style.css';
import { parseHostedParams } from './lib/paymentMode';

// Same backend resolution paymentscreen already uses elsewhere.
const API_URL = import.meta.env.VITE_COINLEY_API_URL || 'https://hub.stablezact.com';

const BRAND = '#5b3df5';

// ── shared centered layout ──────────────────────────────────────────────────
function Screen({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f6f7f9', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(17,24,39,0.08)', padding: 32, textAlign: 'center' }}>
        {children}
      </div>
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}1a`, color, fontSize: 30 }}>
      {children}
    </div>
  );
}

function OrderSummary({ orderId, amount, currency }) {
  if (!orderId && !amount) return null;
  return (
    <div style={{ marginTop: 20, padding: '14px 16px', background: '#f6f7f9', borderRadius: 10, fontSize: 14, color: '#374151', textAlign: 'left' }}>
      {orderId && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: amount ? 6 : 0 }}>
          <span style={{ color: '#6b7280' }}>Order</span><span style={{ fontWeight: 600 }}>{orderId}</span>
        </div>
      )}
      {amount && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#6b7280' }}>Amount</span><span style={{ fontWeight: 600 }}>{currency} {amount}</span>
        </div>
      )}
    </div>
  );
}

function Button({ onClick, href, children, kind = 'primary' }) {
  const style = {
    display: 'inline-block', marginTop: 24, padding: '13px 28px', borderRadius: 10, fontSize: 15, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', border: 'none',
    ...(kind === 'primary'
      ? { background: BRAND, color: '#fff' }
      : { background: 'transparent', color: BRAND, border: `1px solid ${BRAND}55` }),
  };
  return href
    ? <a href={href} style={style}>{children}</a>
    : <button onClick={onClick} style={style}>{children}</button>;
}

// ── the flow (must live inside CoinleyProvider to use the SDK) ───────────────
function HostedFlow({ params }) {
  const { openPayment } = useCoinley();
  const [status, setStatus] = useState('loading'); // loading | paying | success | closed | error
  const settled = useRef(false);
  const started = useRef(false);

  const open = useCallback(() => {
    settled.current = false;
    setStatus('paying');
    const { amount, currency, orderId, customerEmail, shopifyGid, shopifyShopDomain, shopifyOrderId, callbackUrl, source, cancelUrl, test } = params;
    openPayment(
      {
        amount: Number(amount),
        currency,
        customerEmail,
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
        onSuccess: (data) => { settled.current = true; setStatus('success'); console.warn('[paymentscreen] payment success', data?.payment?.id); },
        onError: (err) => { setStatus('error'); console.error('[paymentscreen] payment error', err?.message || err); },
        onClose: () => { if (!settled.current) setStatus('closed'); },
      }
    );
  }, [params, openPayment]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    open();
  }, [open]);

  const { orderId, amount, currency, shopifyShopDomain } = params;
  const storeUrl = shopifyShopDomain ? `https://${shopifyShopDomain}` : null;

  // Keep the empty SDK container from blocking clicks on our screens.
  const guard = <style>{'#coinley-payment-container:empty{pointer-events:none;}'}</style>;

  if (status === 'success') {
    return (<>{guard}<Screen>
      <Badge color="#16a34a">✓</Badge>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#111827' }}>Payment successful</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Thanks! Your payment has been received and your order is confirmed.</p>
      <OrderSummary orderId={orderId} amount={amount} currency={currency} />
      {storeUrl && <Button href={storeUrl}>Return to store</Button>}
      <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 20 }}>Powered by Stablezact</p>
    </Screen></>);
  }

  if (status === 'closed') {
    return (<>{guard}<Screen>
      <Badge color="#f59e0b">⏳</Badge>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#111827' }}>Payment not completed</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>You closed the payment window before finishing. You can pick up where you left off.</p>
      <OrderSummary orderId={orderId} amount={amount} currency={currency} />
      <div><Button onClick={open}>Pay with Crypto</Button></div>
      {storeUrl && <div><Button href={storeUrl} kind="ghost">Return to store</Button></div>}
      <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 20 }}>Powered by Stablezact</p>
    </Screen></>);
  }

  if (status === 'error') {
    return (<>{guard}<Screen>
      <Badge color="#dc2626">!</Badge>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#111827' }}>Something went wrong</h1>
      <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>We couldn’t complete your payment. Please try again.</p>
      <OrderSummary orderId={orderId} amount={amount} currency={currency} />
      <div><Button onClick={open}>Try again</Button></div>
      {storeUrl && <div><Button href={storeUrl} kind="ghost">Return to store</Button></div>}
      <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 20 }}>Powered by Stablezact</p>
    </Screen></>);
  }

  // loading / paying — the SDK modal overlays this backdrop.
  return (<>{guard}<Screen>
    <Badge color={BRAND}>₿</Badge>
    <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: '#111827' }}>Complete your payment</h1>
    <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>Follow the steps in the payment window to pay with crypto.</p>
    <OrderSummary orderId={orderId} amount={amount} currency={currency} />
  </Screen></>);
}

export default function SdkHostedPayment() {
  const params = parseHostedParams(window.location.search);

  if (!params.amount || Number(params.amount) <= 0 || !params.merchant) {
    return (
      <Screen>
        <Badge color="#dc2626">!</Badge>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Invalid payment link</h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginTop: 8 }}>This link is missing a valid amount or merchant key.</p>
      </Screen>
    );
  }

  return (
    <CoinleyProvider publicKey={params.merchant} apiUrl={API_URL}>
      <HostedFlow params={params} />
    </CoinleyProvider>
  );
}
