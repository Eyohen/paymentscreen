import { useState, useCallback, useRef } from 'react';
import { LIFI_API_URL, LIFI_API_KEY } from '../config/lifiConfig';

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
const LIFI_HEADERS = {
    'Content-Type': 'application/json',
    ...(LIFI_API_KEY ? { 'x-lifi-api-key': LIFI_API_KEY } : {})
};
const TOKEN_LIST_TTL = 10 * 60 * 1000;
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const formatBalance = (balance) => {
    if (balance > 1000000) return `${(balance / 1000000).toFixed(1)}M`;
    if (balance > 1000) return `${(balance / 1000).toFixed(1)}K`;
    if (balance > 1) return balance.toFixed(2);
    return balance.toFixed(6);
};

const isStableSymbol = (symbol) => {
    const upper = (symbol || '').toUpperCase();
    return upper === 'USDC' || upper === 'USDT' || upper === 'DAI';
};

const getLiFiChainTokens = (data, chainId) => {
    if (!data) return [];

    return (
        data?.tokens?.[chainId] ||
        data?.tokens?.[String(chainId)] ||
        data?.[chainId] ||
        data?.[String(chainId)] ||
        []
    );
};

const getNativeInfo = (chainId) => {
    const nativeSymbols = {
        1: { symbol: 'ETH', name: 'Ethereum' },
        10: { symbol: 'ETH', name: 'Ethereum' },
        56: { symbol: 'BNB', name: 'BNB' },
        100: { symbol: 'xDAI', name: 'xDAI' },
        130: { symbol: 'ETH', name: 'Ethereum' },
        137: { symbol: 'POL', name: 'Polygon' },
        143: { symbol: 'MON', name: 'Monad' },
        146: { symbol: 'S', name: 'Sonic' },
        185: { symbol: 'MINT', name: 'Mint' },
        204: { symbol: 'BNB', name: 'BNB' },
        250: { symbol: 'FTM', name: 'Fantom' },
        324: { symbol: 'ETH', name: 'Ethereum' },
        480: { symbol: 'ETH', name: 'Ethereum' },
        592: { symbol: 'ASTR', name: 'Astar' },
        747: { symbol: 'FLOW', name: 'Flow' },
        999: { symbol: 'HYPE', name: 'Hyperliquid' },
        1088: { symbol: 'METIS', name: 'Metis' },
        1101: { symbol: 'ETH', name: 'Ethereum' },
        1329: { symbol: 'SEI', name: 'Sei' },
        1513: { symbol: 'IP', name: 'Story' },
        1868: { symbol: 'ETH', name: 'Ethereum' },
        2000: { symbol: 'RON', name: 'Ronin' },
        2040: { symbol: 'ETH', name: 'MegaETH' },
        2741: { symbol: 'ETH', name: 'Ethereum' },
        4078: { symbol: 'USDT0', name: 'Stable' },
        5000: { symbol: 'MNT', name: 'Mantle' },
        57073: { symbol: 'ETH', name: 'Ethereum' },
        59144: { symbol: 'ETH', name: 'Ethereum' },
        7000: { symbol: 'ZETA', name: 'ZetaChain' },
        8453: { symbol: 'ETH', name: 'Ethereum' },
        33139: { symbol: 'APE', name: 'ApeCoin' },
        42161: { symbol: 'ETH', name: 'Ethereum' },
        42170: { symbol: 'ETH', name: 'Ethereum' },
        42220: { symbol: 'CELO', name: 'Celo' },
        43114: { symbol: 'AVAX', name: 'Avalanche' },
        80094: { symbol: 'BERA', name: 'Berachain' },
        81457: { symbol: 'ETH', name: 'Ethereum' },
        534352: { symbol: 'ETH', name: 'Ethereum' },
    };
    return nativeSymbols[chainId] || { symbol: 'ETH', name: 'Native Token' };
};

const buildTokenEntry = ({
    id,
    symbol,
    name,
    contractAddress,
    decimals,
    balance,
    logo,
    metadataSource = 'fallback',
    usdValue,
    usdPrice
}) => {
    if (!symbol || !name || balance <= 0) return null;

    const stable = isStableSymbol(symbol);
    return {
        id,
        symbol,
        name,
        contractAddress,
        decimals,
        balance,
        balanceFormatted: formatBalance(balance),
        logo: logo || null,
        isSwapToken: !stable,
        isWalletToken: true,
        isStablecoin: stable,
        metadataSource,
        routeStatus: 'unknown',
        ...(usdValue !== undefined ? { usdValue } : {}),
        ...(usdPrice !== undefined ? { usdPrice } : {})
    };
};

export const useWalletTokens = () => {
    const [walletTokens, setWalletTokens] = useState([]);
    const [loadingTokens, setLoadingTokens] = useState(false);
    const [tokenError, setTokenError] = useState(null);
    const balanceCache = useRef({});
    const fallbackListCache = useRef({});
    const fallbackListCacheTime = useRef({});
    const lifiTokenCache = useRef({});
    const lifiTokenCacheTime = useRef({});

    const getFallbackTokenList = useCallback(async (chainId) => {
        const cacheKey = `fallback-${chainId}`;
        if (
            fallbackListCache.current[cacheKey] &&
            fallbackListCacheTime.current[cacheKey] &&
            (Date.now() - fallbackListCacheTime.current[cacheKey]) < TOKEN_LIST_TTL
        ) {
            return fallbackListCache.current[cacheKey];
        }

        const lookup = {};

        try {
            const uniRes = await fetch(UNISWAP_TOKEN_LIST_URL, { signal: AbortSignal.timeout(10000) });
            const uniData = await uniRes.json();
            for (const token of (uniData.tokens || [])) {
                if (token.chainId !== chainId) continue;
                lookup[`${token.chainId}:${token.address.toLowerCase()}`] = {
                    symbol: token.symbol,
                    name: token.name,
                    decimals: token.decimals,
                    logoURI: token.logoURI,
                    address: token.address,
                    chainId: token.chainId,
                };
            }
        } catch (error) {
            console.warn('[WalletTokens] Uniswap list fetch failed:', error.message);
        }

        try {
            const cgSlug = COINGECKO_CHAIN_SLUGS[chainId];
            if (cgSlug) {
                const cgRes = await fetch(`https://tokens.coingecko.com/${cgSlug}/all.json`, {
                    signal: AbortSignal.timeout(10000)
                });
                const cgData = await cgRes.json();
                for (const token of (cgData.tokens || [])) {
                    const key = `${token.chainId}:${token.address.toLowerCase()}`;
                    if (!lookup[key]) {
                        lookup[key] = {
                            symbol: token.symbol,
                            name: token.name,
                            decimals: token.decimals,
                            logoURI: token.logoURI,
                            address: token.address,
                            chainId: token.chainId,
                        };
                    }
                }
            }
        } catch (error) {
            console.warn('[WalletTokens] CoinGecko list fetch failed:', error.message);
        }

        fallbackListCache.current[cacheKey] = lookup;
        fallbackListCacheTime.current[cacheKey] = Date.now();
        console.log(`[WalletTokens] Loaded ${Object.keys(lookup).length} fallback tokens for chain ${chainId}`);
        return lookup;
    }, []);

    const getLiFiTokenCatalog = useCallback(async (chainId) => {
        const cacheKey = `EVM-${chainId}`;
        if (
            lifiTokenCache.current[cacheKey] &&
            lifiTokenCacheTime.current[cacheKey] &&
            (Date.now() - lifiTokenCacheTime.current[cacheKey]) < TOKEN_LIST_TTL
        ) {
            return lifiTokenCache.current[cacheKey];
        }

        const lookup = {};
        try {
            const params = new URLSearchParams({
                chains: chainId.toString(),
                minPriceUSD: '0'
            });
            const response = await fetch(`${LIFI_API_URL}/tokens?${params.toString()}`, {
                headers: LIFI_HEADERS,
                signal: AbortSignal.timeout(15000)
            });
            if (!response.ok) {
                throw new Error(`Li.Fi tokens request failed (${response.status})`);
            }

            const data = await response.json();
            const chainTokens = getLiFiChainTokens(data, chainId);
            for (const token of chainTokens) {
                if (!token.address) continue;
                lookup[token.address.toLowerCase()] = token;
            }
        } catch (error) {
            console.warn(`[WalletTokens] Li.Fi catalog fetch failed for chain ${chainId}:`, error.message);
        }

        lifiTokenCache.current[cacheKey] = lookup;
        lifiTokenCacheTime.current[cacheKey] = Date.now();
        console.log(`[WalletTokens] Loaded ${Object.keys(lookup).length} Li.Fi tokens for chain ${chainId}`);
        return lookup;
    }, []);

    const fetchWalletTokens = useCallback(async (walletAddress, chainId, paymentAmount = 0) => {
        if (!walletAddress || !chainId) {
            setWalletTokens([]);
            return [];
        }

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
            const [lifiCatalog, fallbackList, balancesRes] = await Promise.all([
                getLiFiTokenCatalog(numericChainId),
                getFallbackTokenList(numericChainId),
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

            const tokens = [];
            const tokenBalances = balancesRes.result?.tokenBalances || [];
            const unresolvedBalances = [];
            console.log(`[WalletTokens] Alchemy returned ${tokenBalances.length} tokens, resolving metadata`);

            for (const tb of tokenBalances) {
                if (!tb.tokenBalance || tb.tokenBalance === '0x0' || BigInt(tb.tokenBalance) === 0n) continue;

                const addressKey = tb.contractAddress.toLowerCase();
                const lifiMetadata = lifiCatalog[addressKey];
                const fallbackMetadata = fallbackList[`${numericChainId}:${addressKey}`];
                const metadata = lifiMetadata || fallbackMetadata;
                const decimals = metadata?.decimals || 18;
                const balance = Number(BigInt(tb.tokenBalance)) / Math.pow(10, decimals);

                if (balance < 0.001) continue;

                if (!metadata) {
                    unresolvedBalances.push({ contractAddress: tb.contractAddress, rawBalance: tb.tokenBalance });
                    continue;
                }

                const tokenEntry = buildTokenEntry({
                    id: `wallet-${tb.contractAddress}-${numericChainId}`,
                    symbol: metadata.symbol,
                    name: metadata.name,
                    contractAddress: tb.contractAddress,
                    decimals,
                    balance,
                    logo: metadata.logoURI,
                    metadataSource: lifiMetadata ? 'lifi' : 'fallback'
                });
                if (tokenEntry) tokens.push(tokenEntry);
            }

            // Fetch on-chain metadata for tokens that Li.Fi and fallback lists missed.
            // Common on newer chains (Blast, Monad, etc.) with sparse catalog coverage.
            if (unresolvedBalances.length > 0) {
                console.log(`[WalletTokens] ${unresolvedBalances.length} tokens missing metadata, fetching from Alchemy`);
                const metadataResults = await Promise.all(
                    unresolvedBalances.map(async ({ contractAddress, rawBalance }) => {
                        try {
                            const res = await fetch(`https://${chainSlug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    jsonrpc: '2.0', id: 1,
                                    method: 'alchemy_getTokenMetadata',
                                    params: [contractAddress]
                                }),
                                signal: AbortSignal.timeout(5000)
                            }).then(r => r.json());

                            const md = res.result;
                            if (!md?.symbol) return null;
                            const decimals = md.decimals || 18;
                            const balance = Number(BigInt(rawBalance)) / Math.pow(10, decimals);
                            if (balance < 0.001) return null;

                            return buildTokenEntry({
                                id: `wallet-${contractAddress}-${numericChainId}`,
                                symbol: md.symbol,
                                name: md.name || md.symbol,
                                contractAddress,
                                decimals,
                                balance,
                                logo: md.logo || null,
                                metadataSource: 'alchemy'
                            });
                        } catch {
                            return null;
                        }
                    })
                );
                const resolved = metadataResults.filter(Boolean);
                if (resolved.length > 0) {
                    console.log(`[WalletTokens] Recovered ${resolved.length} tokens via alchemy_getTokenMetadata`);
                    tokens.push(...resolved);
                }
            }

            try {
                const nativeRes = await fetch(`https://${chainSlug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'eth_getBalance',
                        params: [walletAddress, 'latest']
                    }),
                    signal: AbortSignal.timeout(5000)
                }).then(r => r.json());

                const nativeBalance = Number(BigInt(nativeRes.result || '0x0')) / 1e18;
                if (nativeBalance > 0.0001) {
                    const native = getNativeInfo(numericChainId);
                    tokens.push(buildTokenEntry({
                        id: `native-${numericChainId}`,
                        symbol: native.symbol,
                        name: native.name,
                        contractAddress: 'native',
                        decimals: 18,
                        balance: nativeBalance,
                        metadataSource: 'native'
                    }));
                }
            } catch {}

            const metadataValues = [...Object.values(lifiCatalog), ...Object.values(fallbackList)];
            const stablecoins = [
                { symbol: 'USDC', decimals: 6 },
                { symbol: 'USDT', decimals: 6 },
            ];

            for (const stable of stablecoins) {
                const metadata = metadataValues.find(token =>
                    token.chainId === numericChainId && token.symbol?.toUpperCase() === stable.symbol
                );
                if (!metadata?.address) continue;
                if (tokens.some(token => token.contractAddress?.toLowerCase() === metadata.address.toLowerCase())) continue;

                try {
                    const paddedAddress = walletAddress.slice(2).toLowerCase().padStart(64, '0');
                    const callData = `0x70a08231${paddedAddress}`;
                    const balRes = await fetch(`https://${chainSlug}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'eth_call',
                            params: [{ to: metadata.address, data: callData }, 'latest']
                        }),
                        signal: AbortSignal.timeout(5000)
                    }).then(r => r.json());

                    const rawBalance = BigInt(balRes.result || '0x0');
                    if (rawBalance <= 0n) continue;

                    const balance = Number(rawBalance) / Math.pow(10, stable.decimals);
                    const tokenEntry = buildTokenEntry({
                        id: `wallet-${metadata.address}-${numericChainId}`,
                        symbol: stable.symbol,
                        name: metadata.name || stable.symbol,
                        contractAddress: metadata.address,
                        decimals: stable.decimals,
                        balance,
                        logo: metadata.logoURI,
                        metadataSource: lifiCatalog[metadata.address.toLowerCase()] ? 'lifi' : 'fallback'
                    });
                    if (tokenEntry) {
                        tokens.push(tokenEntry);
                        console.log(`[WalletTokens] Found ${stable.symbol} via direct call: ${balance}`);
                    }
                } catch {}
            }

            if (tokens.length > 0) {
                try {
                    const priceAddresses = tokens
                        .filter(token => token.isSwapToken && token.contractAddress !== 'native')
                        .filter(token => EVM_ADDRESS_REGEX.test(token.contractAddress))
                        .map(token => ({
                            network: chainSlug,
                            address: token.contractAddress
                        }));

                    if (priceAddresses.length > 0) {
                        const priceResponse = await fetch(
                            `https://api.g.alchemy.com/prices/v1/${ALCHEMY_API_KEY}/tokens/by-address`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ addresses: priceAddresses }),
                                signal: AbortSignal.timeout(10000)
                            }
                        );
                        if (!priceResponse.ok) {
                            throw new Error(`Alchemy price request failed (${priceResponse.status})`);
                        }
                        const priceRes = await priceResponse.json();

                        for (const item of (priceRes.data || [])) {
                            const usdPrice = item.prices?.find(price => price.currency === 'usd');
                            if (!usdPrice) continue;
                            const price = parseFloat(usdPrice.value);
                            const token = tokens.find(entry =>
                                entry.contractAddress?.toLowerCase() === item.address?.toLowerCase()
                            );
                            if (token && price > 0) {
                                token.usdValue = token.balance * price;
                                token.usdPrice = price;
                            }
                        }
                    }
                } catch (error) {
                    console.warn('[WalletTokens] Alchemy price fetch failed:', error.message);
                }
            }

            const resolvedTokens = tokens.filter(Boolean).sort((a, b) => {
                const aPinned = a.isStablecoin || a.contractAddress === 'native';
                const bPinned = b.isStablecoin || b.contractAddress === 'native';
                if (aPinned && !bPinned) return -1;
                if (!aPinned && bPinned) return 1;
                return (b.usdValue || b.balance) - (a.usdValue || a.balance);
            });

            console.log(`[WalletTokens] ${resolvedTokens.length} tokens after Li.Fi metadata resolution (payment: $${paymentAmount})`);

            balanceCache.current[cacheKey] = { tokens: resolvedTokens, time: Date.now() };
            setWalletTokens(resolvedTokens);
            return resolvedTokens;
        } catch (error) {
            console.warn('[WalletTokens] Failed to fetch:', error.message);
            setTokenError(error.message);
            setWalletTokens([]);
            return [];
        } finally {
            setLoadingTokens(false);
        }
    }, [getFallbackTokenList, getLiFiTokenCatalog]);

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
                            jsonrpc: '2.0',
                            id: 1,
                            method: 'eth_getBalance',
                            params: [walletAddress, 'latest']
                        }),
                        signal: AbortSignal.timeout(5000)
                    }).then(r => r.json());

                    const balance = BigInt(res.result || '0x0');
                    return { chainId: numericId, hasBalance: balance > 0n };
                } catch {
                    return { chainId: numericId, hasBalance: false };
                }
            })
        );

        const chainsWithBalance = new Set();
        for (const result of results) {
            if (result.hasBalance) chainsWithBalance.add(result.chainId);
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
