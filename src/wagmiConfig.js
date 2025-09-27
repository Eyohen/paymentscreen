import { createConfig, http } from 'wagmi';
import { mainnet, bsc, polygon, arbitrum, optimism, avalanche } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

// Trust Wallet connector
const trustWallet = () => injected({
  target: () => ({
    id: 'trustWallet',
    name: 'Trust Wallet',
    provider: typeof window !== 'undefined' ? window.trustwallet : undefined,
  })
});

// Create wagmi config with multiple chains
export const config = createConfig({
  chains: [mainnet, bsc, polygon, arbitrum, optimism, avalanche],
  connectors: [
    injected(),
    trustWallet(),
    coinbaseWallet({
      appName: 'Coinley Payment',
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [bsc.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [avalanche.id]: http(),
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