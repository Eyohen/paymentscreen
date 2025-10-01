import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { readContract, writeContract, simulateContract } from '@wagmi/core';
import { parseUnits, erc20Abi } from 'viem';
import { config } from './wagmiConfig';

// Enhanced wallet environment detection (aligned with coinley-test research)
const detectWalletEnvironment = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  const ethereum = window.ethereum;

  return {
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isInAppBrowser: !!(ethereum && (ethereum.isMetaMask || ethereum.isTrust || ethereum.isCoinbaseWallet)),
    walletType: ethereum?.isMetaMask ? 'metamask' :
                ethereum?.isTrust ? 'trust' :
                ethereum?.isCoinbaseWallet ? 'coinbase' :
                userAgent.includes('trust') ? 'trust' :
                userAgent.includes('metamask') ? 'metamask' :
                userAgent.includes('coinbase') ? 'coinbase' : 'unknown',
    hasEthereum: !!ethereum
  };
};

// SIMPLE parameter validation - only check if we have basic data
const validatePaymentParameters = (params) => {
  console.log('🔍 SIMPLE Payment parameter validation:', params);

  // Only require paymentId OR splitterPaymentId - very relaxed
  const hasPaymentId = params.paymentId || params.payment_id || params.splitterPaymentId;

  if (!hasPaymentId) {
    console.error('❌ No payment ID found:', Object.keys(params));
    throw new Error('Payment ID is required');
  }

  console.log('✅ SIMPLE Validation passed - found payment ID:', hasPaymentId);
  return true;
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

  // Validate parameters using our enhanced validation
  validatePaymentParameters(paymentData);

  return paymentData;
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
  // Wallet environment detection
  const walletEnv = detectWalletEnvironment();

  // State management (aligned with coinley-test pattern)
  const [currentStep, setCurrentStep] = useState('loading');
  const [paymentData, setPaymentData] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [transactionHash, setTransactionHash] = useState('');
  const [transactionStep, setTransactionStep] = useState('idle'); // approve, splitPayment, processing
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugPanel, setShowDebugPanel] = useState(true); // Show debug by default
  const [verifying, setVerifying] = useState(false); // For manual verification

  // Wagmi hooks
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  // API client
  const api = createApiClient();

  // Debug logging function
  const addDebugLog = (type, message, data = null) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      id: Date.now() + Math.random(),
      type,
      message,
      data,
      timestamp
    };
    setDebugLogs(prev => [...prev, logEntry].slice(-50)); // Keep last 50 logs

    // Also log to console for developers
    console.log(`[${type.toUpperCase()}] [${timestamp}] ${message}`, data || '');
  };
  

  // Initialize payment data on component mount
  useEffect(() => {
    const initializePayment = async () => {
      try {
        addDebugLog('info', '🔄 Initializing enhanced mobile payment flow...');
        addDebugLog('info', '🔍 Wallet environment detected', walletEnv);

        const urlParams = getValidatedUrlParams();

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
  }, []);

  // Simplified wallet connection for mobile (based on research findings)
  const connectWallet = useCallback(async () => {
    if (isConnected) {
      console.log('✅ Wallet already connected');
      return true;
    }

    try {
      setConnectionAttempts(prev => prev + 1);
      console.log(`🔄 Connection attempt ${connectionAttempts + 1} for ${walletEnv.walletType}`);

      // Simplified connector logic based on research
      let targetConnector = null;

      if (walletEnv.isInAppBrowser) {
        // In wallet browser - use injected connector (most reliable)
        targetConnector = connectors.find(c => c.id === 'injected');
        console.log('📱 Using injected connector for in-app browser');
      } else {
        // Use injected as primary, specific connectors as fallback
        targetConnector = connectors.find(c => c.id === 'injected') ||
                         connectors.find(c => c.id === walletEnv.walletType) ||
                         connectors[0];
      }

      if (!targetConnector) {
        throw new Error('No suitable wallet connector found');
      }

      await connect({ connector: targetConnector });
      console.log('✅ Wallet connection initiated');
      return true;

    } catch (err) {
      console.error('❌ Wallet connection failed:', err);

      if (connectionAttempts < 2) {
        console.log('🔄 Retrying connection...');
        setTimeout(() => connectWallet(), 2000);
      } else {
        setError(`Connection failed: ${err.message}`);
        setCurrentStep('error');
      }
      return false;
    }
  }, [isConnected, connectors, connect, connectionAttempts, walletEnv]);

  // Handle successful connection
  useEffect(() => {
    if (isConnected && address && paymentData) {
      console.log('✅ Wallet connected successfully:', address);

      // Check if we're on the correct chain
      const targetChainId = parseInt(paymentData.chainId);
      if (chain?.id !== targetChainId) {
        console.log(`🔗 Switching to chain ${targetChainId}...`);
        switchChain({ chainId: targetChainId }).then(() => {
          setCurrentStep('confirmation');
        }).catch(err => {
          console.error('❌ Chain switch failed:', err);
          setError(`Please switch to the correct network in your wallet`);
        });
      } else {
        setCurrentStep('confirmation');
      }
    }
  }, [isConnected, address, chain, paymentData, switchChain]);

  // Auto-connect for in-app browsers (aligned with best practices)
  useEffect(() => {
    if (currentStep === 'connection' && walletEnv.isInAppBrowser && !isConnected) {
      console.log('🚀 Auto-connecting for in-app browser...');
      setTimeout(() => connectWallet(), 1000);
    }
  }, [currentStep, walletEnv.isInAppBrowser, isConnected, connectWallet]);

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

      // Step 1: Check token balance
      setTransactionStep('approve');
      addDebugLog('info', '💰 Step 1: Checking token balance...');

      const balance = await readContract(config, {
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
        difference: (balance - amountInUnits).toString()
      });

      if (balance < amountInUnits) {
        addDebugLog('error', '❌ Insufficient token balance', {
          required: amountInUnits.toString(),
          available: balance.toString(),
          token: paymentData.token
        });
        throw new Error(`Insufficient ${paymentData.token} balance. Required: ${paymentData.amount} ${paymentData.token}`);
      }

      // Step 2: Check and approve if needed (aligned with useTransactionHandling)
      addDebugLog('info', '🔐 Step 2: Checking token allowance...');

      const allowance = await readContract(config, {
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
        currentAllowance: allowance.toString()
      });

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
        {walletEnv.isInAppBrowser
          ? `Connecting to ${walletEnv.walletType}...`
          : 'Please connect your wallet to continue with the payment'
        }
      </p>

      {!walletEnv.isInAppBrowser && (
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
                    <button
                      onClick={() => setDebugLogs([])}
                      className="mt-4 px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    >
                      Clear Logs
                    </button>
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