import React, { useState, useEffect } from 'react';
import { WagmiProvider, useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { readContract, writeContract, simulateContract } from '@wagmi/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config, getChainByNetwork, networkToChainId } from './wagmiConfig';
import { parseUnits, erc20Abi } from 'viem';

// Create a QueryClient instance
const queryClient = new QueryClient();

// Helper function to detect mobile device
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// Debug mode - only show in development or when explicitly enabled
const isDebugMode = () => {
  return process.env.NODE_ENV === 'development' ||
         process.env.REACT_APP_DEBUG_MODE === 'true' ||
         new URLSearchParams(window.location.search).get('debug') === 'true';
};

// Simple API client for backend communication
const notifyBackend = async (paymentId, transactionHash, networkName, senderAddress, apiCredentials) => {
  if (!paymentId) {
    console.warn('⚠️ No payment ID provided for backend notification');
    return;
  }

  const { apiKey, apiSecret, apiUrl } = apiCredentials;

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Add API keys if available
    if (apiKey && apiSecret) {
      headers['X-API-Key'] = apiKey;
      headers['X-API-Secret'] = apiSecret;
      console.log('🔑 Using API credentials from URL parameters');
    } else {
      console.warn('⚠️ No API credentials found in URL parameters');
    }

    const response = await fetch(`${apiUrl}/api/payments/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        paymentId: paymentId,
        transactionHash: transactionHash,
        network: networkName,
        senderAddress: senderAddress,
        source: 'payment_screen' // Identify this as coming from payment screen
      })
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Backend notified successfully:', result);
      return result;
    } else if (response.status === 401 || response.status === 403) {
      console.error('❌ Backend authentication failed');
      console.error('❌ Check if API keys are correctly passed in QR code URL');
      throw new Error('Backend authentication failed');
    } else {
      console.error('❌ Backend notification failed:', response.status);
      const errorText = await response.text();
      console.error('❌ Error details:', errorText);
      throw new Error(`Backend error: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Failed to notify backend:', error);
    throw error;
  }
};

// Helper function to get network short name from chainId
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

// Helper function to get API credentials from environment variables
const getApiCredentials = () => {
  return {
    apiKey: process.env.REACT_APP_COINLEY_API_KEY || '',
    apiSecret: process.env.REACT_APP_COINLEY_API_SECRET || '',
    apiUrl: process.env.REACT_APP_COINLEY_API_URL || 'https://coinley-backend-production.up.railway.app'
  };
};

// Helper function to extract URL parameters
const getUrlParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    amount: params.get('amount') || '99.99',
    token: params.get('token') || 'USDC',
    merchant: params.get('merchant') || 'Demo Merchant',
    productAmount: params.get('productAmount') || '95.00',
    platformFee: params.get('platformFee') || '2.99',
    networkFee: params.get('networkFee') || '2.00',
    merchantAddress: params.get('merchantAddress') || '',
    network: params.get('network') || 'Ethereum Mainnet',
    contractAddress: params.get('contractAddress') || '',
    tokenContract: params.get('tokenContract') || '',
    chainId: params.get('chainId') || '1',
    // Additional recipient addresses
    platformWallet: params.get('platformWallet') || '',
    networkWallet: params.get('networkWallet') || '',
    recipient1: params.get('recipient1') || params.get('merchantAddress') || '',
    recipient2: params.get('recipient2') || params.get('platformWallet') || '',
    recipient3: params.get('recipient3') || params.get('networkWallet') || '',
    paymentId: params.get('paymentId') || '',
    // Backend-calculated percentages (in basis points: 10000 = 100%)
    recipient1Percentage: params.get('recipient1Percentage') || '',
    recipient2Percentage: params.get('recipient2Percentage') || '',
    recipient3Percentage: params.get('recipient3Percentage') || '0',
    // Additional backend data
    splitterPaymentId: params.get('splitterPaymentId') || '',
    tokenDecimals: params.get('tokenDecimals') || '6',
    amountInWei: params.get('amountInWei') || '' // Exact amount from backend
  };
};

// Main Payment Component
const PaymentFlow = () => {
  const [currentStep, setCurrentStep] = useState('approval');
  const [paymentData, setPaymentData] = useState(getUrlParams());
  const [processing, setProcessing] = useState(false);

  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [isWriting, setIsWriting] = useState(false);
  const [writeSuccess, setWriteSuccess] = useState(false);
  const [writeError, setWriteError] = useState(null);
  const [approvalHash, setApprovalHash] = useState(null);
  const [paymentHash, setPaymentHash] = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  // Debug logging on mount
  useEffect(() => {
    const apiCredentials = getApiCredentials();
    console.log('Payment data:', paymentData);
    console.log('Chain ID:', paymentData.chainId);
    console.log('Token:', paymentData.token);
    console.log('Token Contract:', paymentData.tokenContract);
    console.log('Payment Contract:', paymentData.contractAddress);
    console.log('API Credentials (from .env):', {
      hasApiKey: !!apiCredentials.apiKey,
      apiKeyLength: apiCredentials.apiKey ? apiCredentials.apiKey.length : 0,
      hasApiSecret: !!apiCredentials.apiSecret,
      apiUrl: apiCredentials.apiUrl
    });
  }, [paymentData]);

  // Smart auto-connect using wagmi connectors
  useEffect(() => {
    if (!isConnected && connectors.length > 0) {
      // Try multiple connectors in order of preference
      const injectedConnector = connectors.find(c => c.id === 'injected');
      const trustConnector = connectors.find(c => c.id === 'trustWallet');
      const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWallet');

      // Check what's available in the browser
      const hasEthereum = typeof window.ethereum !== 'undefined';
      const hasTrustWallet = typeof window.trustwallet !== 'undefined';
      const isTrustWalletUA = navigator.userAgent.toLowerCase().includes('trust');
      const isMetaMaskUA = navigator.userAgent.toLowerCase().includes('metamask');
      const isCoinbaseUA = navigator.userAgent.toLowerCase().includes('coinbase');

      // Try wallet-specific connectors first based on detection
      if (isTrustWalletUA && trustConnector) {
        connect({ connector: trustConnector });
      } else if (isCoinbaseUA && coinbaseConnector) {
        connect({ connector: coinbaseConnector });
      } else if (isMetaMaskUA && injectedConnector) {
        connect({ connector: injectedConnector });
      } else if (hasEthereum && injectedConnector) {
        // Fallback to injected if we have any ethereum provider
        connect({ connector: injectedConnector });
      } else if (hasTrustWallet && trustConnector) {
        // Try Trust Wallet connector if Trust is available
        connect({ connector: trustConnector });
      } else if (isMobile()) {
        // On mobile without any provider, show wallet selection
        setCurrentStep('wallet-select');
      }
    }
  }, [connectors, connect, isConnected]);

  // Handle window focus to retry connection after returning from wallet app
  useEffect(() => {
    const handleFocus = () => {
      if (!isConnected && connectionAttempts < 3 && currentStep === 'approval') {
        setConnectionAttempts(prev => prev + 1);

        // Try multiple connectors on retry
        const injectedConnector = connectors.find(c => c.id === 'injected');
        const trustConnector = connectors.find(c => c.id === 'trustWallet');
        const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWallet');

        // Same logic as initial connection
        const isTrustWalletUA = navigator.userAgent.toLowerCase().includes('trust');
        const isCoinbaseUA = navigator.userAgent.toLowerCase().includes('coinbase');

        if (isTrustWalletUA && trustConnector) {
          connect({ connector: trustConnector });
        } else if (isCoinbaseUA && coinbaseConnector) {
          connect({ connector: coinbaseConnector });
        } else if (injectedConnector && typeof window.ethereum !== 'undefined') {
          connect({ connector: injectedConnector });
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [isConnected, connectors, connect, connectionAttempts, currentStep]);

  // Handle successful connection
  useEffect(() => {
    if (isConnected && address) {
      // Check if we're on the right chain
      const targetChainId = parseInt(paymentData.chainId);
      if (chain?.id !== targetChainId) {
        switchChain({ chainId: targetChainId });
      } else {
        // Start the automatic approval process
        setTimeout(() => {
          handleAutomaticApproval();
        }, 1500);
      }
    }
  }, [isConnected, address, chain, paymentData.chainId]);

  // Get token decimals based on token symbol
  const getTokenDecimals = (tokenSymbol) => {
    const decimalsMap = {
      'USDT': 6,
      'USDC': 6,
      'DAI': 18,
      'BUSD': 18
    };
    return decimalsMap[tokenSymbol] || 6;
  };

  const handleAutomaticApproval = async () => {
    setProcessing(true);
    setCurrentStep('payment');

    // Add longer delay for mobile wallets to ensure proper initialization
    const delay = isMobile() ? 2000 : 1000;

    setTimeout(() => {
      executeApprovalAndPayment();
    }, delay);
  };

  // Execute approval and payment in sequence
  const executeApprovalAndPayment = async () => {
    try {
      setIsWriting(true);
      setWriteError(null);

      // Step 0: Check user's token balance first
      const decimals = getTokenDecimals(paymentData.token);
      const amountInUnits = parseUnits(paymentData.amount, decimals);

      console.log('Step 0: Checking token balance...');
      const balance = await readContract(config, {
        address: paymentData.tokenContract,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address]
      });

      console.log('User balance:', balance.toString());
      console.log('Required amount:', amountInUnits.toString());

      if (balance < amountInUnits) {
        throw new Error(`Insufficient ${paymentData.token} balance. You have ${(Number(balance) / 10**decimals).toFixed(decimals)} ${paymentData.token}, but need ${paymentData.amount} ${paymentData.token}`);
      }

      // Step 1: Approve the PaymentSplitter contract to spend tokens
      console.log('Step 1: Approving token spending...');

      // Check if we need approval
      const allowance = await readContract(config, {
        address: paymentData.tokenContract,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, paymentData.contractAddress]
      });

      console.log('Current allowance:', allowance.toString());
      console.log('Required amount:', amountInUnits.toString());

      if (allowance < amountInUnits) {
        // Execute approval
        const approveHash = await writeContract(config, {
          address: paymentData.tokenContract,
          abi: erc20Abi,
          functionName: 'approve',
          args: [paymentData.contractAddress, amountInUnits]
        });

        setApprovalHash(approveHash);
        console.log('Approval transaction hash:', approveHash);

        // Wait a bit for approval to be processed
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      // Step 2: Execute splitPayment
      console.log('Step 2: Executing payment split...');
      await executeSplitPayment();

    } catch (error) {
      console.error('Transaction failed:', error);

      // Parse and improve error messages
      let userFriendlyError = error;
      if (error.message) {
        if (error.message.includes('transfer amount exceeds balance')) {
          userFriendlyError = new Error(`Insufficient ${paymentData.token} balance. Please add more ${paymentData.token} to your wallet and try again.`);
        } else if (error.message.includes('User rejected')) {
          userFriendlyError = new Error('Transaction was cancelled by user.');
        } else if (error.message.includes('insufficient funds')) {
          userFriendlyError = new Error('Insufficient funds for gas fees. Please add more native tokens (ETH, MATIC, etc.) to your wallet.');
        } else if (error.message.includes('network')) {
          userFriendlyError = new Error('Network error. Please check your connection and try again.');
        }
      }

      setWriteError(userFriendlyError);
      setCurrentStep('failure');
      setProcessing(false);
      setIsWriting(false);
    }
  };

  // Execute the splitPayment function
  const executeSplitPayment = async () => {
    try {
      // PaymentSplitter ABI for splitPayment function with tuple parameter
      const splitPaymentAbi = [
        {
          name: 'splitPayment',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            {
              name: 'details',
              type: 'tuple',
              components: [
                { name: 'token', type: 'address' },
                { name: 'amount', type: 'uint256' },
                { name: 'paymentId', type: 'string' },
                { name: 'recipient1', type: 'address' },
                { name: 'recipient2', type: 'address' },
                { name: 'recipient3', type: 'address' },
                { name: 'recipient1Percentage', type: 'uint256' },
                { name: 'recipient2Percentage', type: 'uint256' },
                { name: 'recipient3Percentage', type: 'uint256' }
              ]
            }
          ],
          outputs: []
        }
      ];

      // Use exact amount and decimals from backend if available
      const decimals = parseInt(paymentData.tokenDecimals) || getTokenDecimals(paymentData.token);
      const amountInUnits = paymentData.amountInWei && paymentData.amountInWei !== ''
        ? BigInt(paymentData.amountInWei)
        : parseUnits(paymentData.amount, decimals);

      // ALWAYS use backend-provided percentages - NO FALLBACK CALCULATIONS
      const productPercentage = parseInt(paymentData.recipient1Percentage) || 10000;
      const platformPercentage = parseInt(paymentData.recipient2Percentage) || 0;
      const networkPercentage = parseInt(paymentData.recipient3Percentage) || 0;

      console.log('🎯 Using EXACT backend data:', {
        paymentId: paymentData.paymentId,
        amountInWei: amountInUnits.toString(),
        decimals: decimals,
        recipient1: paymentData.recipient1,
        recipient2: paymentData.recipient2,
        recipient3: paymentData.recipient3,
        recipient1Percentage: productPercentage,
        recipient2Percentage: platformPercentage,
        recipient3Percentage: networkPercentage,
        totalPercentage: productPercentage + platformPercentage + networkPercentage
      });

      // Validate that we have all required backend data
      if (!paymentData.recipient1 || !paymentData.recipient1Percentage) {
        throw new Error('Missing backend payment data. QR code may be outdated.');
      }

      // Use exact payment ID from backend - NO FALLBACK
      const paymentId = paymentData.paymentId && paymentData.paymentId.trim() !== ''
        ? paymentData.paymentId
        : (() => { throw new Error('Payment ID missing from backend data'); })();

      console.log('🔍 Using EXACT payment ID from backend:', paymentId);
      console.log('🔍 Splitter Payment ID:', paymentData.splitterPaymentId);

      // Use EXACT recipient addresses from backend - NO FALLBACKS
      const recipient1 = paymentData.recipient1;
      const recipient2 = paymentData.recipient2;
      const recipient3 = paymentData.recipient3;

      console.log('🏗️ Contract call details:', {
        contractAddress: paymentData.contractAddress,
        tokenContract: paymentData.tokenContract,
        paymentId: paymentId,
        recipient1: recipient1,
        recipient2: recipient2,
        recipient3: recipient3,
        percentages: `${productPercentage}|${platformPercentage}|${networkPercentage}`
      });

      // Create the tuple parameter
      const paymentDetails = {
        token: paymentData.tokenContract,
        amount: amountInUnits,
        paymentId: paymentId,
        recipient1: recipient1,
        recipient2: recipient2,
        recipient3: recipient3,
        recipient1Percentage: BigInt(productPercentage),
        recipient2Percentage: BigInt(platformPercentage),
        recipient3Percentage: BigInt(networkPercentage)
      };

      console.log('Payment details:', paymentDetails);

      // Simulate first to check for errors
      let splitHash;
      try {
        const { request } = await simulateContract(config, {
          address: paymentData.contractAddress,
          abi: splitPaymentAbi,
          functionName: 'splitPayment',
          args: [paymentDetails],
          account: address
        });

        // Execute the transaction
        splitHash = await writeContract(config, request);
      } catch (simulationError) {
        console.error('Simulation failed:', simulationError);
        if (simulationError.message.includes('transfer amount exceeds balance')) {
          throw new Error(`Insufficient ${paymentData.token} balance. You need ${paymentData.amount} ${paymentData.token} but may not have enough in your wallet.`);
        }
        throw simulationError;
      }

      setPaymentHash(splitHash);
      console.log('Split payment transaction hash:', splitHash);

      // Notify backend that payment is completed (matching SDK processPayment parameters)
      try {
        console.log('📤 Notifying backend of successful payment...');
        console.log('📤 Using payment ID for backend:', paymentId);
        console.log('📤 Transaction hash:', splitHash);
        const networkName = getNetworkShortName(paymentData.chainId);
        const apiCredentials = getApiCredentials();
        await notifyBackend(paymentId, splitHash, networkName, address, apiCredentials);
      } catch (backendError) {
        console.error('⚠️ Backend notification failed, but payment was successful:', backendError);
        // Don't fail the transaction just because backend notification failed
      }

      setWriteSuccess(true);
      setCurrentStep('success');
      setProcessing(false);
      setIsWriting(false);

    } catch (error) {
      throw error;
    }
  };

  const retryPayment = () => {
    setCurrentStep('payment');
    setWriteError(null);
    setWriteSuccess(false);
    executeApprovalAndPayment();
  };

  const resetFlow = () => {
    setCurrentStep('approval');
    setProcessing(false);
    disconnect();
    setPaymentData(getUrlParams());

    // Reconnect after a short delay
    setTimeout(() => {
      const injectedConnector = connectors.find(c => c.id === 'injected');
      if (injectedConnector) {
        connect({ connector: injectedConnector });
      }
    }, 500);
  };

  // UI Components
  const ApprovalStep = () => (
    <div className="text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 mx-auto bg-purple-700 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <div className="absolute inset-0 w-20 h-20 mx-auto bg-purple-700 rounded-full animate-ping opacity-75"></div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">
        {isConnected ? 'Preparing Transaction...' : 'Connecting Wallet...'}
      </h2>
      <p className="text-gray-600 mb-6">
        {isConnected ? 'Please approve the transaction in your wallet' : 'Connecting to your wallet automatically'}
      </p>

      {isConnected && address && (
        <div className="text-sm text-gray-500 mb-4">
          Connected: {address.slice(0, 6)}...{address.slice(-4)}
        </div>
      )}

      {/* Debug info for mobile - only in development */}
      {isDebugMode() && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-xs">
          <div className="text-blue-800 font-semibold mb-2">Debug Info:</div>
          <div className="text-left space-y-1 text-blue-700">
            <div>Connected: {isConnected ? '✅' : '❌'}</div>
            <div>Chain: {chain?.id || 'none'} (target: {paymentData.chainId})</div>
            <div>Ethereum: {typeof window.ethereum !== 'undefined' ? '✅' : '❌'}</div>
            <div>TrustWallet: {typeof window.trustwallet !== 'undefined' ? '✅' : '❌'}</div>
            <div>MetaMask: {window.ethereum?.isMetaMask ? '✅' : '❌'}</div>
            <div>Mobile: {isMobile() ? '✅' : '❌'}</div>
            <div>Connectors: {connectors.map(c => c.id).join(', ')}</div>
            <div>Current Step: {currentStep}</div>
            <div>Processing: {processing ? '✅' : '❌'}</div>
            <div>UserAgent: {navigator.userAgent.includes('Trust') ? 'Trust' : navigator.userAgent.includes('MetaMask') ? 'MetaMask' : navigator.userAgent.includes('Coinbase') ? 'Coinbase' : 'Other'}</div>
            {connectError && <div className="text-red-600">Error: {connectError.message}</div>}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Network:</span>
          <span className="text-sm font-semibold text-gray-800">{paymentData.network}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Token:</span>
          <span className="text-sm font-semibold text-gray-800">{paymentData.token}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Merchant:</span>
          <span className="text-sm font-semibold text-gray-800">{paymentData.merchant}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Amount:</span>
          <span className="text-sm font-semibold text-purple-700">${paymentData.amount}</span>
        </div>
      </div>

      {connectError && (
        <div className="text-red-500 text-sm mb-4">
          Error: {connectError.message}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Transaction will be processed automatically once connected
      </p>
    </div>
  );

  const PaymentStep = () => (
    <div className="text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 mx-auto bg-blue-600 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <div className="absolute inset-0 w-20 h-20 mx-auto bg-blue-600 rounded-full animate-ping opacity-75"></div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">Processing Payment</h2>
      <p className="text-gray-600 mb-6">
        {isWriting ? 'Confirm the transaction in your wallet' : 'Sending transaction to the blockchain...'}
      </p>

      {/* Debug info for payment step - only in development */}
      {isDebugMode() && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-xs">
          <div className="text-yellow-800 font-semibold mb-2">Payment Debug:</div>
          <div className="text-left space-y-1 text-yellow-700">
            <div>Writing: {isWriting ? '✅' : '❌'}</div>
            <div>Processing: {processing ? '✅' : '❌'}</div>
            <div>Approval Hash: {approvalHash ? approvalHash.slice(0, 10) + '...' : 'none'}</div>
            <div>Payment Hash: {paymentHash ? paymentHash.slice(0, 10) + '...' : 'none'}</div>
            {writeError && <div className="text-red-600">Error: {writeError.message?.slice(0, 100)}</div>}
          </div>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-6 mb-6">
        <div className="flex justify-between items-center mb-3">
          <span className="text-gray-600">Product Amount:</span>
          <span className="font-semibold text-gray-800">${paymentData.productAmount}</span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-gray-600">Platform Fee:</span>
          <span className="font-semibold text-gray-800">${paymentData.platformFee}</span>
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-gray-600">Network Fee:</span>
          <span className="font-semibold text-gray-800">${paymentData.networkFee}</span>
        </div>
        <div className="border-t pt-3 mt-3">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-600">Total:</span>
            <span className="text-lg font-bold text-purple-700">${paymentData.amount} {paymentData.token}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>Waiting for blockchain confirmation...</span>
      </div>
    </div>
  );

  const SuccessStep = () => (
    <div className="text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 mx-auto bg-green-500 rounded-full flex items-center justify-center animate-bounce-once">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <div className="absolute inset-0 w-20 h-20 mx-auto bg-green-500 rounded-full animate-ping-once opacity-75"></div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment Successful!</h2>
      <p className="text-gray-600 mb-6">Your transaction has been confirmed on the blockchain</p>

      <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-center mb-2">
          <svg className="w-5 h-5 text-green-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
          </svg>
          <span className="text-green-800 font-semibold">Transaction Confirmed</span>
        </div>
        <p className="text-sm text-green-700">
          ${paymentData.amount} {paymentData.token} has been sent to {paymentData.merchant}
        </p>
      </div>

      <button
        onClick={() => window.close()}
        className="w-full bg-purple-700 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-800 transition-colors"
      >
        Close Window
      </button>
    </div>
  );

  const FailureStep = () => (
    <div className="text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 mx-auto bg-red-500 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment Failed</h2>
      <p className="text-gray-600 mb-6">The transaction could not be completed</p>

      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-red-700">
          {writeError?.message || 'Transaction was cancelled or failed'}
        </p>
      </div>

      <div className="space-y-3">
        <button
          onClick={retryPayment}
          className="w-full bg-purple-700 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-800 transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={resetFlow}
          className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
        >
          Start Over
        </button>
      </div>
    </div>
  );

  const WalletSelectStep = () => (
    <div className="text-center animate-fade-in">
      <div className="mb-6">
        <div className="w-20 h-20 mx-auto bg-blue-500 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"></path>
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">Choose Your Wallet</h2>
      <p className="text-gray-600 mb-6">Select how you want to connect and pay</p>

      <div className="space-y-4">
        {/* Dynamic connector buttons */}
        {connectors.map((connector) => {
          const getConnectorInfo = (id) => {
            switch(id) {
              case 'injected':
                return { name: 'Browser Wallet', color: 'bg-purple-600', action: () => connect({ connector }) };
              case 'trustWallet':
                return { name: 'Trust Wallet', color: 'bg-blue-600', action: () => {
                  const trustUrl = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.href)}`;
                  window.location.href = trustUrl;
                  setTimeout(() => connect({ connector }), 3000);
                }};
              case 'coinbaseWallet':
                return { name: 'Coinbase Wallet', color: 'bg-indigo-600', action: () => {
                  const coinbaseUrl = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(window.location.href)}`;
                  window.location.href = coinbaseUrl;
                  setTimeout(() => connect({ connector }), 3000);
                }};
              case 'walletConnect':
                return { name: 'WalletConnect', color: 'bg-blue-500', action: () => connect({ connector }) };
              default:
                return { name: connector.name, color: 'bg-gray-600', action: () => connect({ connector }) };
            }
          };

          const info = getConnectorInfo(connector.id);
          return (
            <button
              key={connector.id}
              onClick={info.action}
              className={`block w-full ${info.color} text-white py-4 px-6 rounded-xl font-semibold hover:opacity-90 transition-colors`}
            >
              {info.name}
            </button>
          );
        })}

        {/* MetaMask deep link for cases where injected doesn't work */}
        <button
          onClick={() => {
            const urls = [
              `metamask://dapp/${window.location.host}${window.location.pathname}${window.location.search}`,
              `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`,
            ];
            window.location.href = urls[0];
            setTimeout(() => {
              if (!document.hidden) {
                window.location.href = urls[1];
              }
            }, 2500);
          }}
          className="block w-full bg-orange-500 text-white py-3 px-6 rounded-xl font-semibold hover:bg-orange-600 transition-colors"
        >
          Open in MetaMask (Deep Link)
        </button>

        <button
          onClick={() => setCurrentStep('approval')}
          className="block w-full bg-gray-300 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-400 transition-colors"
        >
          I have a wallet connected
        </button>
      </div>

      <div className="mt-6 text-xs text-gray-500">
        <p>Don't have a wallet?</p>
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-600 underline"
        >
          Install MetaMask
        </a>
      </div>
    </div>
  );

  const NoWalletStep = () => (
    <div className="text-center animate-fade-in">
      <div className="mb-6">
        <div className="w-20 h-20 mx-auto bg-yellow-500 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">Wallet Not Detected</h2>
      <p className="text-gray-600 mb-6">Please install a Web3 wallet to continue</p>

      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6">
        <p className="text-sm text-yellow-800">
          Install MetaMask, Trust Wallet, or another Web3 wallet extension to complete this payment
        </p>
      </div>

      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block w-full bg-purple-700 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-800 transition-colors"
      >
        Install MetaMask
      </a>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-transparent">
            Coinley Pay
          </h1>
        </div>

        {currentStep === 'approval' && <ApprovalStep />}
        {currentStep === 'payment' && <PaymentStep />}
        {currentStep === 'success' && <SuccessStep />}
        {currentStep === 'failure' && <FailureStep />}
        {currentStep === 'wallet-select' && <WalletSelectStep />}
        {currentStep === 'no-wallet' && <NoWalletStep />}
      </div>
    </div>
  );
};

// Main App Component with Providers
const App = () => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <PaymentFlow />
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;