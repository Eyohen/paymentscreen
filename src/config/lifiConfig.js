/**
 * Li.Fi bridge configuration for the standalone payment screen.
 * Kept API-compatible with the older Relay config to minimize churn.
 */

export const LIFI_API_URL = 'https://li.quest/v1';
export const LIFI_API_KEY = 'c344f311-d6d3-4f0c-8ea4-f3aee507f37e.78f5b82d-440a-4463-a841-c6bf11078d22';
export const LIFI_INTEGRATOR = 'coinley';

export const RELAY_API_URL = LIFI_API_URL;

export const BRIDGE_DESTINATION_PRIORITY = [
    'base',
    'arbitrum',
    'optimism',
    'polygon',
    'bsc',
    'avalanche',
    'celo',
    'ethereum'
];

export const CHAIN_ID_MAP = {
    ethereum: 1,
    bsc: 56,
    polygon: 137,
    arbitrum: 42161,
    optimism: 10,
    avalanche: 43114,
    celo: 42220,
    base: 8453,
    monad: 143,
};

export const RELAY_CHAIN_ID_MAP = CHAIN_ID_MAP;

export const CHAIN_ID_TO_SHORT_NAME = Object.fromEntries(
    Object.entries(CHAIN_ID_MAP).map(([name, id]) => [id, name])
);

export const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

export const POPULAR_TOKENS_BY_CHAIN = {
    1: [
        { symbol: 'WETH', address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18 },
        { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
        { symbol: 'LINK', address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18 },
        { symbol: 'UNI', address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18 },
        { symbol: 'PEPE', address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18 },
    ],
    8453: [
        { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        { symbol: 'cbETH', address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18 },
    ],
    42161: [
        { symbol: 'WETH', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18 },
        { symbol: 'ARB', address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
        { symbol: 'WBTC', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8 },
    ],
    137: [
        { symbol: 'WMATIC', address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18 },
        { symbol: 'WETH', address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18 },
        { symbol: 'WBTC', address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8 },
        { symbol: 'LINK', address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18 },
    ],
    10: [
        { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 },
        { symbol: 'OP', address: '0x4200000000000000000000000000000000000042', decimals: 18 },
        { symbol: 'WBTC', address: '0x68f180fcCe6836688e9084f035309E29Bf0A2095', decimals: 8 },
    ],
    56: [
        { symbol: 'WBNB', address: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18 },
        { symbol: 'BTCB', address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18 },
        { symbol: 'ETH', address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18 },
    ],
    43114: [
        { symbol: 'WAVAX', address: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', decimals: 18 },
        { symbol: 'WETH.e', address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18 },
    ],
};

export const KNOWN_USDC = {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    137: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    56: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    43114: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    42220: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
};

export const KNOWN_USDT = {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    8453: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    56: '0x55d398326f99059fF775485246999027B3197955',
};

const toTokenEntry = (address, decimals = 6) => (address ? { address, decimals } : null);

export const getKnownBridgeTokens = (chainId) => ({
    usdc: toTokenEntry(KNOWN_USDC[chainId]),
    usdt: toTokenEntry(KNOWN_USDT[chainId]),
});

export const getBestDestinationChain = (merchantNetworks) => {
    if (!merchantNetworks || merchantNetworks.length === 0) return null;

    for (const preferred of BRIDGE_DESTINATION_PRIORITY) {
        const match = merchantNetworks.find(n => n.shortName?.toLowerCase() === preferred);
        if (match) return match;
    }

    return merchantNetworks[0] || null;
};

export const extractBridgeTokens = (chainData) => {
    const chainId = parseInt(chainData?.id || chainData?.chainId, 10);
    const lifiTokens = chainData?.tokens || chainData?.featuredTokens || [];
    let usdc = null;
    let usdt = null;

    for (const token of lifiTokens) {
        const symbol = (token.symbol || '').toUpperCase();
        if (!usdc && symbol.startsWith('USDC') && token.address) {
            usdc = { address: token.address, decimals: token.decimals || 6 };
        }
        if (!usdt && symbol.startsWith('USDT') && token.address) {
            usdt = { address: token.address, decimals: token.decimals || 6 };
        }
    }

    const known = Number.isFinite(chainId) ? getKnownBridgeTokens(chainId) : {};
    return {
        usdc: usdc || known.usdc || null,
        usdt: usdt || known.usdt || null,
    };
};

export const getBridgeTokenAddress = (symbol, bridgeTokens) => {
    if (!bridgeTokens) return null;
    const upper = symbol?.toUpperCase();
    if (upper === 'USDC') return bridgeTokens.usdc?.address || null;
    if (upper === 'USDT') return bridgeTokens.usdt?.address || null;
    return null;
};

export const getBridgeTokenDecimals = (symbol, bridgeTokens) => {
    if (!bridgeTokens) return 6;
    const upper = symbol?.toUpperCase();
    if (upper === 'USDC') return bridgeTokens.usdc?.decimals || 6;
    if (upper === 'USDT') return bridgeTokens.usdt?.decimals || 6;
    return 18;
};

export const isStablecoin = (symbol) => {
    const upper = (symbol || '').toUpperCase();
    return upper === 'USDC' || upper === 'USDT' || upper === 'DAI' || upper === 'BUSD';
};
