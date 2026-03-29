/**
 * Relay.link Cross-Chain Bridge & Swap Configuration
 *
 * Enables customers to pay from any EVM chain and with any token by
 * swapping/bridging to the merchant's preferred stablecoin via Relay.
 *
 * Token addresses are fetched dynamically from Relay's /chains API
 * (via featuredTokens) and /currencies/v2 endpoint.
 */

export const RELAY_API_URL = 'https://api.relay.link';

// Priority order for selecting the best destination chain (cheapest/fastest first)
export const BRIDGE_DESTINATION_PRIORITY = [
    'base',       // ~$0.03 fees
    'arbitrum',   // ~$0.50 fees
    'optimism',   // ~$0.60 fees
    'polygon',    // ~$0.01 fees
    'bsc',        // ~$0.02 fees
    'avalanche',  // Low fees
    'celo',       // Low fees
    'ethereum'    // High fees (last resort)
];

// Map Coinley network shortNames to chain IDs (same as chainConfig CHAIN_IDS)
export const RELAY_CHAIN_ID_MAP = {
    ethereum: 1,
    bsc: 56,
    polygon: 137,
    arbitrum: 42161,
    optimism: 10,
    avalanche: 43114,
    celo: 42220,
    base: 8453
};

// Reverse map: chain ID -> Coinley shortName
export const CHAIN_ID_TO_SHORT_NAME = Object.fromEntries(
    Object.entries(RELAY_CHAIN_ID_MAP).map(([name, id]) => [id, name])
);

// Native token address (used by Relay for ETH, MATIC, BNB, etc.)
export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

// Popular non-stablecoin tokens per chain (for wallet balance checks)
// These are the top tokens customers are likely to hold
export const POPULAR_TOKENS_BY_CHAIN = {
    1: [ // Ethereum
        { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
        { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
        { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
        { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
        { symbol: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18 },
    ],
    8453: [ // Base
        { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        { symbol: 'cbETH', address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
    ],
    42161: [ // Arbitrum
        { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
        { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
        { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
    ],
    137: [ // Polygon
        { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
        { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
        { symbol: 'WBTC', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
        { symbol: 'LINK', address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18 },
    ],
    10: [ // Optimism
        { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        { symbol: 'OP', address: '0x4200000000000000000000000000000000000042', decimals: 18 },
        { symbol: 'WBTC', address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 },
    ],
    56: [ // BSC
        { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
        { symbol: 'BTCB', address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
        { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
    ],
    43114: [ // Avalanche
        { symbol: 'WAVAX', address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', decimals: 18 },
        { symbol: 'WETH.e', address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18 },
    ],
};

/**
 * Pick the best destination chain from the merchant's supported networks.
 * Uses BRIDGE_DESTINATION_PRIORITY to prefer cheaper/faster chains.
 */
export const getBestDestinationChain = (merchantNetworks) => {
    if (!merchantNetworks || merchantNetworks.length === 0) return null;

    for (const preferred of BRIDGE_DESTINATION_PRIORITY) {
        const match = merchantNetworks.find(n =>
            n.shortName?.toLowerCase() === preferred
        );
        if (match) return match;
    }

    return merchantNetworks[0] || null;
};

/**
 * Extract bridgeable USDC/USDT token info from a Relay chain's featuredTokens.
 * Returns { usdc: { address, decimals }, usdt: { address, decimals } } or nulls.
 */
export const extractBridgeTokens = (relayChainData) => {
    const tokens = relayChainData?.featuredTokens || [];
    let usdc = null;
    let usdt = null;

    for (const token of tokens) {
        const sym = (token.symbol || '').toUpperCase();
        if (!usdc && sym.startsWith('USDC') && token.supportsBridging && token.address) {
            usdc = { address: token.address, decimals: token.decimals || 6 };
        }
        if (!usdt && sym.startsWith('USDT') && token.supportsBridging && token.address) {
            usdt = { address: token.address, decimals: token.decimals || 6 };
        }
    }

    return { usdc, usdt };
};

/**
 * Get the bridge token address for a given symbol and chain.
 * Supports USDC, USDT, and native tokens.
 */
export const getBridgeTokenAddress = (symbol, bridgeTokens) => {
    if (!bridgeTokens) return null;
    const upper = symbol?.toUpperCase();
    if (upper === 'USDC') return bridgeTokens.usdc?.address || null;
    if (upper === 'USDT') return bridgeTokens.usdt?.address || null;
    return null;
};

/**
 * Get token decimals for a bridge token.
 */
export const getBridgeTokenDecimals = (symbol, bridgeTokens) => {
    if (!bridgeTokens) return 6;
    const upper = symbol?.toUpperCase();
    if (upper === 'USDC') return bridgeTokens.usdc?.decimals || 6;
    if (upper === 'USDT') return bridgeTokens.usdt?.decimals || 6;
    return 18; // Default for non-stablecoin tokens
};

/**
 * Check if a token symbol is a merchant-accepted stablecoin.
 */
export const isStablecoin = (symbol) => {
    const upper = (symbol || '').toUpperCase();
    return upper === 'USDC' || upper === 'USDT';
};
