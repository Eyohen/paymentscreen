import { useState, useRef, useCallback } from 'react';
import { RELAY_API_URL, CHAIN_ID_TO_SHORT_NAME, getBridgeTokenAddress, getBridgeTokenDecimals, isStablecoin } from '../config/relayConfig';

/**
 * Hook for cross-chain bridging and token swaps via Relay.link
 *
 * Supports:
 * - Cross-chain bridging (USDC on ETH -> USDC on Base)
 * - Same-chain swaps (PEPE -> USDC on Base)
 * - Cross-chain swap+bridge (PEPE on ETH -> USDC on Base)
 *
 * Designed for graceful degradation -- if Relay is unavailable, swap/bridge
 * options simply don't appear and direct payments work as before.
 */
export const useRelayBridge = () => {
    const [bridgeStatus, setBridgeStatus] = useState('idle'); // idle | quoting | bridging | switching | completed | error
    const [bridgeQuote, setBridgeQuote] = useState(null);
    const [bridgeError, setBridgeError] = useState(null);
    const [bridgeChains, setBridgeChains] = useState([]);
    const chainsCache = useRef(null);
    const chainsCacheTime = useRef(0);
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Fetch available chains from Relay API.
     * Results are cached for 5 minutes.
     */
    const fetchRelayChains = useCallback(async () => {
        if (chainsCache.current && (Date.now() - chainsCacheTime.current) < CACHE_TTL) {
            setBridgeChains(chainsCache.current);
            return chainsCache.current;
        }

        try {
            const response = await fetch(`${RELAY_API_URL}/chains`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`Relay API returned ${response.status}`);
            }

            const data = await response.json();
            const chains = data.chains || data || [];

            chainsCache.current = chains;
            chainsCacheTime.current = Date.now();
            setBridgeChains(chains);

            return chains;
        } catch (error) {
            console.warn('[RelayBridge] Failed to fetch chains:', error.message);
            setBridgeChains([]);
            return [];
        }
    }, []);

    /**
     * Get a swap/bridge quote from Relay.
     *
     * For stablecoin-to-stablecoin (bridge only): uses EXACT_INPUT.
     * For any-token-to-stablecoin (swap or swap+bridge): uses EXACT_OUTPUT
     * so the merchant receives the exact amount needed.
     *
     * @param {number} originChainId - Source chain ID
     * @param {number} destChainId - Destination chain ID
     * @param {string} originTokenAddress - ERC-20 address of the input token (customer's token)
     * @param {string} originTokenSymbol - Symbol of input token (for display)
     * @param {number} originTokenDecimals - Decimals of input token
     * @param {string} destTokenAddress - ERC-20 address of the output token (merchant's stablecoin)
     * @param {string} destTokenSymbol - Symbol of output token (USDC/USDT)
     * @param {string} amount - Amount in human-readable format (the merchant's required amount)
     * @param {string} recipient - Address to receive the output tokens (deposit address or customer wallet)
     * @param {Object} originBridgeTokens - { usdc, usdt } from extractBridgeTokens (for legacy bridge-only calls)
     * @param {Object} destBridgeTokens - { usdc, usdt } from extractBridgeTokens (for legacy bridge-only calls)
     * @returns {Object|null} - Quote object or null on failure
     */
    const getBridgeQuote = useCallback(async (
        originChainId, destChainId,
        originTokenAddress, originTokenSymbol, originTokenDecimals,
        destTokenAddress, destTokenSymbol,
        amount, recipient,
        originBridgeTokens, destBridgeTokens,
        user // Optional: signer address if different from recipient (cross-VM bridges)
    ) => {
        setBridgeStatus('quoting');
        setBridgeError(null);
        setBridgeQuote(null);

        try {
            // Resolve token addresses — support legacy call signature (tokenSymbol-based)
            let resolvedOriginAddress = originTokenAddress;
            let resolvedDestAddress = destTokenAddress;
            let resolvedOriginDecimals = originTokenDecimals || 18;

            // Legacy compatibility: if originTokenAddress looks like a symbol (e.g. "USDC"),
            // resolve it from bridgeTokens
            if (!resolvedOriginAddress || resolvedOriginAddress.length < 10) {
                const tokenSymbol = originTokenAddress || originTokenSymbol;
                resolvedOriginAddress = getBridgeTokenAddress(tokenSymbol, originBridgeTokens);
                resolvedOriginDecimals = getBridgeTokenDecimals(tokenSymbol, originBridgeTokens);
            }
            if (!resolvedDestAddress || resolvedDestAddress.length < 10) {
                const tokenSymbol = destTokenAddress || destTokenSymbol;
                resolvedDestAddress = getBridgeTokenAddress(tokenSymbol, destBridgeTokens);
            }

            if (!resolvedOriginAddress || !resolvedDestAddress) {
                throw new Error(`Token not supported for swapping/bridging on selected chains`);
            }

            // Determine if this is a swap (different tokens) or a bridge (same token, different chains)
            const isSameToken = resolvedOriginAddress.toLowerCase() === resolvedDestAddress.toLowerCase();
            const isSameChain = originChainId === destChainId;
            const isSwap = !isSameToken;

            // For swaps: use EXACT_OUTPUT so merchant gets exact amount
            // For bridges: use EXACT_INPUT (same token, just moving chains)
            const tradeType = isSwap ? 'EXACT_OUTPUT' : 'EXACT_INPUT';

            // For EXACT_OUTPUT: amount is the desired output (stablecoin, 6 decimals)
            // For EXACT_INPUT: amount is the input
            const destDecimals = 6; // USDC/USDT always 6 decimals
            const amountInSmallestUnit = tradeType === 'EXACT_OUTPUT'
                ? BigInt(Math.floor(parseFloat(amount) * Math.pow(10, destDecimals))).toString()
                : BigInt(Math.floor(parseFloat(amount) * Math.pow(10, resolvedOriginDecimals))).toString();

            const quoteBody = {
                user: user || recipient, // Signer on origin chain
                originChainId,
                destinationChainId: destChainId,
                originCurrency: resolvedOriginAddress,
                destinationCurrency: resolvedDestAddress,
                amount: amountInSmallestUnit,
                recipient, // Receiver on destination chain
                tradeType
            };

            console.log('[RelayBridge] Requesting quote:', {
                ...quoteBody,
                isSwap,
                isSameChain,
                tradeType,
                originSymbol: originTokenSymbol,
                destSymbol: destTokenSymbol
            });

            const response = await fetch(`${RELAY_API_URL}/quote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quoteBody),
                signal: AbortSignal.timeout(15000)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Quote request failed (${response.status})`);
            }

            const quote = await response.json();

            // Parse the quote for display
            const parsedQuote = {
                raw: quote,
                originChainId,
                destChainId,
                originChainName: CHAIN_ID_TO_SHORT_NAME[originChainId] || `Chain ${originChainId}`,
                destChainName: CHAIN_ID_TO_SHORT_NAME[destChainId] || `Chain ${destChainId}`,
                // Input token info
                originTokenSymbol: originTokenSymbol || 'Unknown',
                originTokenAddress: resolvedOriginAddress,
                inputAmount: quote.details?.currencyIn?.amountFormatted || amount,
                // Output token info
                destTokenSymbol: destTokenSymbol || 'USDC',
                destTokenAddress: resolvedDestAddress,
                outputAmount: quote.details?.currencyOut?.amountFormatted || amount,
                // Fee and timing
                bridgeFee: quote.fees?.relayer?.amountFormatted || quote.fees?.gas?.amountFormatted || '0',
                bridgeFeeCurrency: quote.fees?.relayer?.currency?.symbol || quote.fees?.gas?.currency?.symbol || destTokenSymbol,
                estimatedTime: quote.details?.timeEstimate || 30,
                steps: quote.steps || [],
                // Swap metadata
                isSwap,
                isSameChain,
                tradeType
            };

            setBridgeQuote(parsedQuote);
            setBridgeStatus('idle');
            return parsedQuote;
        } catch (error) {
            console.warn('[RelayBridge] Quote failed:', error.message);
            setBridgeError(error.message);
            setBridgeStatus('error');
            return null;
        }
    }, []);

    /**
     * Execute a bridge/swap transaction using the Relay quote.
     * Iterates through Relay's returned steps and sends transactions.
     *
     * @param {Object} quote - The parsed quote from getBridgeQuote
     * @param {Object} walletClient - viem WalletClient for signing
     * @param {Function} onProgress - Progress callback (step, message)
     * @returns {Object} - { success: boolean, txHash: string }
     */
    const executeBridge = useCallback(async (quote, walletClient, onProgress) => {
        setBridgeStatus('bridging');
        setBridgeError(null);

        try {
            if (!quote?.raw?.steps || quote.raw.steps.length === 0) {
                throw new Error('Invalid quote: no steps found');
            }

            const action = quote.isSwap ? 'swap' : 'bridge';
            onProgress?.('starting', `Initiating ${action} transaction...`);

            const steps = quote.raw.steps;
            let lastTxHash = null;

            for (let i = 0; i < steps.length; i++) {
                const step = steps[i];
                const items = step.items || [];

                for (let j = 0; j < items.length; j++) {
                    const item = items[j];
                    const txData = item.data;

                    if (!txData) continue;

                    const stepLabel = step.id === 'approve' ? 'Approving token' : `${action} transaction`;
                    onProgress?.('signing', `${stepLabel} (${i + 1}/${steps.length})...`);

                    const txHash = await walletClient.sendTransaction({
                        to: txData.to,
                        data: txData.data,
                        value: txData.value ? BigInt(txData.value) : 0n,
                        chainId: quote.originChainId
                    });

                    lastTxHash = txHash;
                    onProgress?.('submitted', `Transaction submitted: ${txHash.slice(0, 10)}...`);

                    // Determine how to wait for confirmation based on step type
                    if (step.id === 'approve') {
                        // Approve step: just wait briefly for on-chain confirmation
                        onProgress?.('confirming', 'Confirming approval...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                        // Same-chain swap: tx is self-executed, wait for on-chain receipt
                        onProgress?.('confirming', 'Confirming swap on blockchain...');
                        // Poll for tx receipt via a simple eth_getTransactionReceipt check
                        const confirmed = await waitForTxReceipt(lastTxHash, quote.originChainId);
                        if (!confirmed) {
                            // Fallback: try Relay status if tx receipt polling failed
                            const relayConfirmed = await pollBridgeStatus(lastTxHash, quote.originChainId);
                            if (!relayConfirmed) {
                                console.warn(`[RelayBridge] Same-chain swap confirmation timed out, proceeding...`);
                            }
                        }
                    }
                }
            }

            setBridgeStatus('completed');
            onProgress?.('completed', `${quote.isSwap ? 'Swap' : 'Bridge'} complete!`);

            return { success: true, txHash: lastTxHash };
        } catch (error) {
            console.error('[RelayBridge] Execution failed:', error);
            setBridgeError(error.message);
            setBridgeStatus('error');
            onProgress?.('error', error.message);
            return { success: false, error: error.message };
        }
    }, []);

    /**
     * Wait for a transaction receipt on-chain (for same-chain swaps).
     * Much faster than polling Relay's intent status.
     */
    const waitForTxReceipt = async (txHash, chainId) => {
        const maxAttempts = 30; // 60 seconds (2s intervals)
        const pollInterval = 2000;

        // Use Alchemy RPC to check tx receipt
        const ALCHEMY_KEY = 'YWG990wOlIikc1tU7-WWTepfU8d1f4dp';
        const chainSlugs = { 1: 'eth-mainnet', 8453: 'base-mainnet', 42161: 'arb-mainnet', 137: 'polygon-mainnet', 10: 'opt-mainnet', 56: 'bnb-mainnet', 43114: 'avax-mainnet' };
        const slug = chainSlugs[chainId];
        if (!slug) return false;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const res = await fetch(`https://${slug}.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0', id: 1,
                        method: 'eth_getTransactionReceipt',
                        params: [txHash]
                    }),
                    signal: AbortSignal.timeout(5000)
                });
                const data = await res.json();
                if (data.result && data.result.status) {
                    const success = data.result.status === '0x1';
                    if (success) return true;
                    if (data.result.status === '0x0') throw new Error('Swap transaction reverted on-chain');
                }
            } catch (error) {
                if (error.message.includes('reverted')) throw error;
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        return false;
    };

    /**
     * Poll Relay API for transaction status (for cross-chain intents).
     * Returns true when confirmed on the destination chain.
     */
    const pollBridgeStatus = async (txHash, chainId) => {
        const maxAttempts = 60; // 2 minutes (2s intervals)
        const pollInterval = 2000;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await fetch(
                    `${RELAY_API_URL}/intents/status?txHash=${txHash}&chainId=${chainId}`,
                    {
                        method: 'GET',
                        headers: { 'Content-Type': 'application/json' },
                        signal: AbortSignal.timeout(10000)
                    }
                );

                if (response.ok) {
                    const status = await response.json();
                    if (status.status === 'success' || status.status === 'confirmed') {
                        return true;
                    }
                    if (status.status === 'failed') {
                        throw new Error('Transaction failed on-chain');
                    }
                }
            } catch (error) {
                if (error.message.includes('failed on-chain')) throw error;
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        return false;
    };

    /**
     * Reset bridge/swap state
     */
    const resetBridge = useCallback(() => {
        setBridgeStatus('idle');
        setBridgeQuote(null);
        setBridgeError(null);
    }, []);

    return {
        // State
        bridgeStatus,
        bridgeQuote,
        bridgeError,
        bridgeChains,

        // Actions
        fetchRelayChains,
        getBridgeQuote,
        executeBridge,
        resetBridge
    };
};
