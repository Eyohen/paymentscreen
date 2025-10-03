import { createConfig } from 'wagmi';
import { http, fallback } from 'viem';
import { mainnet, bsc, polygon, arbitrum, optimism, avalanche, celo } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// ⭐ ENHANCED Trust Wallet connector - Checks multiple provider locations
const getTrustWalletProvider = () => {
  console.log('🛡️ [WAGMI CONFIG] Getting Trust Wallet provider...');

  if (typeof window === 'undefined') {
    console.log('🛡️ [WAGMI CONFIG] Window is undefined (SSR)');
    return undefined;
  }

  console.log('🛡️ [WAGMI CONFIG] Checking provider locations...');
  console.log('🛡️ [WAGMI CONFIG] window.trustwallet exists:', !!window.trustwallet);
  console.log('🛡️ [WAGMI CONFIG] window.trustwallet?.ethereum exists:', !!window.trustwallet?.ethereum);
  console.log('🛡️ [WAGMI CONFIG] window.ethereum exists:', !!window.ethereum);
  console.log('🛡️ [WAGMI CONFIG] User Agent:', navigator.userAgent);

  // Method 1: Mobile in-app browser - window.trustwallet.ethereum
  if (window.trustwallet?.ethereum) {
    console.log('✅ [WAGMI CONFIG] Trust Wallet provider: window.trustwallet.ethereum');
    console.log('✅ [WAGMI CONFIG] Provider type:', typeof window.trustwallet.ethereum);
    console.log('✅ [WAGMI CONFIG] Has request method:', typeof window.trustwallet.ethereum.request === 'function');
    console.log('✅ [WAGMI CONFIG] Provider properties:', Object.keys(window.trustwallet.ethereum).slice(0, 10));
    return window.trustwallet.ethereum;
  }

  // Method 2: Check window.ethereum.providers array
  if (window.ethereum?.providers) {
    console.log('🛡️ [WAGMI CONFIG] Checking providers array, count:', window.ethereum.providers.length);
    const trustProvider = window.ethereum.providers.find(p => p.isTrust || p.isTrustWallet);
    if (trustProvider) {
      console.log('✅ [WAGMI CONFIG] Trust Wallet provider: window.ethereum.providers');
      console.log('✅ [WAGMI CONFIG] Provider isTrust:', trustProvider.isTrust);
      console.log('✅ [WAGMI CONFIG] Provider isTrustWallet:', trustProvider.isTrustWallet);
      return trustProvider;
    }
    console.log('⚠️ [WAGMI CONFIG] No Trust Wallet found in providers array');
  }

  // Method 3: Check window.ethereum directly
  if (window.ethereum?.isTrust || window.ethereum?.isTrustWallet) {
    console.log('✅ [WAGMI CONFIG] Trust Wallet provider: window.ethereum');
    console.log('✅ [WAGMI CONFIG] isTrust:', window.ethereum.isTrust);
    console.log('✅ [WAGMI CONFIG] isTrustWallet:', window.ethereum.isTrustWallet);
    return window.ethereum;
  }

  // Method 4: Legacy window.trustwallet
  if (window.trustwallet) {
    console.log('✅ [WAGMI CONFIG] Trust Wallet provider: window.trustwallet (legacy)');
    console.log('✅ [WAGMI CONFIG] Has request method:', typeof window.trustwallet.request === 'function');
    return window.trustwallet;
  }

  console.log('❌ [WAGMI CONFIG] No Trust Wallet provider found');
  return undefined;
};

const trustWallet = () => injected({
  target: () => ({
    id: 'trustWallet',
    name: 'Trust Wallet',
    provider: getTrustWalletProvider(),
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

// ✅ IMPROVED: Multiple fallback RPC endpoints for reliability
// Create wagmi config with mobile-focused wallets only
export const config = createConfig({
  chains: [mainnet, bsc, polygon, arbitrum, optimism, avalanche, celo],
  connectors: [
    trustWallet(),
    metaMask(),
    injected(), // Generic fallback and Coinbase support
  ],
  transports: {
    // ⭐ Ethereum Mainnet - Multiple fallback RPCs for reliability
    [mainnet.id]: fallback([
      http('https://eth.llamarpc.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://rpc.ankr.com/eth', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://ethereum.publicnode.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://cloudflare-eth.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://eth.drpc.org', {
        timeout: 30_000,
        retryCount: 2,
      }),
    ]),
    // ⭐ BSC - Multiple fallback RPCs
    [bsc.id]: fallback([
      http('https://bsc-dataseed1.binance.org', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://bsc-dataseed.binance.org', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://rpc.ankr.com/bsc', {
        timeout: 30_000,
        retryCount: 2,
      }),
    ]),
    // ⭐ Polygon - Multiple fallback RPCs
    [polygon.id]: fallback([
      http('https://polygon-rpc.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://rpc.ankr.com/polygon', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://polygon.llamarpc.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
    ]),
    // ⭐ Arbitrum - Multiple fallback RPCs
    [arbitrum.id]: fallback([
      http('https://arb1.arbitrum.io/rpc', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://rpc.ankr.com/arbitrum', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://arbitrum.llamarpc.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
    ]),
    // ⭐ Optimism - Multiple fallback RPCs
    [optimism.id]: fallback([
      http('https://mainnet.optimism.io', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://rpc.ankr.com/optimism', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://optimism.llamarpc.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
    ]),
    // ⭐ Avalanche - Multiple fallback RPCs
    [avalanche.id]: fallback([
      http('https://api.avax.network/ext/bc/C/rpc', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://rpc.ankr.com/avalanche', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://avalanche.public-rpc.com', {
        timeout: 30_000,
        retryCount: 2,
      }),
    ]),
    // ⭐ Celo - Multiple fallback RPCs
    [celo.id]: fallback([
      http('https://forno.celo.org', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://rpc.ankr.com/celo', {
        timeout: 30_000,
        retryCount: 2,
      }),
      http('https://celo.drpc.org', {
        timeout: 30_000,
        retryCount: 2,
      }),
    ]),
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
  'Celo': celo.id,
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
    case celo.id: return celo;
    default: return mainnet;
  }
};