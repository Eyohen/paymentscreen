import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSignedPayment } from './signedPayment.js';
const address = n => '0x'+n.toString(16).padStart(40, '0');
const hash = '0x'+'ab'.repeat(32);
function setup(overrides = {}) {
  const calls = [];
  const terms = { version: 2, chainId: 8453, contractAddress: address(10), deadline: Math.floor(Date.now()/1000)+600, params: { token: address(1), amount: '100000', paymentId: 'invoice', recipient1: address(2), recipient2: address(3), recipient3: address(0), recipient1Percentage: '9900', recipient2Percentage: '100', recipient3Percentage: '0' } };
  const state = { address: address(4), chainId: 8453 };
  const actions = {
    getAccount: () => state,
    readContract: async c => c.functionName === 'balanceOf' ? 1000000n : 1n,
    simulateContract: async c => { calls.push(['simulate', c.functionName]); return { request: c }; },
    writeContract: async c => { calls.push(['write', c.functionName, c.args]); return hash; },
    waitForTransactionReceipt: async () => { calls.push(['mined']); return { status: 'success', transactionHash: hash }; },
    ...overrides
  };
  const input = { paymentId: 'invoice', terms, payer: state.address, actions,
    requestApproval: async payer => { calls.push(['authorize']); return { ...structuredClone(terms), payer, signature: '0x1234' }; },
    verify: async () => { calls.push(['verify']); }, onSubmitted: () => calls.push(['submitted']) };
  return { input, state, calls };
}
test('approval, zero reset, exact amount, signed call, mined receipt and server verification run in order', async () => {
  const { input, calls } = setup();
  assert.equal(await executeSignedPayment(input), hash);
  assert.deepEqual(calls.map(c=>c[0]), ['authorize','simulate','write','mined','simulate','write','mined','simulate','write','mined','submitted','verify']);
  const writes = calls.filter(c=>c[0]==='write');
  assert.equal(writes[0][2][1], 0n); assert.equal(writes[1][2][1],100000n);
  assert.equal(writes[2][2][2], '0x1234');
});
test('sufficient allowance skips approvals', async () => {
  const { input, calls } = setup({ readContract: async () => 1000000n });
  await executeSignedPayment(input); assert.equal(calls.filter(c=>c[0]==='write').length,1);
});
for (const field of ['amount','token','paymentId','recipient1','recipient2','recipient3','recipient1Percentage','recipient2Percentage','recipient3Percentage']) {
  test(`substituted approval ${field} cannot reach wallet`, async () => {
    const {input, calls} = setup();
    input.requestApproval = async payer => ({ ...input.terms, params: {...input.terms.params,[field]:'999'}, payer, signature:'0x1234' });
    await assert.rejects(executeSignedPayment(input), /changed the invoice/); assert.equal(calls.length,0);
  });
}
for (const field of ['payer','contractAddress','chainId','deadline']) {
  test(`substituted approval ${field} rejected`, async () => {
    const {input} = setup(); input.requestApproval = async payer => ({...input.terms,payer,signature:'0x1234',[field]:0});
    await assert.rejects(executeSignedPayment(input), /did not match/);
  });
}
test('changing wallet during approval request aborts without wallet writes', async () => {
  const {input,state,calls} = setup(); const original = input.requestApproval;
  input.requestApproval = async payer => { const r=await original(payer); state.address=address(5); return r; };
  await assert.rejects(executeSignedPayment(input), /Wallet or network changed/); assert.equal(calls.length,1);
});
test('changing chain while simulation is pending aborts submission', async () => {
  const {input,state,calls} = setup(); input.actions.simulateContract = async c => {state.chainId=1;return {request:c};};
  await assert.rejects(executeSignedPayment(input), /Wallet or network changed/); assert.equal(calls.filter(c=>c[0]==='write').length,0);
});
test('failed receipt cannot reach payment submission or success verification', async () => {
  const {input,calls} = setup({waitForTransactionReceipt: async()=>({status:'reverted'})});
  await assert.rejects(executeSignedPayment(input), /did not complete/); assert.equal(calls.some(c=>c[1]==='splitPayment'),false);
});
test('verification failure retains transaction reference and rejects success', async () => {
  const {input,calls} = setup(); input.verify=async()=>{throw new Error('Still pending');};
  await assert.rejects(executeSignedPayment(input), /Still pending/); assert.equal(calls.at(-1)[0],'submitted');
});
test('expired invoice cannot request a signature or token approval', async () => {
  const {input,calls}=setup(); input.terms.deadline=1;
  await assert.rejects(executeSignedPayment(input), /expired/); assert.equal(calls.length,0);
});
