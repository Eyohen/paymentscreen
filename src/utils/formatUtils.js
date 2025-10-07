// Formatting utilities for payment screen

// Format transaction hash with ellipsis
export const formatTransactionHash = (hash) => {
    if (!hash) return '';
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 10)}...${hash.slice(-10)}`;
};

// Get blockchain explorer URL for transaction
export const getExplorerUrl = (transactionHash, network) => {
    if (!transactionHash || !network) return null;

    // Handle both string network names and network objects
    const networkName = typeof network === 'string' ? network : network.name || network.shortName;
    const normalizedNetwork = networkName?.toLowerCase();

    const explorerUrls = {
        'ethereum': `https://etherscan.io/tx/${transactionHash}`,
        'ethereum mainnet': `https://etherscan.io/tx/${transactionHash}`,
        'bsc': `https://bscscan.com/tx/${transactionHash}`,
        'bsc mainnet': `https://bscscan.com/tx/${transactionHash}`,
        'polygon': `https://polygonscan.com/tx/${transactionHash}`,
        'arbitrum': `https://arbiscan.io/tx/${transactionHash}`,
        'arbitrum one': `https://arbiscan.io/tx/${transactionHash}`,
        'optimism': `https://optimistic.etherscan.io/tx/${transactionHash}`,
        'avalanche': `https://snowtrace.io/tx/${transactionHash}`,
        'celo': `https://celoscan.io/tx/${transactionHash}`
    };

    return explorerUrls[normalizedNetwork] || null;
};

// Get blockchain explorer name
export const getExplorerName = (network) => {
    if (!network) return 'Explorer';

    const networkName = typeof network === 'string' ? network : network.name || network.shortName;
    const normalizedNetwork = networkName?.toLowerCase();

    const explorerNames = {
        'ethereum': 'Etherscan',
        'ethereum mainnet': 'Etherscan',
        'bsc': 'BscScan',
        'bsc mainnet': 'BscScan',
        'polygon': 'PolygonScan',
        'arbitrum': 'Arbiscan',
        'arbitrum one': 'Arbiscan',
        'optimism': 'Optimistic Etherscan',
        'avalanche': 'SnowTrace',
        'celo': 'CeloScan'
    };

    return explorerNames[normalizedNetwork] || 'Explorer';
};
