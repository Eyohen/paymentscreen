import { useState, useCallback, useRef } from 'react';

// Alchemy chain slug mapping
// All Alchemy-supported EVM mainnets (from Alchemy Node API docs)
const ALCHEMY_CHAIN_SLUGS = {
    1: 'eth-mainnet',
    10: 'opt-mainnet',
    56: 'bnb-mainnet',
    100: 'gnosis-mainnet',
    137: 'polygon-mainnet',
    146: 'sonic-mainnet',
    250: 'fantom-mainnet',
    324: 'zksync-mainnet',
    480: 'worldchain-mainnet',
    592: 'astar-mainnet',
    1088: 'metis-mainnet',
    1101: 'polygonzkevm-mainnet',
    1329: 'sei-mainnet',
    2000: 'ronin-mainnet',
    2741: 'abstract-mainnet',
    5000: 'mantle-mainnet',
    7000: 'zetachain-mainnet',
    8453: 'base-mainnet',
    33139: 'apechain-mainnet',
    42161: 'arb-mainnet',
    42170: 'arbnova-mainnet',
    42220: 'celo-mainnet',
    43114: 'avax-mainnet',
    59144: 'linea-mainnet',
    80094: 'berachain-mainnet',
    81457: 'blast-mainnet',
    130: 'unichain-mainnet',
    143: 'monad-mainnet',
    534352: 'scroll-mainnet',
    204: 'opbnb-mainnet',
    747: 'flow-mainnet',
    1868: 'soneium-mainnet',
    4078: 'stable-mainnet',
    999: 'hyperliquid-mainnet',
    2040: 'megaeth-mainnet',
    57073: 'ink-mainnet',
    1513: 'story-mainnet',
    185: 'mint-mainnet',
};

const ALCHEMY_API_KEY = 'YWG990wOlIikc1tU7-WWTepfU8d1f4dp';

// Verified token lists — Uniswap (curated, all chains) + CoinGecko (broader, per-chain)
const UNISWAP_TOKEN_LIST_URL = 'https://tokens.uniswap.org';
const COINGECKO_CHAIN_SLUGS = {
    1: 'ethereum',
    8453: 'base',
    42161: 'arbitrum-one',
    137: 'polygon-pos',
    10: 'optimistic-ethereum',
    56: 'binance-smart-chain',
    43114: 'avalanche',
    42220: 'celo',
};

/**
 * Hook to fetch verified ERC-20 tokens a wallet holds on a given chain.
 * Uses Alchemy for balances + Uniswap token list for verification/filtering.
 * Only shows tokens that are on the verified list — filters out scam airdrops.
 */
export const useWalletTokens = () => {
    const [walletTokens, setWalletTokens] = useState([]);
    const [loadingTokens, setLoadingTokens] = useState(false);
    const [tokenError, setTokenError] = useState(null);
    const balanceCache = useRef({});
    const tokenListCache = useRef(null);
    const tokenListCacheTime = useRef(0);
    const TOKEN_LIST_TTL = 10 * 60 * 1000; // 10 min cache for token list

    /**
     * Fetch and cache verified token lists (Uniswap + CoinGecko).
     * Uniswap list covers all chains. CoinGecko fetched per-chain for broader coverage.
     */
    const getVerifiedTokenList = async (chainId) => {
        const cacheKey = `list-${chainId}`;
        if (tokenListCache.current?.[cacheKey] && (Date.now() - tokenListCacheTime.current) < TOKEN_LIST_TTL) {
            return tokenListCache.current[cacheKey];
        }

        const lookup = {};

        try {
            // Source 1: Uniswap (curated, all chains)
            const uniRes = await fetch(UNISWAP_TOKEN_LIST_URL, {
                signal: AbortSignal.timeout(10000)
            });
            const uniData = await uniRes.json();
            for (const t of (uniData.tokens || [])) {
                if (t.chainId === chainId) {
                    const key = `${t.chainId}:${t.address.toLowerCase()}`;
                    lookup[key] = {
                        symbol: t.symbol,
                        name: t.name,
                        decimals: t.decimals,
                        logoURI: t.logoURI,
                        address: t.address,
                        chainId: t.chainId,
                    };
                }
            }
        } catch (e) {
            console.warn('[WalletTokens] Uniswap list fetch failed:', e.message);
        }

        try {
            // Source 2: CoinGecko (broader coverage, per-chain)
            const cgSlug = COINGECKO_CHAIN_SLUGS[chainId];
            if (cgSlug) {
                const cgRes = await fetch(`https://tokens.coingecko.com/${cgSlug}/all.json`, {
                    signal: AbortSignal.timeout(10000)
                });
                const cgData = await cgRes.json();
                for (const t of (cgData.tokens || [])) {
                    const key = `${t.chainId}:${t.address.toLowerCase()}`;
                    if (!lookup[key]) { // Don't overwrite Uniswap entries (better logos)
                        lookup[key] = {
                            symbol: t.symbol,
                            name: t.name,
                            decimals: t.decimals,
                            logoURI: t.logoURI,
                            address: t.address,
                            chainId: t.chainId,
                        };
                    }
                }
            }
        } catch (e) {
            console.warn('[WalletTokens] CoinGecko list fetch failed:', e.message);
        }

        if (!tokenListCache.current) tokenListCache.current = {};
        tokenListCache.current[cacheKey] = lookup;
        tokenListCacheTime.current = Date.now();
        console.log(`[WalletTokens] Loaded ${Object.keys(lookup).length} verified tokens for chain ${chainId}`);
        return lookup;
    };

    /**
     * Fetch verified tokens the wallet holds on a specific chain.
     */
    const fetchWalletTokens = useCallback(async (walletAddress, chainId, paymentAmount = 0) => {
        if (!walletAddress || !chainId) {
            setWalletTokens([]);
            return [];
        }

        // Handle hex chainIds
        const numericChainId = typeof chainId === 'string' && chainId.startsWith('0x')
            ? parseInt(chainId, 16)
            : parseInt(chainId, 10);

        console.log(`[WalletTokens] Fetching tokens for ${walletAddress} on chain ${numericChainId}`);

        const cacheKey = `${numericChainId}-${walletAddress.toLowerCase()}`;
        if (balanceCache.current[cacheKey] && (Date.now() - balanceCache.current[cacheKey].time) < 30000) {
            setWalletTokens(balanceCache.current[cacheKey].tokens);
            return balanceCache.current[cacheKey].tokens;
        }

        const chainSlug = ALCHEMY_CHAIN_SLUGS[numericChainId];
        if (!chainSlug) {
            setWalletTokens([]);
            return [];
        }

        setLoadingTokens(true);
        setTokenError(null);

        try {
            // Fetch verified token list and wallet balances in parallel
            const [verifiedList, balancesRes] = await Promise.all([
                getVerifiedTokenList(numericChainId),
                fetch(`https://${chainSlug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'alchemy_getTokenBalances',
                        params: [walletAddress, 'erc20']
                    }),
                    signal: AbortSignal.timeout(10000)
                }).then(r => r.json())
            ]);

            const tokenBalances = balancesRes.result?.tokenBalances || [];
            console.log(`[WalletTokens] Alchemy returned ${tokenBalances.length} tokens, checking against verified list`);

            // Filter: non-zero balance AND on verified token list
            const tokens = [];
            for (const tb of tokenBalances) {
                if (!tb.tokenBalance || tb.tokenBalance === '0x0' || BigInt(tb.tokenBalance) === 0n) continue;

                const key = `${numericChainId}:${tb.contractAddress.toLowerCase()}`;
                const verified = verifiedList[key];
                if (!verified) continue; // Not on verified list — skip (likely scam)

                const decimals = verified.decimals;
                const balance = Number(BigInt(tb.tokenBalance)) / Math.pow(10, decimals);
                if (balance < 0.001) continue; // Skip dust

                const upperSymbol = verified.symbol.toUpperCase();
                const isStable = upperSymbol === 'USDC' || upperSymbol === 'USDT' || upperSymbol === 'DAI';

                tokens.push({
                    id: `wallet-${tb.contractAddress}-${numericChainId}`,
                    symbol: verified.symbol,
                    name: verified.name,
                    contractAddress: tb.contractAddress,
                    decimals,
                    balance,
                    balanceFormatted: balance > 1000000
                        ? `${(balance / 1000000).toFixed(1)}M`
                        : balance > 1000
                            ? `${(balance / 1000).toFixed(1)}K`
                            : balance > 1
                                ? balance.toFixed(2)
                                : balance.toFixed(6),
                    logo: verified.logoURI || null,
                    isSwapToken: !isStable,
                    isWalletToken: true,
                });
            }

            tokens.sort((a, b) => b.balance - a.balance);

            // Also check stablecoin balances directly via eth_call
            // (Alchemy's getTokenBalances sometimes misses them)
            const stablecoins = [
                { symbol: 'USDC', name: 'USDC', decimals: 6 },
                { symbol: 'USDT', name: 'USDT', decimals: 6 },
            ];
            for (const stable of stablecoins) {
                // Find this stablecoin's address from the verified list
                const listEntry = Object.values(verifiedList).find(
                    v => v.chainId === numericChainId && v.symbol === stable.symbol
                );
                if (!listEntry) continue;

                // Skip if already found via getTokenBalances
                if (tokens.some(t => t.contractAddress?.toLowerCase() === listEntry.address.toLowerCase())) continue;

                // Direct balanceOf call
                try {
                    const paddedAddr = walletAddress.slice(2).toLowerCase().padStart(64, '0');
                    const callData = `0x70a08231${paddedAddr}`;
                    const balRes = await fetch(`https://${chainSlug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1, method: 'eth_call',
                            params: [{ to: listEntry.address, data: callData }, 'latest']
                        }),
                        signal: AbortSignal.timeout(5000)
                    }).then(r => r.json());

                    const rawBal = BigInt(balRes.result || '0x0');
                    if (rawBal > 0n) {
                        const balance = Number(rawBal) / Math.pow(10, stable.decimals);
                        tokens.push({
                            id: `wallet-${listEntry.address}-${numericChainId}`,
                            symbol: stable.symbol,
                            name: listEntry.name || stable.name,
                            contractAddress: listEntry.address,
                            decimals: stable.decimals,
                            balance,
                            balanceFormatted: balance.toFixed(2),
                            logo: listEntry.logoURI || null,
                            isSwapToken: false,
                            isWalletToken: true,
                        });
                        console.log(`[WalletTokens] Found ${stable.symbol} via direct call: ${balance}`);
                    }
                } catch (e) {
                    // Ignore — just a supplementary check
                }
            }

            // Alchemy Prices API — batch fetch USD prices for all swap tokens
            const alchemyChainSlug = ALCHEMY_CHAIN_SLUGS[numericChainId];
            if (alchemyChainSlug) {
                const swapTokens = tokens.filter(t => t.isSwapToken);

                if (swapTokens.length > 0) {
                    try {
                        const priceAddresses = swapTokens.map(t => ({
                            network: alchemyChainSlug,
                            address: t.contractAddress
                        }));

                        const priceRes = await fetch(
                            `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}/tokens/by-address`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ addresses: priceAddresses }),
                                signal: AbortSignal.timeout(10000)
                            }
                        );
                        const priceData = await priceRes.json();
                        let priceCount = 0;

                        for (const item of (priceData.data || [])) {
                            const usdPrice = item.prices?.find(p => p.currency === 'usd');
                            if (!usdPrice) continue;
                            priceCount++;
                            const price = parseFloat(usdPrice.value);
                            const token = tokens.find(t =>
                                t.contractAddress?.toLowerCase() === item.address?.toLowerCase()
                            );
                            if (token && price > 0) {
                                token.usdValue = token.balance * price;
                                token.usdPrice = price;
                            }
                        }

                        console.log(`[WalletTokens] Alchemy prices fetched for ${priceCount}/${swapTokens.length} tokens`);

                        // Filter: hide swap tokens where USD value < payment amount
                        const filteredTokens = tokens.filter(t => {
                            if (!t.isSwapToken) return true; // Always keep stablecoins
                            if (t.usdValue === undefined) return false; // No price = hide
                            if (paymentAmount > 0) return t.usdValue >= paymentAmount;
                            return t.usdValue >= 0.10; // Default: hide tokens worth < $0.10
                        });

                        tokens.length = 0;
                        tokens.push(...filteredTokens);
                    } catch (e) {
                        console.warn('[WalletTokens] Alchemy price fetch failed:', e.message);
                        // If price fetch fails, keep all tokens (graceful degradation)
                    }
                }
            }

            tokens.sort((a, b) => {
                // Stablecoins first, then by USD value descending
                if (!a.isSwapToken && b.isSwapToken) return -1;
                if (a.isSwapToken && !b.isSwapToken) return 1;
                return (b.usdValue || b.balance) - (a.usdValue || a.balance);
            });

            console.log(`[WalletTokens] ${tokens.length} tokens after price filtering (payment: $${paymentAmount})`);

            balanceCache.current[cacheKey] = { tokens, time: Date.now() };
            setWalletTokens(tokens);
            return tokens;
        } catch (error) {
            console.warn('[WalletTokens] Failed to fetch:', error.message);
            setTokenError(error.message);
            setWalletTokens([]);
            return [];
        } finally {
            setLoadingTokens(false);
        }
    }, []);

    /**
     * Check which chains the wallet has native token balance on.
     * Returns a Set of chainIds where balance > 0.
     * Fast: one eth_getBalance call per chain, all in parallel.
     */
    const checkChainBalances = useCallback(async (walletAddress, chainIds) => {
        if (!walletAddress || !chainIds || chainIds.length === 0) return new Set();

        const results = await Promise.all(
            chainIds.map(async (chainId) => {
                const numericId = typeof chainId === 'string' && chainId.startsWith('0x')
                    ? parseInt(chainId, 16)
                    : parseInt(chainId, 10);
                const slug = ALCHEMY_CHAIN_SLUGS[numericId];
                if (!slug) return { chainId: numericId, hasBalance: false };

                try {
                    const res = await fetch(`https://${slug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0', id: 1,
                            method: 'eth_getBalance',
                            params: [walletAddress, 'latest']
                        }),
                        signal: AbortSignal.timeout(5000)
                    }).then(r => r.json());

                    const balance = BigInt(res.result || '0x0');
                    return { chainId: numericId, hasBalance: balance > 0n };
                } catch {
                    // If check fails, assume chain has balance (don't hide it)
                    return { chainId: numericId, hasBalance: true };
                }
            })
        );

        const chainsWithBalance = new Set();
        for (const r of results) {
            if (r.hasBalance) chainsWithBalance.add(r.chainId);
        }
        console.log(`[WalletTokens] Chain balance check: ${chainsWithBalance.size}/${chainIds.length} chains have native balance`);
        return chainsWithBalance;
    }, []);

    const resetWalletTokens = useCallback(() => {
        setWalletTokens([]);
        setTokenError(null);
    }, []);

    return {
        walletTokens,
        loadingTokens,
        tokenError,
        fetchWalletTokens,
        resetWalletTokens,
        checkChainBalances,
        ALCHEMY_CHAIN_SLUGS
    };
};
