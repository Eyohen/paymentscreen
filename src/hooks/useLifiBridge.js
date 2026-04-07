import { useState, useCallback } from 'react';
import { LIFI_API_URL, LIFI_API_KEY, LIFI_INTEGRATOR, CHAIN_ID_TO_SHORT_NAME, NATIVE_TOKEN_ADDRESS } from '../config/lifiConfig';

const createDebugId = (prefix = 'lifi-screen') =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useBridge = () => {
    const [bridgeStatus, setBridgeStatus] = useState('idle');
    const [bridgeQuote, setBridgeQuote] = useState(null);
    const [bridgeError, setBridgeError] = useState(null);
    const [bridgeChains, setBridgeChains] = useState([]);

    const headers = {
        'Content-Type': 'application/json',
        ...(LIFI_API_KEY ? { 'x-lifi-api-key': LIFI_API_KEY } : {})
    };

    const fetchBridgeChains = useCallback(async () => {
        try {
            const response = await fetch(`${LIFI_API_URL}/chains?chainTypes=EVM`, {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`Li.Fi API returned ${response.status}`);
            }

            const data = await response.json();
            const chains = data.chains || data || [];
            setBridgeChains(chains);
            return chains;
        } catch (error) {
            console.warn('[LiFiBridge] Failed to fetch chains:', error.message);
            setBridgeChains([]);
            return [];
        }
    }, []);

    const getBridgeQuote = useCallback(async (
        originChainId, destChainId,
        originTokenAddress, originTokenSymbol, originTokenDecimals,
        destTokenAddress, destTokenSymbol,
        amount, recipient,
        _originBridgeTokens, _destBridgeTokens,
        user,
        debugId = createDebugId()
    ) => {
        setBridgeStatus('quoting');
        setBridgeError(null);
        // Keep the previous quote available during re-quote to prevent
        // executePayment from seeing null and taking the wrong code path.
        // The quote is replaced atomically when the new one arrives.

        try {
            const resolvedOriginAddress = (!originTokenAddress || originTokenAddress === 'native' || originTokenAddress.length < 10)
                ? NATIVE_TOKEN_ADDRESS
                : originTokenAddress;
            const resolvedDestAddress = (!destTokenAddress || destTokenAddress.length < 10)
                ? NATIVE_TOKEN_ADDRESS
                : destTokenAddress;

            const normalizedOriginSymbol = (originTokenSymbol || '').toUpperCase();
            const normalizedDestSymbol = (destTokenSymbol || '').toUpperCase();
            const isSameToken = normalizedOriginSymbol && normalizedDestSymbol
                ? normalizedOriginSymbol === normalizedDestSymbol
                : resolvedOriginAddress.toLowerCase() === resolvedDestAddress.toLowerCase();
            const isSameChain = originChainId === destChainId;
            const isSwap = !isSameToken;
            const destDecimals = 6;
            const toAmountRaw = BigInt(Math.ceil(parseFloat(amount) * Math.pow(10, destDecimals))).toString();
            const fromAmountRaw = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, originTokenDecimals || 18))).toString();
            const useExactOutputQuote = true;

            const params = new URLSearchParams({
                fromChain: originChainId.toString(),
                toChain: destChainId.toString(),
                fromToken: resolvedOriginAddress,
                toToken: resolvedDestAddress,
                fromAddress: user || recipient,
                toAddress: recipient,
                integrator: LIFI_INTEGRATOR,
                fee: '0',
                slippage: '0.005',
                order: 'CHEAPEST',
            });
            if (useExactOutputQuote) {
                params.set('toAmount', toAmountRaw);
            } else {
                params.set('fromAmount', fromAmountRaw);
            }

            console.log('[LiFiBridge] Requesting quote:', {
                debugId,
                fromChain: originChainId,
                toChain: destChainId,
                fromToken: `${originTokenSymbol} (${resolvedOriginAddress.slice(0, 10)}...)`,
                toToken: `${destTokenSymbol} (${resolvedDestAddress.slice(0, 10)}...)`,
                recipient,
                fromAddress: user || recipient,
                requestedAmount: useExactOutputQuote ? toAmountRaw : fromAmountRaw,
                quoteMode: useExactOutputQuote ? 'toAmount' : 'fromAmount',
                isSwap,
                isSameChain
            });

            const endpoint = useExactOutputQuote ? 'quote/toAmount' : 'quote';
            const response = await fetch(`${LIFI_API_URL}/${endpoint}?${params.toString()}`, {
                headers,
                signal: AbortSignal.timeout(20000)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Quote request failed (${response.status})`);
            }

            const quote = await response.json();
            const estimate = quote.estimate || {};
            const feeCosts = estimate.feeCosts || [];
            const gasCosts = estimate.gasCosts || [];
            const totalFee = feeCosts.reduce((sum, item) => sum + parseFloat(item.amountUSD || 0), 0)
                + gasCosts.reduce((sum, item) => sum + parseFloat(item.amountUSD || 0), 0);

            const parsedQuote = {
                debugId,
                raw: quote,
                originChainId,
                destChainId,
                originChainName: CHAIN_ID_TO_SHORT_NAME[originChainId] || `Chain ${originChainId}`,
                destChainName: CHAIN_ID_TO_SHORT_NAME[destChainId] || `Chain ${destChainId}`,
                originTokenSymbol: originTokenSymbol || quote.action?.fromToken?.symbol || 'Unknown',
                originTokenAddress: resolvedOriginAddress,
                inputAmount: estimate.fromAmountUSD
                    ? `$${parseFloat(estimate.fromAmountUSD).toFixed(2)}`
                    : amount,
                destTokenSymbol: destTokenSymbol || quote.action?.toToken?.symbol || 'USDC',
                destTokenAddress: resolvedDestAddress,
                outputAmount: estimate.toAmountMin
                    ? (parseFloat(estimate.toAmountMin) / Math.pow(10, quote.action?.toToken?.decimals || 6)).toFixed(4)
                    : amount,
                bridgeFee: totalFee > 0 ? totalFee.toFixed(2) : '0',
                bridgeFeeCurrency: 'USD',
                estimatedTime: estimate.executionDuration || 30,
                steps: quote.includedSteps || [],
                tool: quote.tool,
                toolDetails: quote.toolDetails,
                isSwap,
                isSameChain,
                tradeType: useExactOutputQuote ? 'EXACT_OUTPUT' : 'EXACT_INPUT',
                transactionRequest: quote.transactionRequest,
                approvalAddress: estimate.approvalAddress,
            };

            console.log('[LiFiBridge] Quote response:', {
                debugId,
                tool: quote.tool,
                approvalAddress: estimate.approvalAddress,
                toAmount: estimate.toAmount,
                toAmountMin: estimate.toAmountMin,
                fromAmount: estimate.fromAmount,
                executionDuration: estimate.executionDuration,
                includedStepCount: quote.includedSteps?.length || 0,
                transactionRequest: quote.transactionRequest ? {
                    to: quote.transactionRequest.to,
                    chainId: quote.transactionRequest.chainId,
                    hasData: !!quote.transactionRequest.data,
                    hasValue: quote.transactionRequest.value !== undefined
                } : null
            });

            setBridgeQuote(parsedQuote);
            setBridgeStatus('idle');
            return parsedQuote;
        } catch (error) {
            console.warn('[LiFiBridge] Quote failed:', error.message);
            setBridgeQuote(null); // Clear stale quote on error to prevent wrong-recipient execution
            setBridgeError(error.message);
            setBridgeStatus('error');
            return null;
        }
    }, []);

    const executeBridge = useCallback(async (quote, walletClient, onProgress) => {
        setBridgeStatus('bridging');
        setBridgeError(null);

        try {
            const debugId = quote?.debugId || createDebugId();
            const txRequest = quote?.transactionRequest || quote?.raw?.transactionRequest;
            if (!txRequest) {
                throw new Error('Invalid quote: no transaction data');
            }

            if (quote.approvalAddress && quote.originTokenAddress !== NATIVE_TOKEN_ADDRESS) {
                onProgress?.('approving', 'Approving token spend...');
                try {
                    const approveData = '0x095ea7b3' +
                        quote.approvalAddress.slice(2).padStart(64, '0') +
                        'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

                    console.log('[LiFiBridge] Sending approval tx:', {
                        debugId,
                        chainId: quote.originChainId,
                        token: quote.originTokenAddress,
                        approvalAddress: quote.approvalAddress
                    });

                    await walletClient.sendTransaction({
                        to: quote.originTokenAddress,
                        data: approveData,
                        chainId: quote.originChainId
                    });
                    onProgress?.('approving', 'Waiting for approval confirmation...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (error) {
                    console.warn('[LiFiBridge] Approval failed, proceeding:', error.message);
                }
            }

            const action = quote.isSwap ? 'swap' : 'bridge';
            onProgress?.('signing', `Sending ${action} transaction...`);
            console.log('[LiFiBridge] Sending main tx:', {
                debugId,
                action,
                chainId: quote.originChainId,
                txTo: txRequest.to,
                txChainId: txRequest.chainId,
                hasData: !!txRequest.data,
                value: txRequest.value || '0'
            });

            const txHash = await walletClient.sendTransaction({
                to: txRequest.to,
                data: txRequest.data,
                value: txRequest.value ? BigInt(txRequest.value) : 0n,
                chainId: quote.originChainId,
                ...(txRequest.gasLimit ? { gas: BigInt(txRequest.gasLimit) } : {})
            });
            console.log('[LiFiBridge] Main tx submitted:', { debugId, txHash });

            onProgress?.('submitted', `Transaction submitted: ${txHash.slice(0, 10)}...`);
            onProgress?.('confirming', `Confirming ${action}...`);

            const confirmed = await waitForTxReceipt(txHash, quote.originChainId);
            if (!confirmed && !quote.isSameChain) {
                onProgress?.('confirming', 'Waiting for bridge delivery...');
                await pollLiFiStatus(txHash, quote.originChainId, quote.destChainId, debugId);
            }

            setBridgeStatus('completed');
            onProgress?.('completed', `${action} complete!`);
            return { success: true, txHash };
        } catch (error) {
            console.error('[LiFiBridge] Execution failed:', { debugId: quote?.debugId, error });
            setBridgeError(error.message);
            setBridgeStatus('error');
            onProgress?.('error', error.message);
            return { success: false, error: error.message };
        }
    }, []);

    const waitForTxReceipt = async (txHash, chainId) => {
        const maxAttempts = 30;
        const pollInterval = 2000;
        const ALCHEMY_KEY = 'YWG990wOlIikc1tU7-WWTepfU8d1f4dp';
        const chainSlugs = {
            1: 'eth-mainnet',
            8453: 'base-mainnet',
            42161: 'arb-mainnet',
            137: 'polygon-mainnet',
            10: 'opt-mainnet',
            56: 'bnb-mainnet',
            43114: 'avax-mainnet'
        };
        const slug = chainSlugs[chainId];
        if (!slug) return false;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const res = await fetch(`https://${slug}.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'eth_getTransactionReceipt',
                        params: [txHash]
                    }),
                    signal: AbortSignal.timeout(5000)
                });
                const data = await res.json();
                if (data.result?.status === '0x1') return true;
                if (data.result?.status === '0x0') throw new Error('Swap transaction reverted on-chain');
            } catch (error) {
                if (error.message.includes('reverted')) throw error;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return false;
    };

    const pollLiFiStatus = async (txHash, fromChain, toChain, debugId) => {
        const maxAttempts = 60;
        const pollInterval = 3000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await fetch(
                    `${LIFI_API_URL}/status?txHash=${txHash}&fromChain=${fromChain}&toChain=${toChain}`,
                    {
                        method: 'GET',
                        headers,
                        signal: AbortSignal.timeout(10000)
                    }
                );

                if (response.ok) {
                    const status = await response.json();
                    console.log('[LiFiBridge] Status poll:', {
                        debugId,
                        attempt: attempt + 1,
                        status: status.status,
                        substatus: status.substatus,
                        sending: status.sending,
                        receiving: status.receiving,
                        bridge: status.bridge
                    });
                    if (status.status === 'DONE') return true;
                    if (status.status === 'FAILED') {
                        throw new Error('Bridge transaction failed');
                    }
                } else {
                    const errorText = await response.text().catch(() => '');
                    console.warn('[LiFiBridge] Status poll non-200:', {
                        debugId,
                        attempt: attempt + 1,
                        statusCode: response.status,
                        body: errorText.slice(0, 300)
                    });
                }
            } catch (error) {
                if (error.message.includes('failed')) throw error;
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return false;
    };

    const resetBridge = useCallback(() => {
        setBridgeStatus('idle');
        setBridgeQuote(null);
        setBridgeError(null);
    }, []);

    return {
        bridgeStatus,
        bridgeQuote,
        bridgeError,
        bridgeChains,
        fetchBridgeChains,
        fetchRelayChains: fetchBridgeChains,
        getBridgeQuote,
        executeBridge,
        resetBridge
    };
};

export const useLifiBridge = useBridge;
export const useRelayBridge = useBridge;
