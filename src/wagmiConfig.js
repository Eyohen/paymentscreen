import { createConfig, http } from 'wagmi';
import { mainnet, bsc, polygon, arbitrum, optimism, avalanche } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Trust Wallet connector
const trustWallet = () => injected({
  target: () => ({
    id: 'trustWallet',
    name: 'Trust Wallet',
    provider: typeof window !== 'undefined' ? window.trustwallet : undefined,
  })
});

// MetaMask connector (explicit)
const metaMask = () => injected({
  target: () => ({
    id: 'metaMask',
    name: 'MetaMask',
    provider: typeof window !== 'undefined' ?
      (window.ethereum?.isMetaMask ? window.ethereum : undefined) : undefined,
  })
});

// Create wagmi config with mobile-focused wallets only
export const config = createConfig({
  chains: [mainnet, bsc, polygon, arbitrum, optimism, avalanche],
  connectors: [
    trustWallet(),
    metaMask(),
    injected(), // Generic fallback and Coinbase support
  ],
  transports: {
    [mainnet.id]: http('https://eth.llamarpc.com', {
      timeout: 30_000, // 30 second timeout
      retryCount: 3,
      retryDelay: 1000
    }),
    [bsc.id]: http('https://bsc-dataseed1.binance.org', {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1000
    }),
    [polygon.id]: http('https://polygon-rpc.com', {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1000
    }),
    [arbitrum.id]: http('https://arb1.arbitrum.io/rpc', {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1000
    }),
    [optimism.id]: http('https://mainnet.optimism.io', {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1000
    }),
    [avalanche.id]: http('https://api.avax.network/ext/bc/C/rpc', {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1000
    }),
  },
});

// Chain ID mapping for network names from URL params
export const networkToChainId = {
  'Ethereum Mainnet': mainnet.id,
  'BSC Mainnet': bsc.id,
  'Polygon': polygon.id,
  'Arbitrum': arbitrum.id,
  'Optimism': optimism.id,
  'Avalanche': avalanche.id,
};

// Get chain object by network name
export const getChainByNetwork = (networkName) => {
  const chainId = networkToChainId[networkName];
  switch(chainId) {
    case mainnet.id: return mainnet;
    case bsc.id: return bsc;
    case polygon.id: return polygon;
    case arbitrum.id: return arbitrum;
    case optimism.id: return optimism;
    case avalanche.id: return avalanche;
    default: return mainnet;
  }
};