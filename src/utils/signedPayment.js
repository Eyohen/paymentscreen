import { erc20Abi, parseAbi, isAddress } from 'viem';

export const signedSplitterAbi = parseAbi([
  'function splitPayment((address token,uint256 amount,string paymentId,address recipient1,address recipient2,address recipient3,uint256 recipient1Percentage,uint256 recipient2Percentage,uint256 recipient3Percentage) params,uint256 deadline,bytes signature)'
]);
const sameAddress = (a, b) => isAddress(a) && isAddress(b) && a.toLowerCase() === b.toLowerCase();

// Dependencies are the real wagmi actions in the UI; tests drive the same lifecycle.
export async function executeSignedPayment({ paymentId, terms, payer, requestApproval, verify, actions, onSubmitted = () => {} }) {
  if (!terms || terms.version !== 2 || terms.chainId !== 8453 || terms.params?.paymentId !== paymentId) throw new Error('Invalid signed invoice');
  const checkWallet = () => {
    const account = actions.getAccount();
    if (!sameAddress(account.address, payer) || account.chainId !== terms.chainId) throw new Error('Wallet or network changed. Reconnect and try again.');
    if (terms.deadline <= Math.floor(Date.now() / 1000)) throw new Error('Payment expired. Request a new invoice.');
  };
  checkWallet();
  const approved = await requestApproval(payer);
  checkWallet();
  if (!approved || !sameAddress(approved.payer, payer) || !sameAddress(approved.contractAddress, terms.contractAddress) ||
      approved.chainId !== terms.chainId || approved.deadline !== terms.deadline || approved.version !== 2 ||
      typeof approved.signature !== 'string' || !/^0x[0-9a-f]+$/i.test(approved.signature)) throw new Error('Payment approval did not match this invoice');
  for (const [field, value] of Object.entries(terms.params)) {
    const actual = approved.params?.[field];
    const isAddressField = field === 'token' || (field.startsWith('recipient') && !field.endsWith('Percentage'));
    const matches = isAddressField ? sameAddress(actual, value) : String(actual) === String(value);
    if (!matches) throw new Error('Payment approval changed the invoice details');
  }
  const amount = BigInt(terms.params.amount);
  const tokenCall = { address: terms.params.token, abi: erc20Abi, chainId: terms.chainId };
  const balance = await actions.readContract({ ...tokenCall, functionName: 'balanceOf', args: [payer] });
  if (balance < amount) throw new Error('Insufficient token balance');
  const allowance = await actions.readContract({ ...tokenCall, functionName: 'allowance', args: [payer, terms.contractAddress] });
  const submit = async call => {
    checkWallet();
    const { request } = await actions.simulateContract({ ...call, account: payer, chainId: terms.chainId });
    checkWallet();
    const hash = await actions.writeContract(request);
    const receipt = await actions.waitForTransactionReceipt({ hash, chainId: terms.chainId, confirmations: 2 });
    if (receipt.status !== 'success') throw new Error('Transaction did not complete');
    return receipt.transactionHash || hash;
  };
  if (allowance < amount) {
    if (allowance > 0n) await submit({ ...tokenCall, functionName: 'approve', args: [terms.contractAddress, 0n] });
    await submit({ ...tokenCall, functionName: 'approve', args: [terms.contractAddress, amount] });
  }
  const hash = await submit({ address: terms.contractAddress, abi: signedSplitterAbi, functionName: 'splitPayment', args: [terms.params, BigInt(terms.deadline), approved.signature] });
  onSubmitted(hash);
  // A mined transaction alone is not an order-completion acknowledgement.
  await verify(hash);
  return hash;
}
