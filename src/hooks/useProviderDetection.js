import { useEffect } from 'react';
import usePaymentStore from '../stores/paymentStore';

/**
 * EIP-6963 Multi-Injected Provider Discovery Hook
 *
 * This hook implements the EIP-6963 standard for discovering multiple
 * wallet providers without race conditions.
 *
 * Supported Wallets: MetaMask, Trust Wallet, Coinbase Wallet, OKX, and others
 *
 * @see https://eips.ethereum.org/EIPS/eip-6963
 */
export const useProviderDetection = () => {
  const { setDetectedProviders, addDebugLog, setProviderReady } = usePaymentStore();

  useEffect(() => {
    const providers = new Map();

    // Handle EIP-6963 provider announcements
    const handleAnnounce = (event) => {
      const { info, provider } = event.detail;

      if (!info || !provider) {
        return;
      }

      // Store provider with its UUID as key
      providers.set(info.uuid, {
        info,
        provider,
        isMetaMask: provider.isMetaMask || info.rdns?.includes('metamask'),
        isTrust: provider.isTrust || provider.isTrustWallet || info.rdns?.includes('trust'),
        isCoinbase: provider.isCoinbaseWallet || provider.isCoinbaseBrowser || info.rdns?.includes('coinbase')
      });

      addDebugLog('success', `🔍 EIP-6963: Provider discovered - ${info.name}`, {
        uuid: info.uuid,
        name: info.name,
        rdns: info.rdns,
        icon: info.icon
      });

      // Update store with all detected providers
      setDetectedProviders(Array.from(providers.values()));
    };

    // Listen for provider announcements
    window.addEventListener('eip6963:announceProvider', handleAnnounce);

    // Request all providers to announce themselves
    addDebugLog('info', '📡 EIP-6963: Requesting provider announcements...');
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Fallback: Also detect legacy providers
    const detectLegacyProviders = () => {
      addDebugLog('info', '🔍 Detecting legacy providers (window.ethereum, window.trustwallet)...');

      // Check for window.ethereum (MetaMask, Coinbase, others)
      if (window.ethereum) {
        const isMetaMask = window.ethereum.isMetaMask;
        const isCoinbase = window.ethereum.isCoinbaseWallet || window.ethereum.isCoinbaseBrowser;
        const isTrust = window.ethereum.isTrust || window.ethereum.isTrustWallet;

        if (isMetaMask) {
          addDebugLog('success', '🦊 Legacy: MetaMask detected on window.ethereum');
        }
        if (isCoinbase) {
          addDebugLog('success', '💙 Legacy: Coinbase Wallet detected on window.ethereum');
        }
        if (isTrust) {
          addDebugLog('success', '🛡️ Legacy: Trust Wallet detected on window.ethereum.isTrust');
        }
      }

      // Check for window.trustwallet (Trust Wallet Manifest V3)
      if (window.trustwallet) {
        addDebugLog('success', '🛡️ Legacy: Trust Wallet detected on window.trustwallet');
      }
    };

    // Give EIP-6963 providers 1 second to announce, then check legacy
    setTimeout(() => {
      detectLegacyProviders();
      setProviderReady(true);
      addDebugLog('success', `✅ Provider detection complete. Found ${providers.size} EIP-6963 providers`);
    }, 1000);

    // Cleanup
    return () => {
      window.removeEventListener('eip6963:announceProvider', handleAnnounce);
    };
  }, [addDebugLog, setDetectedProviders, setProviderReady]);
};

/**
 * Listen for provider initialization events (ethereum#initialized, trustwallet#initialized)
 * with timeout fallback
 *
 * @param {string} eventName - Event to listen for (e.g., 'ethereum#initialized')
 * @param {string} globalObject - Global object to check (e.g., 'ethereum')
 * @param {number} timeout - Timeout in milliseconds (default: 3000)
 * @returns {Promise<object|null>} - Provider object or null
 */
export const waitForProviderInit = (eventName, globalObject, timeout = 3000) => {
  return new Promise((resolve) => {
    // Check if already available
    if (window[globalObject]) {
      console.log(`✅ ${globalObject} already available`);
      resolve(window[globalObject]);
      return;
    }

    console.log(`⏳ Waiting for ${eventName} event (${timeout}ms timeout)...`);

    // Listen for initialization event
    const handleInit = () => {
      console.log(`✅ ${eventName} event fired!`);
      resolve(window[globalObject]);
    };

    window.addEventListener(eventName, handleInit, { once: true });

    // Timeout fallback
    setTimeout(() => {
      window.removeEventListener(eventName, handleInit);
      const provider = window[globalObject];
      if (provider) {
        console.log(`✅ ${globalObject} available after timeout`);
      } else {
        console.log(`⚠️ ${globalObject} not available after ${timeout}ms timeout`);
      }
      resolve(provider || null);
    }, timeout);
  });
};

/**
 * Detect wallet environment (in-app browser or external)
 * Enhanced version with better Trust Wallet detection
 *
 * @returns {object} Wallet environment details
 */
export const detectWalletEnvironment = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  const ethereum = window.ethereum;
  const trustwallet = window.trustwallet;

  // Check for multiple providers (MetaMask/Coinbase can have this structure)
  const providers = ethereum?.providers || [];
  const hasMetaMask = !!(ethereum?.isMetaMask || providers.find(p => p.isMetaMask));
  const hasCoinbase = !!(ethereum?.isCoinbaseWallet || ethereum?.isCoinbaseBrowser || providers.find(p => p.isCoinbaseWallet));

  // ✅ TRUST WALLET: Check window.trustwallet AND window.ethereum
  const hasTrust = !!(
    trustwallet ||
    ethereum?.isTrust ||
    ethereum?.isTrustWallet ||
    userAgent.includes('trust')
  );

  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent);
  const isInAppBrowser = !!((ethereum || trustwallet) && (hasMetaMask || hasTrust || hasCoinbase));

  const walletType = hasTrust ? 'trust' :
                     hasMetaMask ? 'metamask' :
                     hasCoinbase ? 'coinbase' :
                     userAgent.includes('trust') ? 'trust' :
                     userAgent.includes('metamask') ? 'metamask' :
                     userAgent.includes('coinbase') ? 'coinbase' : 'unknown';

  return {
    isMobile,
    isInAppBrowser,
    walletType,
    hasEthereum: !!(ethereum || trustwallet),
    hasMetaMask,
    hasCoinbase,
    hasTrust,
    hasTrustWallet: !!trustwallet,
    userAgent
  };
};
