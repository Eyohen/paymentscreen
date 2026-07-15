import { describe, it, expect } from 'vitest';
import { resolvePaymentMode, parseHostedParams } from './paymentMode';

describe('resolvePaymentMode', () => {
  it('returns sdk-host for amount+merchant with no baked chain', () => {
    expect(resolvePaymentMode('?amount=10&merchant=pk_x&currency=USD')).toBe('sdk-host');
  });
  it('returns sdk-host for Shopify hosted links carrying a payment session gid', () => {
    expect(resolvePaymentMode('?amount=10&merchant=pk_x&shopify_gid=gid%3A%2F%2Fshopify%2FPaymentSession%2F1')).toBe('sdk-host');
  });
  it('returns baked when chainId/contractAddress present (legacy URL)', () => {
    expect(resolvePaymentMode('?amount=10&merchant=Demo&chainId=56&contractAddress=0xabc')).toBe('baked');
  });
  it('returns baked when neither hosted nor baked is complete', () => {
    expect(resolvePaymentMode('?foo=bar')).toBe('baked');
  });
});

describe('parseHostedParams', () => {
  it('parses amount/currency/merchant and defaults currency to USD', () => {
    expect(parseHostedParams('?amount=12.5&merchant=pk_x')).toEqual({
      amount: '12.5', currency: 'USD', merchant: 'pk_x', orderId: undefined, customerEmail: undefined, shopifyGid: undefined, source: undefined, cancelUrl: undefined, test: false,
    });
  });

  it('parses Shopify hosted-session metadata from URL params', () => {
    expect(parseHostedParams('?amount=12.5&merchant=pk_x&currency=usd&orderId=1001&email=buyer%40example.com&source=shopify&shopify_gid=gid%3A%2F%2Fshopify%2FPaymentSession%2F1&shopify_shop=stablezact-store.myshopify.com&cancel_url=https%3A%2F%2Fshop.example%2Fcancel&test=true')).toEqual({
      amount: '12.5',
      currency: 'USD',
      merchant: 'pk_x',
      orderId: '1001',
      customerEmail: 'buyer@example.com',
      shopifyGid: 'gid://shopify/PaymentSession/1',
      shopifyShopDomain: 'stablezact-store.myshopify.com',
      source: 'shopify',
      cancelUrl: 'https://shop.example/cancel',
      test: true,
    });
  });

  it('parses the manual-payment pilot params (shopify_order_id + callback_url)', () => {
    const parsed = parseHostedParams('?amount=25.5&merchant=pk_x&source=shopify-pilot&shopify_order_id=6100000012345&callback_url=https%3A%2F%2Fpilot.example.com%2Fwebhook%2Fstablezact-paid');
    expect(parsed.shopifyOrderId).toBe('6100000012345');
    expect(parsed.callbackUrl).toBe('https://pilot.example.com/webhook/stablezact-paid');
  });
});
