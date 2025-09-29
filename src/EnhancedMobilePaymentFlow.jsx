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

// Enhanced parameter validation (aligned with deep link utils)
const validatePaymentParameters = (params) => {
  const required = ['paymentId', 'contractAddress', 'tokenContract', 'chainId', 'amount'];
  const missing = required.filter(param => !params[param] || params[param].trim() === '');

  if (missing.length > 0) {
    throw new Error(`Missing required parameters: ${missing.join(', ')}`);
  }

  // Validate addresses using the same regex as coinley-test
  const addressFields = ['contractAddress', 'tokenContract', 'recipient1', 'recipient2', 'recipient3'];
  for (const field of addressFields) {
    if (params[field] && !/^0x[a-fA-F0-9]{40}$/.test(params[field])) {
      throw new Error(`Invalid address format for ${field}: ${params[field]}`);
    }
  }

  // Validate numeric fields
  const numericFields = ['amount', 'chainId', 'recipient1Percentage', 'recipient2Percentage', 'recipient3Percentage', 'tokenDecimals'];
  for (const field of numericFields) {
    if (params[field] !== undefined && params[field] !== '' && isNaN(Number(params[field]))) {
      throw new Error(`Invalid numeric value for ${field}: ${params[field]}`);
    }
  }

  return true;
};

// Enhanced URL parameter extraction (aligned with deepLinkUtils)
const getValidatedUrlParams = () => {
  const params = new URLSearchParams(window.location.search);
  const paymentData = {
    // Basic payment info
    amount: params.get('amount') || '',
    token: params.get('token') || 'USDC',
    merchant: params.get('merchant') || 'Demo Merchant',
    productAmount: params.get('productAmount') || '',
    platformFee: params.get('platformFee') || '0',
    networkFee: params.get('networkFee') || '0',
    network: params.get('network') || 'Ethereum Mainnet',

    // Contract addresses (critical for PaymentSplitter)
    contractAddress: params.get('contractAddress') || '',
    tokenContract: params.get('tokenContract') || '',
    chainId: params.get('chainId') || '1',

    // Payment ID (required for backend communication)
    paymentId: params.get('paymentId') || '',
    splitterPaymentId: params.get('splitterPaymentId') || '',

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

  // Validate parameters using our enhanced validation
  validatePaymentParameters(paymentData);

  return paymentData;
};

// Enhanced API client (aligned with paymentAPI.js structure)
const createApiClient = () => {
  const apiUrl = process.env.REACT_APP_COINLEY_API_URL || 'https://coinley-backend-production.up.railway.app';
  const apiKey = process.env.REACT_APP_COINLEY_API_KEY || '';
  const apiSecret = process.env.REACT_APP_COINLEY_API_SECRET || '';

  return {
    async getContractInfo(chainId) {
      try {
        const response = await fetch(`${apiUrl}/api/payments/contract/${chainId}`, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'X-API-Secret': apiSecret
          }
        });

        if (!response.ok) {
          throw new Error('Contract not supported on this network');
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error('Contract not supported on this network');
        }

        return result.contractInfo;
      } catch (error) {
        console.error('❌ Failed to get contract info:', error);
        throw new Error(error.message || 'Failed to get contract information');
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
          headers['X-API-Key'] = apiKey;
          headers['X-API-Secret'] = apiSecret;
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

  // Wagmi hooks
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  // API client
  const api = createApiClient();

  // Initialize payment data on component mount
  useEffect(() => {
    const initializePayment = async () => {
      try {
        console.log('🔄 Initializing enhanced mobile payment flow...');
        console.log('🔍 Wallet environment:', walletEnv);

        const urlParams = getValidatedUrlParams();
        setPaymentData(urlParams);

        console.log('✅ Payment data validated:', {
          paymentId: urlParams.paymentId,
          chainId: urlParams.chainId,
          amount: urlParams.amount,
          walletDetected: walletEnv.walletType,
          contractAddress: urlParams.contractAddress,
          tokenContract: urlParams.tokenContract
        });

        setCurrentStep('connection');
      } catch (err) {
        console.error('❌ Failed to initialize payment:', err);
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
      setError('Missing wallet connection or payment data');
      return;
    }

    try {
      setProcessing(true);
      setError('');
      setCurrentStep('processing');

      console.log('🔄 Starting enhanced payment execution...');

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
      const balance = await readContract(config, {
        address: paymentData.tokenContract,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address]
      });

      console.log('💰 Balance check:', {
        balance: balance.toString(),
        required: amountInUnits.toString(),
        hasEnough: balance >= amountInUnits
      });

      if (balance < amountInUnits) {
        throw new Error(`Insufficient ${paymentData.token} balance. Required: ${paymentData.amount} ${paymentData.token}`);
      }

      // Step 2: Check and approve if needed (aligned with useTransactionHandling)
      const allowance = await readContract(config, {
        address: paymentData.tokenContract,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, paymentData.contractAddress]
      });

      console.log('🔐 Allowance check:', {
        allowance: allowance.toString(),
        required: amountInUnits.toString(),
        needsApproval: allowance < amountInUnits
      });

      if (allowance < amountInUnits) {
        console.log('🔐 Executing token approval...');

        const approveHash = await writeContract(config, {
          address: paymentData.tokenContract,
          abi: erc20Abi,
          functionName: 'approve',
          args: [paymentData.contractAddress, amountInUnits]
        });

        console.log('✅ Approval transaction:', approveHash);
        setTransactionHash(approveHash);

        // Wait for approval confirmation
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Step 3: Execute split payment (aligned with enhanced transaction handling)
      setTransactionStep('splitPayment');
      console.log('💸 Executing split payment...');

      // Get contract ABI from backend (as designed in useTransactionHandling)
      const chainId = parseInt(paymentData.chainId);
      const contractInfo = await api.getContractInfo(chainId);
      const { abi } = contractInfo;

      console.log('✅ Contract ABI fetched from backend');

      // Create payment details tuple (exact structure from useTransactionHandling)
      const paymentDetails = {
        token: paymentData.tokenContract,
        amount: amountInUnits,
        paymentId: paymentData.paymentId,
        recipient1: paymentData.recipient1,
        recipient2: paymentData.recipient2,
        recipient3: paymentData.recipient3,
        recipient1Percentage: BigInt(paymentData.recipient1Percentage),
        recipient2Percentage: BigInt(paymentData.recipient2Percentage),
        recipient3Percentage: BigInt(paymentData.recipient3Percentage)
      };

      console.log('🔍 Split payment details:', paymentDetails);

      // Simulate first to check for errors (as in useTransactionHandling)
      console.log('🧪 Simulating split payment transaction...');
      const { request } = await simulateContract(config, {
        address: paymentData.contractAddress,
        abi: abi,
        functionName: 'splitPayment',
        args: [paymentDetails],
        account: address
      });

      console.log('✅ Simulation successful, executing transaction...');

      // Execute the split payment transaction
      const splitHash = await writeContract(config, request);
      setTransactionHash(splitHash);
      console.log('✅ Split payment transaction sent:', splitHash);

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
      console.error('❌ Enhanced payment execution failed:', err);

      let errorMessage = err.message;
      if (err.message?.includes('User rejected') || err.code === 4001) {
        errorMessage = 'Transaction was cancelled by user';
      } else if (err.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds for gas fees';
      } else if (err.message?.includes('simulation failed')) {
        errorMessage = 'Transaction would fail. Please check your balance and try again.';
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
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
  );
};

export default EnhancedMobilePaymentFlow;