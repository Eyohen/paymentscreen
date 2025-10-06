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
    // ⭐ Ethereum Mainnet - Best free public RPCs
    [mainnet.id]: fallback([
      http('https://cloudflare-eth.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://eth.llamarpc.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://ethereum.publicnode.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://1rpc.io/eth', {
        timeout: 10_000,
        retryCount: 1,
      }),
    ]),
    // ⭐ BSC - Official endpoints (10K/5min rate limit per endpoint)
    [bsc.id]: fallback([
      http('https://bsc-dataseed.bnbchain.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://bsc-dataseed-public.bnbchain.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://bsc-dataseed.nariox.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://bsc.nodereal.io', {
        timeout: 10_000,
        retryCount: 1,
      }),
    ]),
    // ⭐ Polygon - Official + reliable free endpoints
    [polygon.id]: fallback([
      http('https://rpc-mainnet.matic.network', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://polygon-rpc.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://polygon.llamarpc.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://1rpc.io/matic', {
        timeout: 10_000,
        retryCount: 1,
      }),
    ]),
    // ⭐ Arbitrum - Multiple fallback RPCs (removed Ankr)
    [arbitrum.id]: fallback([
      http('https://arb1.arbitrum.io/rpc', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://arbitrum.llamarpc.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://arbitrum.drpc.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
    ]),
    // ⭐ Optimism - Multiple fallback RPCs (removed Ankr)
    [optimism.id]: fallback([
      http('https://mainnet.optimism.io', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://optimism.llamarpc.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://optimism.drpc.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
    ]),
    // ⭐ Avalanche - Multiple fallback RPCs (removed Ankr)
    [avalanche.id]: fallback([
      http('https://api.avax.network/ext/bc/C/rpc', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://avalanche.public-rpc.com', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://avalanche.drpc.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
    ]),
    // ⭐ Celo - Multiple fallback RPCs (removed Ankr)
    [celo.id]: fallback([
      http('https://forno.celo.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://celo.drpc.org', {
        timeout: 10_000,
        retryCount: 1,
      }),
      http('https://1rpc.io/celo', {
        timeout: 10_000,
        retryCount: 1,
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