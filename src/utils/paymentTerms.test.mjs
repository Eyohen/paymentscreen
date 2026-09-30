import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBasisPoints, parseBasisPoints, mergeWithBackend, validateSplit, BACKEND_ONLY_FIELDS } from './paymentTerms.js';

test('toBasisPoints round-trips every basis-point value the server can send', () => {
  // The public endpoint sends basisPoints / 100; parseInt(x * 100) lost 1bp on 573 values
  for (let bp = 0; bp <= 10000; bp++) {
    assert.equal(toBasisPoints(bp / 100), String(bp));
  }
  assert.equal(toBasisPoints(null), '');
  assert.equal(toBasisPoints(undefined), '');
  assert.equal(toBasisPoints('abc'), '');
});

test('parseBasisPoints rejects anything that is not whole basis points', () => {
  assert.equal(parseBasisPoints('9900'), 9900);
  assert.equal(parseBasisPoints('0'), 0);
  for (const bad of ['', null, undefined, '99.5', '-1', '10001', 'abc', '1e3']) {
    assert.equal(parseBasisPoints(bad), null, String(bad));
  }
});

const backend = {
  amount: '1.5', amountInWei: '', token: 'USDC', network: 'Base', networkShortName: 'base',
  chainId: 8453, contractAddress: '0xSplitter', tokenContract: '0xUSDC', tokenDecimals: '6',
  recipient1: '0xMerchant', recipient2: '0xFee', recipient3: '',
  recipient1Percentage: '9900', recipient2Percentage: '100', merchant: 'Shop'
};

test('backend values win over every money field in the URL', () => {
  const url = {
    paymentId: 'p1', merchant: 'Evil', amount: '0.01', amountInWei: '1', token: 'FAKE',
    chainId: '1', contractAddress: '0xEvilSplitter', tokenContract: '0xEvilToken', tokenDecimals: '18',
    recipient1: '0xAttacker', recipient2: '0xAttacker', recipient3: '0xAttacker',
    recipient1Percentage: '10000', recipient2Percentage: '0', recipient3Percentage: '0'
  };
  const merged = mergeWithBackend(url, backend);
  for (const field of ['amount', 'token', 'chainId', 'contractAddress', 'tokenContract', 'tokenDecimals', 'recipient1', 'recipient2', 'recipient1Percentage', 'recipient2Percentage']) {
    assert.equal(merged[field], backend[field], field);
  }
  assert.equal(merged.amountInWei, '');
  assert.equal(merged.recipient3, '0x0000000000000000000000000000000000000000');
  assert.equal(merged.recipient3Percentage, '0');
  assert.equal(merged.merchant, 'Shop');
  assert.equal(merged.paymentId, 'p1');
});

test('a URL money field never fills a gap the backend left empty', () => {
  const merged = mergeWithBackend({ recipient1: '0xAttacker' }, { ...backend, recipient1: '' });
  assert.equal(merged.recipient1, '');
  assert.ok(BACKEND_ONLY_FIELDS.includes('recipient1'));
});

test('no backend payment means no payment', () => {
  assert.throws(() => mergeWithBackend({ recipient1: '0xAttacker', amount: '1' }, null), /could not be loaded/);
});

test('validateSplit refuses a missing split instead of defaulting to 10000/0', () => {
  assert.equal(validateSplit({ recipient1Percentage: '9900', recipient2Percentage: '100' }), null);
  assert.match(validateSplit({ recipient1Percentage: '', recipient2Percentage: '' }), /incomplete/);
  assert.match(validateSplit({ recipient1Percentage: '9900', recipient2Percentage: '' }), /incomplete/);
  assert.match(validateSplit({ recipient1Percentage: '0', recipient2Percentage: '10000' }), /incomplete/);
  assert.match(validateSplit({ recipient1Percentage: '9900', recipient2Percentage: '200' }), /exceeds/);
});
