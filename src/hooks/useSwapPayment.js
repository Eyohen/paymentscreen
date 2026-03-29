import { useState, useCallback, useRef } from 'react';
import { useRelayBridge } from './useRelayBridge';
import { useWalletTokens } from './useWalletTokens';
import { CHAIN_ID_TO_SHORT_NAME, isStablecoin } from '../config/relayConfig';

const API_URL = import.meta.env.VITE_COINLEY_API_URL || 'https://hub.coinley.io';

// Known USDC addresses on supported chains
const KNOWN_USDC = {
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',   // Base
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',    // Polygon
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',     // Optimism
    56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',     // BSC
    43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',  // Avalanche
};

// Chains that have CREATE2 deposit factories
const DEPOSIT_SUPPORTED_CHAINS = [8453, 56, 42161, 137, 10, 43114, 143];

/**
 * High-level orchestrator hook for swap/bridge payment flow.
 * Coordinates: token discovery → deposit creation → Relay quote → bridge execution → deposit polling.
 */
export const useSwapPayment = () => {
    const [swapStep, setSwapStep] = useState('idle');
    // idle | discovering | selecting | quoting | confirming | bridging | waiting_deposit | completed | error
    const [selectedToken, setSelectedToken] = useState(null);
    const [depositData, setDepositData] = useState(null); // { paymentId, depositAddress }
    const [swapError, setSwapError] = useState(null);
    const [estimatedTime, setEstimatedTime] = useState(null);
    const quoteFetchedAt = useRef(null);

    const relayBridge = useRelayBridge();
    const { walletTokens, loadingTokens, tokenError, fetchWalletTokens, checkChainBalances, resetWalletTokens } = useWalletTokens();

    /**
     * Discover tokens on the connected chain
     */
    const discoverTokens = useCallback(async (walletAddress, chainId, paymentAmount) => {
        setSwapStep('discovering');
        setSwapError(null);
        try {
            const tokens = await fetchWalletTokens(walletAddress, chainId, paymentAmount);
            setSwapStep('selecting');
            return tokens;
        } catch (e) {
            setSwapError(e.message);
            setSwapStep('error');
            return [];
        }
    }, [fetchWalletTokens]);

    /**
     * Discover tokens across all supported chains
     */
    const discoverCrossChainTokens = useCallback(async (walletAddress, paymentAmount) => {
        setSwapStep('discovering');
        setSwapError(null);
        try {
            const allChainIds = DEPOSIT_SUPPORTED_CHAINS;
            const chainsWithBalance = await checkChainBalances(walletAddress, allChainIds);

            // Fetch tokens on each chain with balance, in parallel
            const chainTokenPromises = chainsWithBalance
                .filter(c => c.hasBalance)
                .map(c => fetchWalletTokens(walletAddress, c.chainId, paymentAmount)
                    .then(tokens => tokens.map(t => ({ ...t, chainId: c.chainId, chainName: CHAIN_ID_TO_SHORT_NAME[c.chainId] || `Chain ${c.chainId}` })))
                    .catch(() => [])
                );

            const results = await Promise.all(chainTokenPromises);
            const allTokens = results.flat();

            // Sort: stablecoins first, then by USD value
            allTokens.sort((a, b) => {
                if (!a.isSwapToken && b.isSwapToken) return -1;
                if (a.isSwapToken && !b.isSwapToken) return 1;
                return (b.usdValue || 0) - (a.usdValue || 0);
            });

            setSwapStep('selecting');
            return allTokens;
        } catch (e) {
            setSwapError(e.message);
            setSwapStep('error');
            return [];
        }
    }, [checkChainBalances, fetchWalletTokens]);

    /**
     * Select a token and fetch a Relay quote
     */
    const selectTokenAndQuote = useCallback(async (token, destChainId, paymentAmount, walletAddress) => {
        setSelectedToken(token);
        setSwapStep('quoting');
        setSwapError(null);

        try {
            const originChainId = token.chainId || destChainId;
            const destStablecoinAddress = KNOWN_USDC[destChainId];
            if (!destStablecoinAddress) {
                throw new Error('Unsupported destination chain');
            }

            const originTokenAddress = token.contractAddress === 'native'
                ? '0x0000000000000000000000000000000000000000'
                : token.contractAddress;

            const quote = await relayBridge.getBridgeQuote(
                originChainId,
                destChainId,
                originTokenAddress,
                token.symbol,
                token.decimals || 18,
                destStablecoinAddress,
                'USDC',
                paymentAmount.toString(),
                walletAddress // placeholder recipient, re-quoted with deposit address later
            );

            if (!quote) {
                throw new Error('No swap route available for this token');
            }

            setEstimatedTime(quote.estimatedTime);
            quoteFetchedAt.current = Date.now();
            setSwapStep('confirming');
            return quote;
        } catch (e) {
            setSwapError(e.message);
            setSwapStep('error');
            return null;
        }
    }, [relayBridge]);

    /**
     * Create deposit payment on server, get deposit address
     */
    const createDeposit = useCallback(async (existingPaymentId, amount, destNetwork, apiCredentials, metadata = {}) => {
        try {
            const headers = {};
            if (apiCredentials?.apiKey && apiCredentials?.apiSecret) {
                headers['X-API-Key'] = apiCredentials.apiKey;
                headers['X-API-Secret'] = apiCredentials.apiSecret;
            } else if (apiCredentials?.publicKey) {
                headers['X-Public-Key'] = apiCredentials.publicKey;
            }

            const res = await fetch(`${API_URL}/api/deposits/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({
                    amount,
                    currency: 'USDC',
                    network: destNetwork,
                    existingPaymentId,
                    metadata
                })
            });

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Deposit creation failed: ${err}`);
            }

            const data = await res.json();
            const deposit = {
                paymentId: data.payment?.id || existingPaymentId,
                depositAddress: data.payment?.depositAddress
            };
            setDepositData(deposit);
            return deposit;
        } catch (e) {
            setSwapError(e.message);
            throw e;
        }
    }, []);

    /**
     * Execute the full swap/bridge payment:
     * 1. Create deposit address
     * 2. Re-quote with real deposit address
     * 3. Execute bridge
     * 4. Poll for deposit confirmation
     */
    const executeSwapPayment = useCallback(async ({
        token,
        destChainId,
        paymentAmount,
        existingPaymentId,
        walletAddress,
        walletClient,
        apiCredentials,
        onProgress
    }) => {
        setSwapStep('bridging');
        setSwapError(null);

        try {
            const originChainId = token.chainId || destChainId;
            const destNetwork = CHAIN_ID_TO_SHORT_NAME[destChainId] || 'base';
            const destStablecoinAddress = KNOWN_USDC[destChainId];

            // 1. Create deposit payment
            onProgress?.('creating_deposit', 'Setting up payment...');
            const deposit = await createDeposit(
                existingPaymentId,
                paymentAmount,
                destNetwork,
                apiCredentials,
                {
                    bridgeFrom: CHAIN_ID_TO_SHORT_NAME[originChainId] || `chain-${originChainId}`,
                    bridgeProvider: 'relay.link',
                    sourceToken: token.symbol,
                    sourceChainId: originChainId
                }
            );

            // 2. Re-quote with real deposit address as recipient
            onProgress?.('quoting', 'Getting bridge quote...');
            const originTokenAddress = token.contractAddress === 'native'
                ? '0x0000000000000000000000000000000000000000'
                : token.contractAddress;

            const quote = await relayBridge.getBridgeQuote(
                originChainId,
                destChainId,
                originTokenAddress,
                token.symbol,
                token.decimals || 18,
                destStablecoinAddress,
                'USDC',
                paymentAmount.toString(),
                deposit.depositAddress // real recipient
            );

            if (!quote) {
                throw new Error('Failed to get bridge quote');
            }

            // 3. Execute bridge
            onProgress?.('executing', 'Please confirm in your wallet...');
            const result = await relayBridge.executeBridge(
                quote,
                walletClient,
                (step, message) => {
                    onProgress?.(step, message);
                }
            );

            if (!result?.success) {
                throw new Error(result?.error || 'Bridge transaction failed');
            }

            // 4. Poll for deposit confirmation
            onProgress?.('waiting_deposit', 'Waiting for funds to arrive...');
            setSwapStep('waiting_deposit');

            let detected = false;
            const maxAttempts = 120; // 10 minutes at 5s intervals
            for (let i = 0; i < maxAttempts; i++) {
                try {
                    const statusRes = await fetch(`${API_URL}/api/deposits/status/${deposit.paymentId}`);
                    if (statusRes.ok) {
                        const statusData = await statusRes.json();
                        const status = statusData?.payment?.status;
                        if (status === 'completed' || status === 'swept' || statusData?.payment?.detectedAt) {
                            detected = true;
                            break;
                        }
                    }
                } catch {}
                await new Promise(r => setTimeout(r, 5000));
            }

            setSwapStep('completed');
            onProgress?.('completed', 'Payment confirmed!');

            return {
                success: true,
                transactionHash: result.txHash,
                depositPaymentId: deposit.paymentId,
                depositAddress: deposit.depositAddress,
                bridgePending: !detected
            };
        } catch (e) {
            setSwapError(e.message);
            setSwapStep('error');
            onProgress?.('error', e.message);
            return { success: false, error: e.message };
        }
    }, [relayBridge, createDeposit]);

    /**
     * Reset all swap state
     */
    const reset = useCallback(() => {
        setSwapStep('idle');
        setSelectedToken(null);
        setDepositData(null);
        setSwapError(null);
        setEstimatedTime(null);
        quoteFetchedAt.current = null;
        relayBridge.resetBridge();
        resetWalletTokens();
    }, [relayBridge, resetWalletTokens]);

    return {
        // State
        swapStep,
        selectedToken,
        depositData,
        swapError,
        estimatedTime,
        walletTokens,
        loadingTokens,
        tokenError,
        bridgeQuote: relayBridge.bridgeQuote,
        bridgeStatus: relayBridge.bridgeStatus,

        // Actions
        discoverTokens,
        discoverCrossChainTokens,
        selectTokenAndQuote,
        executeSwapPayment,
        reset,
        setSwapStep,
        setSelectedToken,
    };
};
