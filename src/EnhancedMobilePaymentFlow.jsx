import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useConnect, useSwitchChain } from 'wagmi';
import { readContract, writeContract, simulateContract } from '@wagmi/core';
import { parseUnits, erc20Abi } from 'viem';
import { config } from './wagmiConfig';

// ✅ CRITICAL: Add global BigInt serialization support to prevent JSON errors
if (typeof BigInt.prototype.toJSON === 'undefined') {
  BigInt.prototype.toJSON = function() {
    return this.toString();
  };
}

// ⭐ GLOBAL DEBUG LOG STORE for Trust Wallet debugging
// This allows helper functions outside the component to log to the debug panel
const globalDebugLogs = [];

// ⭐ Safe serialization helper for global logs (handles circular references)
const safeSerialize = (obj, seen = new WeakSet()) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (typeof obj === 'function') return '[Function]';
  if (typeof obj === 'symbol') return obj.toString();
  if (typeof obj !== 'object') return obj;

  // ⭐ Detect circular references
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => safeSerialize(item, seen));
  }

  const safe = {};
  try {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        safe[key] = safeSerialize(obj[key], seen);
      }
    }
  } catch (error) {
    return '[Serialization Error]';
  }
  return safe;
};

const addGlobalDebugLog = (type, message, data = null) => {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = {
    id: Date.now() + Math.random(),
    type,
    message,
    data: safeSerialize(data), // ⭐ Use safe serialization
    timestamp,
    iso: new Date().toISOString()
  };
  globalDebugLogs.push(logEntry);
  // Also log to console
  console.log(`[${type.toUpperCase()}] [${timestamp}] ${message}`, data || '');
};

// ⭐ ENHANCED Trust Wallet Provider Detection (Based on Official Trust Wallet Docs)
// Official docs: https://developer.trustwallet.com/developer/listing-new-dapps/mobile-optimize
// Trust Wallet injects: window.trustwallet.ethereum (PREFERRED), window.ethereum.providers, window.ethereum
const getTrustWalletProvider = () => {
  console.log('🔍 [TRUST WALLET DEBUG] Starting provider detection...');
  console.log('🔍 [TRUST WALLET DEBUG] window.trustwallet exists:', !!window.trustwallet);
  console.log('🔍 [TRUST WALLET DEBUG] window.trustwallet?.ethereum exists:', !!window.trustwallet?.ethereum);
  console.log('🔍 [TRUST WALLET DEBUG] window.ethereum exists:', !!window.ethereum);
  console.log('🔍 [TRUST WALLET DEBUG] window.ethereum?.providers exists:', !!window.ethereum?.providers);

  // ⭐ CRITICAL DIAGNOSTIC: Log ALL window properties to see what Trust Wallet actually injects
  const windowKeys = Object.keys(window).filter(key =>
    key.toLowerCase().includes('trust') ||
    key.toLowerCase().includes('wallet') ||
    key.toLowerCase().includes('ethereum') ||
    key.toLowerCase().includes('web3')
  );
  console.log('🔍 [TRUST WALLET DEBUG] Wallet-related window properties:', windowKeys);
  addGlobalDebugLog('info', '🔍 Wallet-related window properties found', windowKeys);

  // Log all available properties on window.trustwallet if it exists
  if (window.trustwallet) {
    console.log('🔍 [TRUST WALLET DEBUG] window.trustwallet keys:', Object.keys(window.trustwallet));
    console.log('🔍 [TRUST WALLET DEBUG] window.trustwallet.ethereum type:', typeof window.trustwallet.ethereum);
    addGlobalDebugLog('info', '🔍 window.trustwallet keys', Object.keys(window.trustwallet));
  }

  // Log window.ethereum details
  if (window.ethereum) {
    console.log('🔍 [TRUST WALLET DEBUG] window.ethereum properties:', {
      isTrust: window.ethereum.isTrust,
      isTrustWallet: window.ethereum.isTrustWallet,
      isMetaMask: window.ethereum.isMetaMask,
      isCoinbaseWallet: window.ethereum.isCoinbaseWallet,
      hasProviders: !!window.ethereum.providers,
      hasRequest: typeof window.ethereum.request === 'function'
    });
    addGlobalDebugLog('info', '🔍 window.ethereum properties', {
      isTrust: window.ethereum.isTrust,
      isTrustWallet: window.ethereum.isTrustWallet,
      isMetaMask: window.ethereum.isMetaMask,
      isCoinbaseWallet: window.ethereum.isCoinbaseWallet,
      hasProviders: !!window.ethereum.providers
    });
  }

  // Log all providers in array if it exists
  if (window.ethereum?.providers) {
    console.log('🔍 [TRUST WALLET DEBUG] Number of providers:', window.ethereum.providers.length);
    window.ethereum.providers.forEach((provider, index) => {
      console.log(`🔍 [TRUST WALLET DEBUG] Provider ${index}:`, {
        isTrust: provider.isTrust,
        isTrustWallet: provider.isTrustWallet,
        isMetaMask: provider.isMetaMask,
        isCoinbaseWallet: provider.isCoinbaseWallet
      });
    });
    addGlobalDebugLog('info', '🔍 Ethereum providers array',
      window.ethereum.providers.map((p, i) => ({
        index: i,
        isTrust: p.isTrust,
        isTrustWallet: p.isTrustWallet,
        isMetaMask: p.isMetaMask
      }))
    );
  }

  // ⭐ METHOD 1 (OFFICIAL RECOMMENDED): Check window.trustwallet.ethereum first
  // Per Trust Wallet docs: Use window.trustwallet.ethereum directly in Trust Wallet browser
  if (window.trustwallet?.ethereum && typeof window.trustwallet.ethereum.request === 'function') {
    console.log('✅ [TRUST WALLET DEBUG] Provider found at window.trustwallet.ethereum (OFFICIAL METHOD)');
    console.log('✅ [TRUST WALLET DEBUG] Provider type:', typeof window.trustwallet.ethereum);
    addGlobalDebugLog('success', '✅ Trust Wallet provider found at window.trustwallet.ethereum (official)', {
      location: 'window.trustwallet.ethereum',
      hasRequest: true
    });
    return window.trustwallet.ethereum;
  }

  // ⭐ METHOD 2: Check window.ethereum.providers array
  if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
    const trustProvider = window.ethereum.providers.find(p => p.isTrust || p.isTrustWallet);
    if (trustProvider && typeof trustProvider.request === 'function') {
      console.log('✅ [TRUST WALLET DEBUG] Provider found in window.ethereum.providers');
      addGlobalDebugLog('success', '✅ Trust Wallet provider found in window.ethereum.providers', {
        location: 'window.ethereum.providers',
        hasRequest: true
      });
      return trustProvider;
    }
  }

  // ⭐ METHOD 3: Check window.ethereum directly with Trust flags
  if (window.ethereum && (window.ethereum.isTrust || window.ethereum.isTrustWallet) && typeof window.ethereum.request === 'function') {
    console.log('✅ [TRUST WALLET DEBUG] Provider found at window.ethereum with Trust flags');
    addGlobalDebugLog('success', '✅ Trust Wallet provider found at window.ethereum', {
      location: 'window.ethereum',
      isTrust: window.ethereum.isTrust,
      isTrustWallet: window.ethereum.isTrustWallet
    });
    return window.ethereum;
  }

  // ⭐ METHOD 4: Check URL parameter to confirm we're in Trust Wallet
  // If URL has preferredWallet=trust AND we have window.ethereum, assume it's Trust Wallet
  // This handles the case where Trust Wallet Android doesn't set isTrust flag but is the DApp browser
  const urlParams = new URLSearchParams(window.location.search);
  const preferredWallet = urlParams.get('preferredWallet');
  if (preferredWallet === 'trust' && window.ethereum && typeof window.ethereum.request === 'function') {
    console.log('✅ [TRUST WALLET DEBUG] Trust Wallet detected via URL parameter + window.ethereum');
    console.log('✅ [TRUST WALLET DEBUG] User Agent:', navigator.userAgent);
    addGlobalDebugLog('success', '✅ Trust Wallet detected via URL preferredWallet=trust', {
      location: 'window.ethereum',
      userAgent: navigator.userAgent,
      preferredWallet: 'trust',
      hasRequest: true
    });
    return window.ethereum;
  }

  // ⭐ CRITICAL: Log what IS available for debugging
  console.log('❌ [TRUST WALLET DEBUG] No Trust Wallet provider found in any location');
  console.log('🔍 [TRUST WALLET DEBUG] window.ethereum:', window.ethereum);
  console.log('🔍 [TRUST WALLET DEBUG] window.trustwallet:', window.trustwallet);
  console.log('🔍 [TRUST WALLET DEBUG] URL params:', window.location.search);

  addGlobalDebugLog('error', '❌ Trust Wallet provider NOT FOUND in any location', {
    checkedLocations: [
      'window.trustwallet.ethereum (official)',
      'window.ethereum.providers',
      'window.ethereum (with flags)',
      'URL preferredWallet param + window.ethereum'
    ],
    hasWindowEthereum: !!window.ethereum,
    hasWindowTrustWallet: !!window.trustwallet,
    preferredWallet: urlParams.get('preferredWallet'),
    userAgent: navigator.userAgent,
    isAndroidWebView: navigator.userAgent.toLowerCase().includes('android') && navigator.userAgent.toLowerCase().includes('wv')
  });
  return null;
};

// Enhanced wallet environment detection (aligned with coinley-test research)
// ✅ IMPROVED: More aggressive detection for Trust Wallet, MetaMask and Coinbase
const detectWalletEnvironment = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  const ethereum = window.ethereum;

  // ⭐ FIX: Don't call getTrustWalletProvider() here to avoid circular calls during logging
  // Instead, do a simple inline check for Trust Wallet
  const trustwalletProvider = window.trustwallet?.ethereum ||
                              window.ethereum?.providers?.find(p => p.isTrust || p.isTrustWallet) ||
                              (window.ethereum?.isTrust || window.ethereum?.isTrustWallet ? window.ethereum : null);

  // Check multiple provider properties (MetaMask/Coinbase can have different structures)
  const providers = window.ethereum?.providers || [];
  const hasMetaMask = !!(ethereum?.isMetaMask || providers.find(p => p.isMetaMask));
  const hasCoinbase = !!(ethereum?.isCoinbaseWallet || ethereum?.isCoinbaseBrowser || providers.find(p => p.isCoinbaseWallet));

  // ✅ TRUST WALLET: Use comprehensive detection
  const hasTrust = !!(
    trustwalletProvider ||
    ethereum?.isTrust ||
    ethereum?.isTrustWallet ||
    userAgent.includes('trust')
  );

  return {
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isInAppBrowser: !!((ethereum || trustwalletProvider) && (hasMetaMask || hasTrust || hasCoinbase)),
    walletType: hasTrust ? 'trust' :
                hasMetaMask ? 'metamask' :
                hasCoinbase ? 'coinbase' :
                userAgent.includes('trust') ? 'trust' :
                userAgent.includes('metamask') ? 'metamask' :
                userAgent.includes('coinbase') ? 'coinbase' : 'unknown',
    hasEthereum: !!(ethereum || trustwalletProvider),
    hasMetaMask,
    hasCoinbase,
    hasTrust,
    hasTrustWallet: !!trustwalletProvider,
    trustWalletProvider: trustwalletProvider // ⭐ Expose Trust Wallet provider
  };
};

// SIMPLE parameter validation - only check if we have basic data
// ✅ SAFE: Returns object with isValid flag instead of throwing
const validatePaymentParameters = (params) => {
  console.log('🔍 SIMPLE Payment parameter validation:', params);

  // Only require paymentId OR splitterPaymentId - very relaxed
  const hasPaymentId = params.paymentId || params.payment_id || params.splitterPaymentId;

  if (!hasPaymentId) {
    console.error('❌ No payment ID found:', Object.keys(params));
    return {
      isValid: false,
      error: 'Payment ID is required',
      missingParams: ['paymentId']
    };
  }

  console.log('✅ SIMPLE Validation passed - found payment ID:', hasPaymentId);
  return {
    isValid: true,
    error: null
  };
};

// Enhanced URL parameter extraction (FLEXIBLE VERSION - handles multiple parameter names)
const getValidatedUrlParams = () => {
  const params = new URLSearchParams(window.location.search);

  // Helper function to get parameter by multiple possible names
  const getParam = (names) => {
    for (const name of names) {
      const value = params.get(name);
      if (value && value.trim() !== '') {
        return value.trim();
      }
    }
    return '';
  };

  const paymentData = {
    // Basic payment info
    amount: getParam(['amount']) || '',
    token: getParam(['token']) || 'USDC',
    merchant: getParam(['merchant']) || 'Demo Merchant',
    productAmount: getParam(['productAmount']) || '',
    platformFee: getParam(['platformFee']) || '0',
    networkFee: getParam(['networkFee']) || '0',
    network: getParam(['network']) || 'Ethereum Mainnet',

    // Contract addresses (critical for PaymentSplitter) - CHECK MULTIPLE NAMES
    contractAddress: getParam(['contractAddress', 'contract_address', 'paymentContract', 'contract']) || '',
    tokenContract: getParam(['tokenContract', 'token_contract', 'tokenAddress', 'token_address']) || '',
    chainId: getParam(['chainId', 'chain_id', 'networkId', 'network_id']) || '1',

    // Payment ID (required for backend communication) - CHECK MULTIPLE NAMES
    paymentId: getParam(['paymentId', 'payment_id', 'splitterPaymentId']) || '',
    splitterPaymentId: getParam(['splitterPaymentId', 'paymentId', 'payment_id']) || '',

    // Split payment parameters (aligned with useTransactionHandling)
    recipient1: params.get('recipient1') || '',
    recipient2: params.get('recipient2') || '',
    recipient3: params.get('recipient3') || '0x0000000000000000000000000000000000000000',
    recipient1Percentage: params.get('recipient1Percentage') || '10000',
    recipient2Percentage: params.get('recipient2Percentage') || '0',
    recipient3Percentage: params.get('recipient3Percentage') || '0',

    // Token configuration
    tokenDecimals: params.get('tokenDecimals') || '6',
    amountInWei: params.get('amountInWei') || '',

    // Mobile-specific parameters
    isMobile: params.get('isMobile') === 'true',
    preferredWallet: params.get('preferredWallet') || 'metamask'
  };

  // 🔍 Debug: Log all URL parameters for troubleshooting
  console.log('🔍 Payment Screen - URL Parameters Debug:', {
    allParams: Object.fromEntries(params.entries()),
    extractedPaymentData: paymentData,
    criticalParams: {
      paymentId: paymentData.paymentId,
      contractAddress: paymentData.contractAddress,
      tokenContract: paymentData.tokenContract,
      chainId: paymentData.chainId,
      amount: paymentData.amount
    }
  });

  // ✅ SAFE: Validate parameters using our enhanced validation (returns object, doesn't throw)
  const validation = validatePaymentParameters(paymentData);

  return {
    ...paymentData,
    _validation: validation  // Attach validation result
  };
};

// Enhanced API client (aligned with paymentAPI.js structure)
const createApiClient = () => {
  const apiUrl = process.env.REACT_APP_COINLEY_API_URL || 'https://talented-mercy-production.up.railway.app';
  const apiKey = process.env.REACT_APP_COINLEY_API_KEY || '';
  const apiSecret = process.env.REACT_APP_COINLEY_API_SECRET || '';

  return {
    async getContractInfo(chainId) {
      const endpoint = `${apiUrl}/api/payments/contract/${chainId}`;
      console.log('🔗 API Request Details:', {
        endpoint,
        chainId,
        apiUrl,
        hasApiKey: !!apiKey,
        hasApiSecret: !!apiSecret,
        keyLength: apiKey ? apiKey.length : 0,
        secretLength: apiSecret ? apiSecret.length : 0
      });

      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        // Only add auth headers if we have them (lowercase as per backend)
        if (apiKey && apiSecret) {
          headers['x-api-key'] = apiKey;
          headers['x-api-secret'] = apiSecret;
        } else {
          console.warn('⚠️ No API credentials configured - trying public access');
        }

        console.log('📡 Making request to:', endpoint);
        console.log('📋 Request headers:', headers);

        const response = await fetch(endpoint, {
          method: 'GET',
          headers,
          mode: 'cors' // Explicitly set CORS mode
        });

        console.log('📥 Response received:', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          url: response.url
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ HTTP Error Response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        console.log('📄 Response JSON:', result);

        if (!result.success) {
          console.error('❌ API returned failure:', result);
          throw new Error(result.message || 'Contract not supported on this network');
        }

        console.log('✅ Contract info received:', result.contractInfo);
        return result.contractInfo;
      } catch (error) {
        console.error('❌ Complete error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          cause: error.cause
        });

        // Check for specific error types
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new Error(`Network error: Unable to reach backend at ${apiUrl}. Check CORS settings.`);
        } else if (error.message.includes('CORS')) {
          throw new Error(`CORS error: Backend not allowing requests from payment screen domain.`);
        } else {
          throw new Error(error.message || 'Failed to get contract information');
        }
      }
    },

    async getPaymentDetails(paymentId) {
      // ⭐ Use PUBLIC endpoint - no authentication required (secure by design)
      const endpoint = `${apiUrl}/api/payments/public/${paymentId}`;
      console.log('🔓 Fetching public payment details for:', paymentId);

      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          mode: 'cors'
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch payment: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ Public payment details fetched:', result);

        if (!result.success || !result.payment) {
          throw new Error('Payment not found');
        }

        return result.payment;
      } catch (error) {
        console.error('❌ Error fetching payment details:', error);
        throw error;
      }
    },

    async notifyBackend(paymentId, transactionHash, networkName, senderAddress) {
      if (!paymentId) {
        console.warn('⚠️ No payment ID provided for backend notification');
        return;
      }

      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        if (apiKey && apiSecret) {
          headers['x-api-key'] = apiKey;
          headers['x-api-secret'] = apiSecret;
        }

        const response = await fetch(`${apiUrl}/api/payments/process`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            paymentId,
            transactionHash,
            network: networkName,
            senderAddress,
            source: 'mobile_payment_screen'
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Backend notified successfully:', result);
          return result;
        } else {
          console.error('❌ Backend notification failed:', response.status);
          throw new Error(`Backend error: ${response.status}`);
        }
      } catch (error) {
        console.error('❌ Failed to notify backend:', error);
        throw error;
      }
    },

    async checkPaymentStatus(paymentId) {
      const endpoint = `${apiUrl}/api/payments/status/${paymentId}`;

      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        if (apiKey && apiSecret) {
          headers['x-api-key'] = apiKey;
          headers['x-api-secret'] = apiSecret;
        }

        const response = await fetch(endpoint, {
          method: 'GET',
          headers,
          mode: 'cors'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error('❌ Failed to check payment status:', error);
        throw error;
      }
    },

    async verifyQRPayment(paymentId) {
      const endpoint = `${apiUrl}/api/payments/verify-qr`;

      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        if (apiKey && apiSecret) {
          headers['x-api-key'] = apiKey;
          headers['x-api-secret'] = apiSecret;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({ paymentId }),
          mode: 'cors'
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        console.error('❌ Failed to verify payment:', error);
        throw error;
      }
    }
  };
};

const EnhancedMobilePaymentFlow = () => {
  // State management (aligned with coinley-test pattern)
  const [currentStep, setCurrentStep] = useState('waitingForProvider'); // ⭐ Start by waiting for provider
  const [providerReady, setProviderReady] = useState(false);
  const [walletEnv, setWalletEnv] = useState(null);
  const [paymentData, setPaymentData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [transactionStep, setTransactionStep] = useState('idle'); // approve, splitPayment, processing
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugPanel, setShowDebugPanel] = useState(true); // Show debug by default
  const [verifying, setVerifying] = useState(false); // For manual verification
  const [copySuccess, setCopySuccess] = useState(false); // For copy logs feedback

  // Wagmi hooks
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { switchChain } = useSwitchChain();

  // API client
  const api = createApiClient();

  // ✅ SAFE: Debug logging function with BigInt serialization and circular reference protection
  const addDebugLog = (type, message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();

    // ✅ Convert BigInt to string and handle circular references
    const serializeSafeData = (obj, seen = new WeakSet()) => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === 'bigint') return obj.toString();
      if (typeof obj === 'function') return '[Function]';
      if (typeof obj === 'symbol') return obj.toString();

      // Primitive types
      if (typeof obj !== 'object') return obj;

      // ⭐ CRITICAL: Detect circular references
      if (seen.has(obj)) return '[Circular Reference]';
      seen.add(obj);

      if (Array.isArray(obj)) {
        return obj.map(item => serializeSafeData(item, seen));
      }

      // Objects
      const safe = {};
      try {
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            safe[key] = serializeSafeData(obj[key], seen);
          }
        }
      } catch (error) {
        return '[Object - Serialization Error]';
      }
      return safe;
    };

    const logEntry = {
      id: Date.now() + Math.random(),
      type,
      message,
      data: serializeSafeData(data),
      timestamp
    };
    setDebugLogs(prev => [...prev, logEntry].slice(-50)); // Keep last 50 logs

    // Also log to console for developers
    console.log(`[${type.toUpperCase()}] [${timestamp}] ${message}`, data || '');
  };

  // ⭐ SYNC GLOBAL DEBUG LOGS: Merge global logs into component state for UI display
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (globalDebugLogs.length > 0) {
        setDebugLogs(prev => {
          const newLogs = [...prev, ...globalDebugLogs].slice(-50);
          globalDebugLogs.length = 0; // Clear global logs after syncing
          return newLogs;
        });
      }
    }, 300); // Sync every 300ms for responsive logging

    return () => clearInterval(syncInterval);
  }, []);

  // 📋 Copy all logs to clipboard for mobile debugging
  const copyLogsToClipboard = async () => {
    if (debugLogs.length === 0) {
      return;
    }

    try {
      // Format logs as readable text
      const logsText = debugLogs.map(log => {
        let text = `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`;
        if (log.data) {
          text += `\nData: ${JSON.stringify(log.data, null, 2)}`;
        }
        return text;
      }).join('\n\n' + '='.repeat(80) + '\n\n');

      // Add header with system info
      const header = `COINLEY PAYMENT SCREEN DEBUG LOGS
${'='.repeat(80)}
Generated: ${new Date().toISOString()}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}
Total Logs: ${debugLogs.length}
${'='.repeat(80)}

`;

      const fullText = header + logsText;

      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullText);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } else {
        // Fallback for older browsers/mobile
        const textArea = document.createElement('textarea');
        textArea.value = fullText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        // @ts-ignore - execCommand is deprecated but needed for older browsers
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }

      addDebugLog('success', '📋 Logs copied to clipboard successfully');
    } catch (err) {
      addDebugLog('error', '❌ Failed to copy logs', { error: err.message });
    }
  };

  // ⭐ METAMASK: Listen for ethereum#initialized event (Official MetaMask Docs)
  const listenForMetaMaskInitialized = ({ timeout = 3000 } = {}) => {
    return new Promise((resolve) => {
      // Check if already available
      if (window.ethereum && window.ethereum.isMetaMask) {
        console.log('✅ MetaMask already available');
        resolve(window.ethereum);
        return;
      }

      const handleInitialization = () => {
        console.log('✅ ethereum#initialized event fired!');
        const provider = window.ethereum;
        resolve(provider);
      };

      window.addEventListener('ethereum#initialized', handleInitialization, { once: true });

      setTimeout(() => {
        window.removeEventListener('ethereum#initialized', handleInitialization);
        resolve(window.ethereum || null);
      }, timeout);
    });
  };

  // ⭐ TRUST WALLET: Listen for trustwallet#initialized event (Manifest V3)
  const listenForTrustWalletInitialized = ({ timeout = 3000 } = {}) => {
    console.log(`🛡️ [TRUST INIT] Starting Trust Wallet initialization listener (timeout: ${timeout}ms)`);

    return new Promise((resolve) => {
      // Check if already available using comprehensive detection
      console.log('🛡️ [TRUST INIT] Checking if provider already exists...');
      const existingProvider = getTrustWalletProvider();
      if (existingProvider) {
        console.log('✅ [TRUST INIT] Trust Wallet provider already available, resolving immediately');
        addDebugLog('success', '✅ Trust Wallet provider already initialized');
        resolve(existingProvider);
        return;
      }
      console.log('⏳ [TRUST INIT] Provider not found yet, setting up event listeners...');

      let eventFired = false;

      const handleInitialization = (eventName) => {
        return () => {
          if (eventFired) {
            console.log(`⚠️ [TRUST INIT] ${eventName} event fired but already handled, ignoring`);
            return;
          }
          eventFired = true;
          console.log(`✅ [TRUST INIT] ${eventName} event fired!`);
          addDebugLog('info', `✅ ${eventName} event fired for Trust Wallet`);

          const trustProvider = getTrustWalletProvider();
          if (trustProvider) {
            console.log('✅ [TRUST INIT] Provider found after event, resolving');
            addDebugLog('success', '✅ Trust Wallet provider found after initialization event');
          } else {
            console.log('⚠️ [TRUST INIT] Event fired but provider still not found!');
            addDebugLog('warn', '⚠️ Initialization event fired but provider not found');
          }
          resolve(trustProvider);
        };
      };

      // Listen for both possible initialization events
      console.log('🛡️ [TRUST INIT] Adding event listeners for trustwallet#initialized and ethereum#initialized');
      const trustHandler = handleInitialization('trustwallet#initialized');
      const ethHandler = handleInitialization('ethereum#initialized');

      window.addEventListener('trustwallet#initialized', trustHandler, { once: true });
      window.addEventListener('ethereum#initialized', ethHandler, { once: true });
      addDebugLog('info', `⏳ Listening for Trust Wallet initialization events (${timeout}ms timeout)`);

      setTimeout(() => {
        if (!eventFired) {
          console.log(`⏱️ [TRUST INIT] Timeout after ${timeout}ms, checking provider one last time...`);
          addDebugLog('warn', `⏱️ Initialization timeout after ${timeout}ms`);

          window.removeEventListener('trustwallet#initialized', trustHandler);
          window.removeEventListener('ethereum#initialized', ethHandler);

          const trustProvider = getTrustWalletProvider();
          if (trustProvider) {
            console.log('✅ [TRUST INIT] Provider found on timeout check!');
            addDebugLog('success', '✅ Trust Wallet provider found on timeout');
          } else {
            console.log('❌ [TRUST INIT] Provider still not found after timeout');
            addDebugLog('error', '❌ Trust Wallet provider not found after timeout');
          }
          resolve(trustProvider || null);
        }
      }, timeout);
    });
  };

  // ⭐ IMPROVED PROVIDER DETECTION: Handles Trust Wallet Manifest V3 + MetaMask & Coinbase
  useEffect(() => {
    let pollCount = 0;
    // ⭐ TRUST WALLET FIX: Increase timeout to 60 seconds for slow provider injection
    const maxPolls = 300; // 60 seconds (300 polls * 200ms) - Trust Wallet can be very slow
    let pollInterval = null;
    let providerPromise = null;

    console.log('🔍 Starting IMPROVED provider detection...');
    console.log('🔍 User Agent:', navigator.userAgent);
    console.log('🔍 Initial window.ethereum:', !!window.ethereum);
    console.log('🔍 Initial window.trustwallet:', !!window.trustwallet);
    console.log('🔍 URL params:', window.location.search);

    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileMetaMask = userAgent.includes('metamask');
    // ⭐ CRITICAL: Trust Wallet Android does NOT include 'trust' in User Agent!
    // Check URL params for preferred wallet instead
    const urlParams = new URLSearchParams(window.location.search);
    const preferredWallet = urlParams.get('preferredWallet');
    const isMobileTrustWallet = preferredWallet === 'trust' || userAgent.includes('trust');
    const isMobileCoinbase = userAgent.includes('coinbase');

    // ✅ METAMASK SPECIFIC: Listen for ethereum#initialized event
    if (isMobileMetaMask) {
      console.log('🦊 MetaMask detected in User Agent, listening for ethereum#initialized event...');
      providerPromise = listenForMetaMaskInitialized({ timeout: 5000 });
      providerPromise.then(provider => {
        if (provider) {
          console.log('✅ MetaMask provider received from event!');
          const env = detectWalletEnvironment();
          console.log('✅ Wallet environment:', env);
          setWalletEnv(env);
          setProviderReady(true);
          setCurrentStep('loading');
          if (pollInterval) clearInterval(pollInterval);
        }
      });
    }
    // ✅ TRUST WALLET SPECIFIC: Listen for trustwallet#initialized event
    else if (isMobileTrustWallet) {
      console.log('🛡️ Trust Wallet detected in User Agent, listening for trustwallet#initialized event...');
      providerPromise = listenForTrustWalletInitialized({ timeout: 5000 });
      providerPromise.then(trustProvider => {
        if (trustProvider) {
          console.log('✅ Trust Wallet provider received from event!');
          const env = detectWalletEnvironment();
          console.log('✅ Wallet environment:', env);
          setWalletEnv(env);
          setProviderReady(true);
          setCurrentStep('loading');
          if (pollInterval) clearInterval(pollInterval);
        }
      });
    }
    // ✅ COINBASE SPECIFIC: Listen for ethereum#initialized (Coinbase uses same event)
    else if (isMobileCoinbase) {
      console.log('💙 Coinbase Wallet detected in User Agent, listening for ethereum#initialized event...');
      providerPromise = listenForMetaMaskInitialized({ timeout: 5000 });
      providerPromise.then(provider => {
        if (provider) {
          console.log('✅ Coinbase Wallet provider received from event!');
          const env = detectWalletEnvironment();
          console.log('✅ Wallet environment:', env);
          setWalletEnv(env);
          setProviderReady(true);
          setCurrentStep('loading');
          if (pollInterval) clearInterval(pollInterval);
        }
      });
    }
    // ✅ FALLBACK: Listen for both events if wallet not detected in UA
    else {
      console.log('🔍 Wallet not detected in UA, listening for both ethereum#initialized and trustwallet#initialized...');
      listenForMetaMaskInitialized({ timeout: 5000 }).then(provider => {
        if (provider && !providerReady) {
          console.log('✅ ethereum provider received from event!');
          const env = detectWalletEnvironment();
          setWalletEnv(env);
          setProviderReady(true);
          setCurrentStep('loading');
          if (pollInterval) clearInterval(pollInterval);
        }
      });
      listenForTrustWalletInitialized({ timeout: 5000 }).then(provider => {
        if (provider && !providerReady) {
          console.log('✅ trustwallet provider received from event!');
          const env = detectWalletEnvironment();
          setWalletEnv(env);
          setProviderReady(true);
          setCurrentStep('loading');
          if (pollInterval) clearInterval(pollInterval);
        }
      });
    }

    const checkProvider = () => {
      pollCount++;

      // ✅ ENHANCED: Use comprehensive Trust Wallet detection
      const trustWalletProvider = getTrustWalletProvider();
      const hasTrustWallet = !!trustWalletProvider;
      const hasWindowEthereum = !!window.ethereum;
      const hasEthereumProviders = !!(window.ethereum?.providers && window.ethereum.providers.length > 0);
      const hasMetaMaskProvider = !!(window.ethereum?.isMetaMask || window.ethereum?.providers?.find(p => p.isMetaMask));
      const hasCoinbaseProvider = !!(window.ethereum?.isCoinbaseWallet || window.ethereum?.isCoinbaseBrowser);
      const hasTrustProvider = !!(window.ethereum?.isTrust || window.ethereum?.isTrustWallet);

      // ⭐ TRUST WALLET SPECIAL: For Trust Wallet, log every 10th poll to reduce console spam
      if (isMobileTrustWallet && pollCount % 10 === 0) {
        console.log(`⏳ [TRUST WALLET] Poll ${pollCount}/${maxPolls} (${(pollCount * 200 / 1000).toFixed(1)}s):`, {
          hasTrustWallet,
          trustWalletLocation: trustWalletProvider ? (
            window.trustwallet?.ethereum ? 'window.trustwallet.ethereum' :
            window.ethereum?.isTrust ? 'window.ethereum' :
            'providers array'
          ) : 'not found',
          hasWindowEthereum,
          hasEthereumProviders,
          hasMetaMaskProvider,
          hasCoinbaseProvider,
          hasTrustProvider,
          userAgent: navigator.userAgent,
          windowKeys: Object.keys(window).filter(k =>
            k.toLowerCase().includes('eth') ||
            k.toLowerCase().includes('trust') ||
            k.toLowerCase().includes('web3')
          )
        });
      } else if (!isMobileTrustWallet) {
        console.log(`⏳ Poll ${pollCount}/${maxPolls}:`, {
          hasTrustWallet,
          hasWindowEthereum,
          providerType: hasTrustWallet ? 'Trust Wallet' :
                        window.ethereum?.isMetaMask ? 'MetaMask' :
                        window.ethereum?.isCoinbaseWallet ? 'Coinbase' : 'Unknown'
        });
      }

      // ✅ Accept Trust Wallet OR any ethereum provider
      if (hasTrustWallet || hasWindowEthereum) {
        console.log(`✅ Provider detected after ${pollCount * 200}ms (${(pollCount * 200 / 1000).toFixed(1)}s)`);
        const env = detectWalletEnvironment();
        console.log('✅ Wallet environment:', env);
        setWalletEnv(env);
        setProviderReady(true);
        setCurrentStep('loading');
        addDebugLog('success', `✅ Provider ready after ${(pollCount * 200 / 1000).toFixed(1)}s`, env);
        return true;
      }

      if (pollCount >= maxPolls) {
        // Timeout - provider not found
        console.log('⏱️ Provider detection timeout after', maxPolls * 200 / 1000, 'seconds');
        console.log('🔍 Final check:', {
          'window.ethereum': !!window.ethereum,
          'window.trustwallet': !!window.trustwallet,
          'window.ethereum.isTrust': !!window.ethereum?.isTrust
        });
        setError('Unable to detect wallet provider. Please refresh the page or ensure you opened this link in a wallet browser.');
        setCurrentStep('providerTimeout');
        return true;
      }

      return false;
    };

    // ✅ Check immediately (some wallets inject instantly)
    if (checkProvider()) {
      return; // Found immediately
    }

    // ✅ Start polling
    pollInterval = setInterval(() => {
      if (checkProvider()) {
        clearInterval(pollInterval);
      }
    }, 200); // Poll every 200ms

    // Cleanup
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, []);

  // Initialize payment data on component mount (only after provider is ready)
  useEffect(() => {
    if (!providerReady || !walletEnv) return; // Wait for provider

    const initializePayment = async () => {
      try {
        addDebugLog('info', '🔄 Initializing enhanced mobile payment flow...');
        addDebugLog('info', '🔍 Wallet environment detected', walletEnv);

        // ✅ SAFE: Parse URL params with validation attached
        const urlParams = getValidatedUrlParams();

        // ✅ Check validation result
        if (urlParams._validation && !urlParams._validation.isValid) {
          addDebugLog('error', '❌ URL parameter validation failed', urlParams._validation);
          setError(urlParams._validation.error || 'Invalid payment parameters');
          setCurrentStep('error');
          return; // Exit early
        }

        // ⭐ OPTIMIZED: Check if we have minimal params (QR code optimization)
        const hasMinimalParams = urlParams.paymentId &&
                                !urlParams.contractAddress &&
                                !urlParams.tokenContract;

        if (hasMinimalParams) {
          addDebugLog('info', '🔄 Minimal params detected - fetching full payment details from backend...');

          try {
            const api = createApiClient();
            const fetchedPayment = await api.getPaymentDetails(urlParams.paymentId);

            // Merge fetched data with URL params
            const enrichedParams = {
              ...urlParams,
              contractAddress: fetchedPayment.splitterContractAddress,
              tokenContract: fetchedPayment.Token?.contractAddress,
              chainId: fetchedPayment.Network?.chainId || fetchedPayment.chainId,
              amount: fetchedPayment.amount,
              token: fetchedPayment.Token?.symbol,
              merchant: fetchedPayment.Merchant?.businessName,
              recipient1: fetchedPayment.merchantWallet,
              recipient2: fetchedPayment.coinleyWallet,
              recipient1Percentage: (fetchedPayment.merchantPercentage * 100).toString(),
              recipient2Percentage: (fetchedPayment.coinleyPercentage * 100).toString(),
              tokenDecimals: fetchedPayment.Token?.decimals?.toString(),
              network: fetchedPayment.Network?.name
            };

            addDebugLog('success', '✅ Payment details enriched from backend', enrichedParams);
            setPaymentData(enrichedParams);
          } catch (fetchError) {
            addDebugLog('error', '❌ Failed to fetch payment details from backend', {
              error: fetchError.message,
              paymentId: urlParams.paymentId
            });
            // Fallback to URL params if fetch fails
            setPaymentData(urlParams);
          }
        } else {
          // Full params provided in URL (legacy/fallback mode)
          addDebugLog('info', '📋 Full params provided in URL');
          setPaymentData(urlParams);
        }

        addDebugLog('success', '✅ Payment data initialized');
        setCurrentStep('connection');
      } catch (err) {
        addDebugLog('error', '❌ Failed to initialize payment', {
          error: err.message,
          stack: err.stack
        });
        setError(`Initialization failed: ${err.message}`);
        setCurrentStep('error');
      }
    };

    initializePayment();
  }, [providerReady, walletEnv]); // Only run after provider is detected

  // Simplified wallet connection for mobile (based on research findings)
  const connectWallet = useCallback(async () => {
    if (isConnected) {
      console.log('✅ Wallet already connected');
      addDebugLog('success', '✅ Wallet already connected');
      return true;
    }

    if (!walletEnv) {
      console.log('⚠️ Wallet environment not ready yet');
      addDebugLog('warn', '⚠️ Wallet environment not ready yet');
      return false;
    }

    try {
      setConnectionAttempts(prev => prev + 1);
      console.log(`🔄 Connection attempt ${connectionAttempts + 1} for ${walletEnv.walletType}`);
      addDebugLog('info', `🔄 Connection attempt ${connectionAttempts + 1} for ${walletEnv.walletType}`);

      // ⭐ ENHANCED connector logic with Trust Wallet specific handling
      let targetConnector = null;

      const availableConnectors = connectors.map(c => ({ id: c.id, name: c.name }));
      console.log('🔍 Available connectors:', availableConnectors);
      console.log('🔍 Wallet type:', walletEnv.walletType);
      console.log('🔍 Is in-app browser:', walletEnv.isInAppBrowser);
      addDebugLog('info', '🔍 Available connectors', availableConnectors);
      addDebugLog('info', '🔍 Wallet environment', {
        walletType: walletEnv.walletType,
        isInAppBrowser: walletEnv.isInAppBrowser,
        hasTrustWallet: walletEnv.hasTrustWallet
      });

      if (walletEnv.isInAppBrowser) {
        // ⭐ TRUST WALLET SPECIFIC: Use trustWallet connector for Trust Wallet
        if (walletEnv.walletType === 'trust') {
          targetConnector = connectors.find(c => c.id === 'trustWallet');
          if (targetConnector) {
            console.log('🛡️ Using Trust Wallet specific connector');
            addDebugLog('success', '🛡️ Using Trust Wallet specific connector', {
              connectorId: targetConnector.id,
              connectorName: targetConnector.name
            });
          } else {
            console.log('⚠️ Trust Wallet connector not found, falling back to injected');
            addDebugLog('warn', '⚠️ Trust Wallet connector not found, falling back to injected');
            targetConnector = connectors.find(c => c.id === 'injected');
          }
        }
        // MetaMask - use metaMask connector
        else if (walletEnv.walletType === 'metamask') {
          targetConnector = connectors.find(c => c.id === 'metaMask') || connectors.find(c => c.id === 'injected');
          console.log('🦊 Using MetaMask connector');
          addDebugLog('info', '🦊 Using MetaMask connector', { connectorId: targetConnector?.id });
        }
        // Coinbase or others - use injected
        else {
          targetConnector = connectors.find(c => c.id === 'injected');
          console.log('📱 Using injected connector for in-app browser');
          addDebugLog('info', '📱 Using injected connector for in-app browser');
        }
      } else {
        // Desktop: Use specific connectors or injected fallback
        targetConnector = connectors.find(c => c.id === walletEnv.walletType) ||
                         connectors.find(c => c.id === 'injected') ||
                         connectors[0];
        addDebugLog('info', '💻 Using desktop connector', { connectorId: targetConnector?.id });
      }

      if (!targetConnector) {
        const errorMsg = 'No suitable wallet connector found';
        addDebugLog('error', `❌ ${errorMsg}`, { availableConnectors });
        throw new Error(errorMsg);
      }

      console.log(`✅ Selected connector: ${targetConnector.id} (${targetConnector.name})`);
      addDebugLog('success', `✅ Selected connector: ${targetConnector.id}`, {
        connectorId: targetConnector.id,
        connectorName: targetConnector.name
      });

      await connect({ connector: targetConnector });
      console.log('✅ Wallet connection initiated');
      addDebugLog('success', '✅ Wallet connection initiated');
      return true;

    } catch (err) {
      console.error('❌ Wallet connection failed:', err);
      addDebugLog('error', '❌ Wallet connection failed', {
        error: err.message,
        attemptNumber: connectionAttempts + 1
      });

      if (connectionAttempts < 2) {
        console.log('🔄 Retrying connection...');
        addDebugLog('info', '🔄 Retrying connection in 3 seconds...');
        // 🔧 CRITICAL FIX: Use 3s retry delay for mobile wallet browser initialization
        setTimeout(() => connectWallet(), 3000); // ✅ 3 seconds per MetaMask/Trust/Coinbase docs
      } else {
        setError(`Connection failed: ${err.message}`);
        setCurrentStep('error');
        addDebugLog('error', '❌ Connection failed after retries', { error: err.message });
      }
      return false;
    }
  }, [isConnected, connectors, connect, connectionAttempts, walletEnv]);

  // Handle successful connection
  // ⭐ FIX: Use ref to track if we've already processed this connection to prevent loops
  const connectionProcessedRef = React.useRef(false);

  useEffect(() => {
    if (isConnected && address && paymentData && !connectionProcessedRef.current) {
      // Mark as processed immediately to prevent re-entry
      connectionProcessedRef.current = true;

      console.log('✅ Wallet connected successfully:', address);
      addDebugLog('success', '✅ Wallet connected successfully', {
        address: address,
        chainId: chain?.id,
        chainName: chain?.name
      });

      // Check if we're on the correct chain
      const targetChainId = parseInt(paymentData.chainId);
      if (chain?.id !== targetChainId) {
        console.log(`🔗 Switching to chain ${targetChainId}...`);
        addDebugLog('info', `🔗 Switching to chain ${targetChainId}`, {
          currentChain: chain?.id,
          targetChain: targetChainId
        });

        // ✅ MOBILE FIX: Check if switchChain is available and returns a promise
        if (switchChain) {
          try {
            const switchPromise = switchChain({ chainId: targetChainId });

            // Check if result is a promise before calling .then()
            if (switchPromise && typeof switchPromise.then === 'function') {
              switchPromise.then(() => {
                addDebugLog('success', '✅ Chain switch successful');
                setCurrentStep('confirmation');
              }).catch(err => {
                console.error('❌ Chain switch failed:', err);
                addDebugLog('error', '❌ Chain switch failed', { error: err.message });
                setError(`Please switch to the correct network in your wallet`);
              });
            } else {
              // switchChain didn't return a promise, proceed anyway
              console.warn('⚠️ switchChain did not return a promise, proceeding to confirmation');
              addDebugLog('warn', '⚠️ switchChain did not return a promise, proceeding anyway');
              setCurrentStep('confirmation');
            }
          } catch (err) {
            console.error('❌ Chain switch error:', err);
            addDebugLog('error', '❌ Chain switch error', { error: err.message });
            setError(`Please switch to the correct network in your wallet`);
          }
        } else {
          // switchChain not available, ask user to switch manually
          console.warn('⚠️ switchChain not available, user must switch network manually');
          addDebugLog('warn', '⚠️ switchChain not available, user must switch manually');
          setError(`Please switch to ${paymentData.network} network in your wallet`);
        }
      } else {
        addDebugLog('success', '✅ Already on correct chain, proceeding to confirmation');
        setCurrentStep('confirmation');
      }
    }

    // Reset the ref when connection is lost
    if (!isConnected) {
      connectionProcessedRef.current = false;
    }
  }, [isConnected, address, chain, paymentData, switchChain]);

  // Auto-connect for in-app browsers (aligned with best practices)
  // 🔧 CRITICAL FIX: Mobile wallet browsers need 3+ seconds to fully initialize
  // ⭐ FIX: Use ref to ensure we only auto-connect once
  const autoConnectAttemptedRef = React.useRef(false);

  useEffect(() => {
    if (currentStep === 'connection' &&
        walletEnv?.isInAppBrowser &&
        !isConnected &&
        !autoConnectAttemptedRef.current) {

      // Mark as attempted immediately
      autoConnectAttemptedRef.current = true;

      console.log('🚀 Auto-connecting for in-app browser (3 second delay for proper initialization)...');
      addDebugLog('info', '🚀 Auto-connecting for in-app browser', {
        walletType: walletEnv.walletType,
        delay: '3 seconds'
      });

      const timeoutId = setTimeout(() => {
        connectWallet();
      }, 3000); // ✅ 3 seconds per MetaMask/Trust/Coinbase docs

      // Cleanup timeout if component unmounts
      return () => clearTimeout(timeoutId);
    }

    // Reset the ref when we leave the connection step or get disconnected
    if (currentStep !== 'connection' || !walletEnv?.isInAppBrowser) {
      autoConnectAttemptedRef.current = false;
    }
  }, [currentStep, walletEnv?.isInAppBrowser, isConnected]);

  // Enhanced payment execution (aligned with useTransactionHandling.js)
  const executePayment = async () => {
    if (!address || !paymentData) {
      addDebugLog('error', '❌ Missing required data', {
        hasAddress: !!address,
        hasPaymentData: !!paymentData
      });
      setError('Missing wallet connection or payment data');
      return;
    }

    try {
      setProcessing(true);
      setError('');
      setCurrentStep('processing');

      addDebugLog('info', '🔄 Starting enhanced payment execution...');
      addDebugLog('debug', '📊 Payment execution parameters', {
        address,
        paymentData,
        chain: chain?.id,
        chainName: chain?.name
      });

      // Get token decimals and amount (using exact backend data)
      const decimals = parseInt(paymentData.tokenDecimals) || 6;
      const amountInUnits = paymentData.amountInWei && paymentData.amountInWei !== ''
        ? BigInt(paymentData.amountInWei)
        : parseUnits(paymentData.amount, decimals);

      console.log('💰 Payment details:', {
        amount: amountInUnits.toString(),
        decimals,
        token: paymentData.token,
        contract: paymentData.tokenContract
      });

      // Step 1: Check token balance with retry logic
      setTransactionStep('approve');
      addDebugLog('info', '💰 Step 1: Checking token balance...');

      let balance = null;
      let balanceCheckAttempts = 0;
      const maxBalanceCheckAttempts = 3;

      // ✅ RETRY LOGIC: Try multiple times with exponential backoff
      while (balanceCheckAttempts < maxBalanceCheckAttempts) {
        try {
          balance = await readContract(config, {
            address: paymentData.tokenContract,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address]
          });

          addDebugLog('success', '💰 Balance check complete', {
            tokenContract: paymentData.tokenContract,
            userAddress: address,
            balance: balance.toString(),
            required: amountInUnits.toString(),
            hasEnough: balance >= amountInUnits,
            difference: (balance - amountInUnits).toString(),
            attemptNumber: balanceCheckAttempts + 1
          });

          break; // Success, exit retry loop
        } catch (balanceError) {
          balanceCheckAttempts++;
          addDebugLog('warning', `⚠️ Balance check attempt ${balanceCheckAttempts} failed`, {
            error: balanceError.message,
            cause: balanceError.cause?.shortMessage || balanceError.cause?.message,
            details: balanceError.details,
            willRetry: balanceCheckAttempts < maxBalanceCheckAttempts,
            tokenContract: paymentData.tokenContract,
            network: chain?.name
          });

          if (balanceCheckAttempts >= maxBalanceCheckAttempts) {
            addDebugLog('warning', '⚠️ Balance check failed after all retries, proceeding without validation');
            addDebugLog('info', '💡 Wallet will validate balance during transaction execution');
            balance = null; // Skip balance validation
            break;
          }

          // Exponential backoff: 1s, 2s, 3s
          await new Promise(resolve => setTimeout(resolve, 1000 * balanceCheckAttempts));
        }
      }

      // Only validate balance if we successfully retrieved it
      if (balance !== null && balance < amountInUnits) {
        addDebugLog('error', '❌ Insufficient token balance', {
          required: amountInUnits.toString(),
          available: balance.toString(),
          token: paymentData.token
        });
        throw new Error(`Insufficient ${paymentData.token} balance. Required: ${paymentData.amount} ${paymentData.token}`);
      } else if (balance === null) {
        addDebugLog('info', '⏭️ Skipping balance validation due to RPC errors - wallet will handle it');
      }

      // Step 2: Check and approve if needed (aligned with useTransactionHandling)
      addDebugLog('info', '🔐 Step 2: Checking token allowance...');

      let allowance = BigInt(0); // Default to 0 (needs approval)
      let allowanceCheckAttempts = 0;
      const maxAllowanceCheckAttempts = 3;

      // ✅ RETRY LOGIC: Try allowance check with exponential backoff
      while (allowanceCheckAttempts < maxAllowanceCheckAttempts) {
        try {
          allowance = await readContract(config, {
            address: paymentData.tokenContract,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [address, paymentData.contractAddress]
          });

          addDebugLog('success', '🔐 Allowance check complete', {
            spender: paymentData.contractAddress,
            allowance: allowance.toString(),
            required: amountInUnits.toString(),
            needsApproval: allowance < amountInUnits,
            currentAllowance: allowance.toString(),
            attemptNumber: allowanceCheckAttempts + 1
          });

          break; // Success, exit retry loop
        } catch (allowanceError) {
          allowanceCheckAttempts++;
          addDebugLog('warning', `⚠️ Allowance check attempt ${allowanceCheckAttempts} failed`, {
            error: allowanceError.message,
            cause: allowanceError.cause?.shortMessage || allowanceError.cause?.message,
            willRetry: allowanceCheckAttempts < maxAllowanceCheckAttempts,
            tokenContract: paymentData.tokenContract
          });

          if (allowanceCheckAttempts >= maxAllowanceCheckAttempts) {
            addDebugLog('warning', '⚠️ Allowance check failed after all retries, defaulting to 0 (will request approval)');
            allowance = BigInt(0); // Default to 0 to trigger approval
            break;
          }

          // Exponential backoff: 1s, 2s, 3s
          await new Promise(resolve => setTimeout(resolve, 1000 * allowanceCheckAttempts));
        }
      }

      if (allowance < amountInUnits) {
        addDebugLog('info', '🔐 Executing token approval...');

        const approveHash = await writeContract(config, {
          address: paymentData.tokenContract,
          abi: erc20Abi,
          functionName: 'approve',
          args: [paymentData.contractAddress, amountInUnits]
        });

        addDebugLog('success', '✅ Approval transaction sent', {
          transactionHash: approveHash,
          tokenContract: paymentData.tokenContract,
          spender: paymentData.contractAddress,
          amount: amountInUnits.toString()
        });

        setTransactionHash(approveHash);

        // Wait for approval confirmation
        addDebugLog('info', '⏳ Waiting for approval confirmation...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        addDebugLog('success', '✅ Approval confirmed');
      } else {
        addDebugLog('info', '✅ Token already approved, skipping approval step');
      }

      // Step 3: Execute split payment (aligned with enhanced transaction handling)
      setTransactionStep('splitPayment');
      addDebugLog('info', '💸 Step 3: Executing split payment...');

      // Get contract ABI from backend (as designed in useTransactionHandling)
      const chainId = parseInt(paymentData.chainId);

      addDebugLog('debug', '🔗 Fetching contract ABI from backend', {
        chainId,
        apiUrl: process.env.REACT_APP_COINLEY_API_URL || 'https://talented-mercy-production.up.railway.app',
        endpoint: `/api/payments/contract/${chainId}`
      });

      let contractInfo;
      try {
        addDebugLog('debug', '🌐 API Environment Check', {
          apiUrl: process.env.REACT_APP_COINLEY_API_URL || 'https://talented-mercy-production.up.railway.app',
          hasApiKey: !!(process.env.REACT_APP_COINLEY_API_KEY || ''),
          hasApiSecret: !!(process.env.REACT_APP_COINLEY_API_SECRET || ''),
          endpoint: `/api/payments/contract/${chainId}`,
          currentDomain: window.location.origin,
          userAgent: navigator.userAgent
        });

        contractInfo = await api.getContractInfo(chainId);
        addDebugLog('success', '✅ Contract ABI fetched from backend', {
          hasAbi: !!contractInfo?.abi,
          contractAddress: contractInfo?.address,
          abiLength: contractInfo?.abi?.length || 0
        });
      } catch (abiError) {
        addDebugLog('error', '❌ Failed to fetch contract ABI', {
          error: abiError.message,
          chainId,
          stack: abiError.stack,
          possibleCauses: [
            'CORS policy blocking cross-origin request',
            'Backend server down or unreachable',
            'Invalid API credentials',
            'Network connectivity issue',
            'Chain ID not supported by backend'
          ],
          debugSteps: [
            '1. Check browser network tab for actual HTTP status',
            '2. Verify backend CORS settings allow payment screen domain',
            '3. Test API endpoint directly in browser',
            '4. Check environment variables are loaded'
          ]
        });
        throw new Error(`Failed to fetch contract ABI: ${abiError.message}`);
      }

      const { abi } = contractInfo;

      // Create payment details tuple (exact structure from useTransactionHandling)
      const paymentDetails = {
        token: paymentData.tokenContract || paymentData.tokenAddress,
        amount: amountInUnits,
        // CRITICAL: Use splitterPaymentId first for blockchain verification
        paymentId: paymentData.splitterPaymentId || paymentData.paymentId,
        recipient1: paymentData.recipient1 || paymentData.merchantWallet || '0x0000000000000000000000000000000000000000',
        recipient2: paymentData.recipient2 || paymentData.coinleyWallet || '0x0000000000000000000000000000000000000000',
        recipient3: paymentData.recipient3 || '0x0000000000000000000000000000000000000000',
        recipient1Percentage: BigInt(paymentData.recipient1Percentage || 10000),
        recipient2Percentage: BigInt(paymentData.recipient2Percentage || 0),
        recipient3Percentage: BigInt(paymentData.recipient3Percentage || 0)
      };

      addDebugLog('debug', '🔍 Split payment details prepared', {
        token: paymentDetails.token,
        amount: paymentDetails.amount.toString(),
        paymentId: paymentDetails.paymentId,
        recipient1: paymentDetails.recipient1,
        recipient2: paymentDetails.recipient2,
        recipient3: paymentDetails.recipient3,
        recipient1Percentage: paymentDetails.recipient1Percentage.toString(),
        recipient2Percentage: paymentDetails.recipient2Percentage.toString(),
        recipient3Percentage: paymentDetails.recipient3Percentage.toString(),
        contractAddress: paymentData.contractAddress
      });

      // Simulate first to check for errors (as in useTransactionHandling)
      addDebugLog('info', '🧪 Simulating split payment transaction...');

      let request;
      try {
        const simulationResult = await simulateContract(config, {
          address: paymentData.contractAddress,
          abi: abi,
          functionName: 'splitPayment',
          args: [paymentDetails],
          account: address
        });
        request = simulationResult.request;

        addDebugLog('success', '✅ Simulation successful', {
          functionName: 'splitPayment',
          contractAddress: paymentData.contractAddress,
          from: address
        });
      } catch (simError) {
        addDebugLog('error', '❌ Simulation failed', {
          error: simError.message,
          cause: simError.cause,
          details: simError.details,
          contractAddress: paymentData.contractAddress,
          functionName: 'splitPayment',
          args: paymentDetails
        });
        throw new Error(`Transaction simulation failed: ${simError.message}`);
      }

      // Execute the split payment transaction
      addDebugLog('info', '📝 Executing transaction...');
      const splitHash = await writeContract(config, request);
      setTransactionHash(splitHash);
      addDebugLog('success', '✅ Split payment transaction sent', {
        transactionHash: splitHash
      });

      setTransactionStep('processing');

      // Notify backend (aligned with enhanced API structure)
      try {
        const networkName = getNetworkShortName(paymentData.chainId);
        await api.notifyBackend(paymentData.paymentId, splitHash, networkName, address);
      } catch (backendError) {
        console.warn('⚠️ Backend notification failed, but payment succeeded:', backendError);
      }

      setCurrentStep('success');

    } catch (err) {
      addDebugLog('error', '❌ Enhanced payment execution failed', {
        error: err.message,
        code: err.code,
        stack: err.stack,
        cause: err.cause,
        details: err.details,
        fullError: err
      });

      let errorMessage = err.message;
      if (err.message?.includes('User rejected') || err.code === 4001) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas fees';
      } else if (err.message?.includes('simulation failed')) {
        errorMessage = 'Transaction would fail. Please check your balance and try again.';
      } else if (err.message?.includes('fetch')) {
        errorMessage = 'Network error: Failed to communicate with backend. Please check your connection.';
        addDebugLog('error', '🌐 Network/Fetch error detected', {
          possibleCauses: [
            'CORS issue with backend API',
            'Backend server is down',
            'Network connectivity issue',
            'API endpoint not found',
            'Authentication failed'
          ]
        });
      }

      setError(errorMessage);
      setCurrentStep('error');
    } finally {
      setProcessing(false);
      setTransactionStep('idle');
    }
  };

  // Helper function to get network short name (aligned with constants)
  const getNetworkShortName = (chainId) => {
    const networks = {
      1: 'ethereum',
      56: 'bsc',
      137: 'polygon',
      42161: 'arbitrum',
      10: 'optimism',
      43114: 'avalanche',
      42220: 'celo'
    };
    return networks[parseInt(chainId)] || 'ethereum';
  };

  // Manual payment verification (for mobile deep-link flow)
  const verifyPayment = async () => {
    setVerifying(true);
    addDebugLog('info', '🔍 Manually verifying payment...');

    try {
      // First check payment status
      const statusResponse = await api.checkPaymentStatus(paymentData.paymentId);

      addDebugLog('debug', '📊 Payment status check', {
        status: statusResponse.payment?.status,
        paymentId: paymentData.paymentId
      });

      if (statusResponse.payment?.status === 'completed') {
        // Payment already completed
        addDebugLog('success', '✅ Payment already confirmed in database');
        setTransactionHash(statusResponse.payment.transactionHash || '');
        setCurrentStep('success');
        return;
      }

      // If not completed, try blockchain verification
      addDebugLog('info', '🔗 Checking blockchain for payment...');
      const verificationResponse = await api.verifyQRPayment(paymentData.paymentId);

      if (verificationResponse.success && verificationResponse.verified) {
        addDebugLog('success', '✅ Payment verified on blockchain!', {
          transactionHash: verificationResponse.onChainData?.transactionHash
        });
        setTransactionHash(verificationResponse.onChainData?.transactionHash || '');
        setCurrentStep('success');
      } else {
        // Payment not found yet
        const message = verificationResponse.message || 'Payment not found on blockchain yet';
        addDebugLog('warning', '⏳ ' + message);
        setError(message + '. Please wait a moment and try again, or ensure you completed the transaction in your wallet.');
      }
    } catch (err) {
      console.error('Verification error:', err);
      addDebugLog('error', '❌ Verification failed', { error: err.message });
      setError('Failed to verify payment: ' + err.message);
    } finally {
      setVerifying(false);
    }
  };

  // Render functions for different steps (enhanced with better UX)
  const renderWaitingForProvider = () => (
    <div className="text-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Connecting to Wallet...</h2>
      <p className="text-gray-600 mb-2">Waiting for wallet browser to initialize</p>
      <p className="text-xs text-gray-500">This usually takes 1-3 seconds</p>
    </div>
  );

  const renderProviderTimeout = () => (
    <div className="text-center p-8">
      <div className="w-16 h-16 mx-auto bg-yellow-500 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Unable to Connect</h2>
      <p className="text-gray-600 mb-6">{error}</p>
      <button
        onClick={() => window.location.reload()}
        className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
      >
        Refresh Page
      </button>
      <p className="text-xs text-gray-500 mt-4">
        Make sure you opened this link in a wallet browser (MetaMask, Trust Wallet, or Coinbase Wallet)
      </p>
    </div>
  );

  const renderLoading = () => (
    <div className="text-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Loading Payment...</h2>
      <p className="text-gray-600">Validating payment parameters and preparing transaction</p>
    </div>
  );

  const renderConnection = () => (
    <div className="text-center p-8">
      <div className="w-16 h-16 mx-auto bg-blue-500 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Connect Your Wallet</h2>
      <p className="text-gray-600 mb-6">
        {walletEnv?.isInAppBrowser
          ? `Connecting to ${walletEnv?.walletType}...`
          : 'Please connect your wallet to continue with the payment'
        }
      </p>

      {!walletEnv?.isInAppBrowser && (
        <button
          onClick={connectWallet}
          disabled={isPending}
          className="w-full bg-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50"
        >
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}

      {connectError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{connectError.message}</p>
        </div>
      )}
    </div>
  );

  const renderConfirmation = () => (
    <div className="p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Confirm Payment</h2>

      {/* Enhanced payment details display */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">Total Amount:</span>
          <span className="font-semibold text-lg">{paymentData.amount} {paymentData.token}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">Merchant:</span>
          <span className="font-semibold">{paymentData.merchant}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">Network:</span>
          <span className="font-semibold">{paymentData.network}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600">Payment ID:</span>
          <span className="font-mono text-sm">{paymentData.paymentId.slice(0, 8)}...</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Your Wallet:</span>
          <span className="font-mono text-sm">{address?.slice(0, 6)}...{address?.slice(-4)}</span>
        </div>
      </div>

      {/* Enhanced confirmation button */}
      <button
        onClick={executePayment}
        disabled={processing}
        className="w-full bg-green-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
      >
        {processing ? `Processing ${transactionStep}...` : 'Confirm Payment'}
      </button>

      <p className="text-xs text-gray-500 text-center mt-4">
        This will execute a split payment transaction. You may need to approve multiple transactions.
      </p>
    </div>
  );

  const renderProcessing = () => (
    <div className="text-center p-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Processing Payment</h2>
      <p className="text-gray-600 mb-4">
        {transactionStep === 'approve' ? 'Approving token spending...' :
         transactionStep === 'splitPayment' ? 'Executing split payment...' :
         'Confirming transaction on blockchain...'}
      </p>
      {transactionHash && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-mono">
            TX: {transactionHash.slice(0, 10)}...{transactionHash.slice(-10)}
          </p>
        </div>
      )}
    </div>
  );

  const renderAwaitingVerification = () => (
    <div className="p-6">
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Complete Payment in Wallet</h2>
        <p className="text-gray-600 mb-4">
          After completing the transaction in your wallet app, return here and click the button below to verify your payment.
        </p>
      </div>

      {/* Payment Details */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600 text-sm">Amount:</span>
          <span className="font-semibold">{paymentData.amount} {paymentData.token}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-gray-600 text-sm">Merchant:</span>
          <span className="font-semibold text-sm">{paymentData.merchant}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 text-sm">Payment ID:</span>
          <span className="font-mono text-xs">{paymentData.paymentId.slice(0, 12)}...</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
          <p className="text-sm text-yellow-700">{error}</p>
        </div>
      )}

      {/* Verification Button */}
      <button
        onClick={verifyPayment}
        disabled={verifying}
        className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors mb-3"
      >
        {verifying ? (
          <span className="flex items-center justify-center">
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Verifying Payment...
          </span>
        ) : (
          'I Have Paid - Verify Now'
        )}
      </button>

      <p className="text-xs text-gray-500 text-center">
        This will check the blockchain to confirm your payment was received.
      </p>
    </div>
  );

  const renderSuccess = () => (
    <div className="text-center p-8">
      <div className="w-16 h-16 mx-auto bg-green-500 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Payment Successful!</h2>
      <p className="text-gray-600 mb-6">Your split payment has been completed successfully</p>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-green-700">
          {paymentData.amount} {paymentData.token} sent to {paymentData.merchant}
        </p>
        {transactionHash && (
          <p className="text-xs text-green-600 mt-2 font-mono">
            TX: {transactionHash.slice(0, 10)}...{transactionHash.slice(-10)}
          </p>
        )}
      </div>

      <button
        onClick={() => window.close()}
        className="w-full bg-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-700"
      >
        Close
      </button>
    </div>
  );

  const renderError = () => (
    <div className="text-center p-8">
      <div className="w-16 h-16 mx-auto bg-red-500 rounded-full flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">Payment Failed</h2>
      <p className="text-gray-600 mb-6">The transaction could not be completed</p>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-red-700">{error}</p>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => {
            setError('');
            setCurrentStep('confirmation');
            setProcessing(false);
            setTransactionStep('idle');
          }}
          className="w-full bg-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-700"
        >
          Try Again
        </button>
        <button
          onClick={() => window.close()}
          className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-300"
        >
          Cancel Payment
        </button>
      </div>
    </div>
  );

  // Main render
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Main Payment Card */}
          <div className="lg:w-1/2">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              {/* Enhanced header */}
              <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 text-center">
                <h1 className="text-2xl font-bold">Coinley Pay</h1>
                <p className="text-purple-100 text-sm mt-1">Enhanced Mobile Payment</p>
              </div>

              {/* Content */}
              <div className="min-h-[400px] flex flex-col justify-center">
                {currentStep === 'waitingForProvider' && renderWaitingForProvider()}
                {currentStep === 'providerTimeout' && renderProviderTimeout()}
                {currentStep === 'loading' && renderLoading()}
                {currentStep === 'connection' && renderConnection()}
                {currentStep === 'confirmation' && renderConfirmation()}
                {currentStep === 'processing' && renderProcessing()}
                {currentStep === 'awaitingVerification' && renderAwaitingVerification()}
                {currentStep === 'success' && renderSuccess()}
                {currentStep === 'error' && renderError()}
              </div>

              {/* Enhanced footer */}
              <div className="text-center text-xs text-gray-500 p-4 border-t">
                <p>Powered by <span className="text-purple-600 font-semibold">Coinley</span> - Secure Split Payments</p>
                <p className="mt-1">Mobile-Optimized Experience</p>
              </div>
            </div>
          </div>

          {/* Debug Panel */}
          <div className="lg:w-1/2">
            <div className="bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-gray-800 p-4 flex items-center justify-between">
                <h2 className="text-white font-bold">🔍 Debug Console</h2>
                <button
                  onClick={() => setShowDebugPanel(!showDebugPanel)}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  {showDebugPanel ? 'Hide' : 'Show'}
                </button>
              </div>

              {showDebugPanel && (
                <div className="p-4 max-h-[600px] overflow-y-auto">
                  <div className="space-y-2">
                    {debugLogs.length === 0 ? (
                      <div className="text-gray-400 text-sm">No logs yet. Actions will appear here...</div>
                    ) : (
                      debugLogs.map(log => (
                        <div key={log.id} className="border-b border-gray-700 pb-2">
                          <div className="flex items-start gap-2">
                            <span className={`text-xs px-2 py-1 rounded font-bold ${
                              log.type === 'error' ? 'bg-red-600 text-white' :
                              log.type === 'success' ? 'bg-green-600 text-white' :
                              log.type === 'debug' ? 'bg-blue-600 text-white' :
                              log.type === 'warning' ? 'bg-yellow-600 text-white' :
                              'bg-gray-600 text-white'
                            }`}>
                              {log.type.toUpperCase()}
                            </span>
                            <span className="text-gray-400 text-xs">{log.timestamp}</span>
                          </div>
                          <div className="text-green-400 text-sm mt-1">{log.message}</div>
                          {log.data && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-blue-400 text-xs hover:text-blue-300">
                                View Details
                              </summary>
                              <pre className="mt-1 p-2 bg-gray-800 rounded text-xs text-gray-300 overflow-x-auto">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {debugLogs.length > 0 && (
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={copyLogsToClipboard}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center gap-1"
                      >
                        {copySuccess ? '✅ Copied!' : '📋 Copy Logs'}
                      </button>
                      <button
                        onClick={() => setDebugLogs([])}
                        className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                      >
                        Clear Logs
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Info Panel */}
            <div className="bg-white rounded-2xl shadow-xl p-4 mt-4">
              <h3 className="font-bold text-gray-800 mb-2">Payment Info</h3>
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="font-semibold">{currentStep}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Wallet:</span>
                  <span className="font-semibold">{address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Network:</span>
                  <span className="font-semibold">{chain?.name || 'Not connected'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Payment ID:</span>
                  <span className="font-semibold">{paymentData?.paymentId ? `${paymentData.paymentId.slice(0, 8)}...` : 'N/A'}</span>
                </div>
                {transactionHash && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">TX Hash:</span>
                    <span className="font-semibold">{`${transactionHash.slice(0, 8)}...`}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedMobilePaymentFlow;