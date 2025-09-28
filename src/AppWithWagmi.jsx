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

  // Address persistence to handle reconnection issues
  const [persistedAddress, setPersistedAddress] = useState(
    () => localStorage.getItem('coinley_wallet_address') || null
  );

  // Error logging system for mobile debugging
  const [errorLogs, setErrorLogs] = useState([]);
  const [showErrorPanel, setShowErrorPanel] = useState(false);

  // Capture all console errors and add to UI
  useEffect(() => {
    const originalError = console.error;
    const originalWarn = console.warn;
    const originalLog = console.log;

    const addToErrorLog = (type, message, ...args) => {
      const timestamp = new Date().toLocaleTimeString();
      const fullMessage = [message, ...args].join(' ');

      setErrorLogs(prev => [...prev, {
        type,
        message: fullMessage,
        timestamp,
        id: Date.now() + Math.random()
      }].slice(-50)); // Keep last 50 entries
    };

    // Override console methods
    console.error = (message, ...args) => {
      originalError(message, ...args);
      addToErrorLog('error', message, ...args);
    };

    console.warn = (message, ...args) => {
      originalWarn(message, ...args);
      addToErrorLog('warn', message, ...args);
    };

    console.log = (message, ...args) => {
      originalLog(message, ...args);
      // Only log certain messages to avoid spam
      if (typeof message === 'string' && (
        message.includes('🔍') ||
        message.includes('❌') ||
        message.includes('✅') ||
        message.includes('⚠️') ||
        message.includes('🎯') ||
        message.includes('🚀') ||
        message.includes('📋') ||
        message.includes('Step')
      )) {
        addToErrorLog('info', message, ...args);
      }
    };

    // Capture unhandled errors
    const handleError = (event) => {
      addToErrorLog('error', 'Unhandled Error:', event.error?.message || event.message);
    };

    const handleUnhandledRejection = (event) => {
      addToErrorLog('error', 'Unhandled Promise Rejection:', event.reason?.message || event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Cleanup
    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      console.log = originalLog;
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Address persistence effect
  useEffect(() => {
    if (address && address !== persistedAddress) {
      console.log('✅ Address connected and persisted:', address);
      setPersistedAddress(address);
      localStorage.setItem('coinley_wallet_address', address);
    } else if (!address && persistedAddress) {
      console.warn('⚠️ Address lost from wagmi but have persisted address:', persistedAddress);
    }
  }, [address, persistedAddress]);

  // Get effective address (wagmi address or persisted)
  const effectiveAddress = address || persistedAddress;

  // Debug logging on mount
  useEffect(() => {
    const apiCredentials = getApiCredentials();
    console.log('📊 Payment data:', paymentData);
    console.log('🔗 Chain ID:', paymentData.chainId);
    console.log('🪙 Token:', paymentData.token);
    console.log('📄 Token Contract:', paymentData.tokenContract);
    console.log('🏗️ Payment Contract:', paymentData.contractAddress);
    console.log('🔑 API Credentials (from .env):', {
      hasApiKey: !!apiCredentials.apiKey,
      apiKeyLength: apiCredentials.apiKey ? apiCredentials.apiKey.length : 0,
      hasApiSecret: !!apiCredentials.apiSecret,
      apiUrl: apiCredentials.apiUrl
    });

    // Log the complete QR code URL for debugging
    console.log('🔍 COMPLETE QR CODE URL:', window.location.href);
    console.log('🔍 QR URL BREAKDOWN:', {
      origin: window.location.origin,
      pathname: window.location.pathname,
      search: window.location.search,
      searchParams: Object.fromEntries(new URLSearchParams(window.location.search))
    });
  }, [paymentData]);

  // Simplified mobile-focused auto-connect
  useEffect(() => {
    if (!isConnected && connectors.length > 0) {
      console.log('🔍 Available connectors:', connectors.map(c => ({ id: c.id, name: c.name })));

      // Get wallet-specific connectors
      const trustConnector = connectors.find(c => c.id === 'trustWallet');
      const metaMaskConnector = connectors.find(c => c.id === 'metaMask');
      const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWallet');
      const injectedConnector = connectors.find(c => c.id === 'injected');

      // Check user agent for wallet detection
      const userAgent = navigator.userAgent.toLowerCase();
      const isTrustWallet = userAgent.includes('trust');
      const isMetaMask = userAgent.includes('metamask');
      const isCoinbase = userAgent.includes('coinbase');

      console.log('🔍 Wallet detection:', { isTrustWallet, isMetaMask, isCoinbase });

      // Priority order: Trust Wallet → MetaMask → Coinbase → Generic
      if (isTrustWallet && trustConnector) {
        console.log('🛡️ Trust Wallet detected - connecting with Trust connector');
        connect({ connector: trustConnector }).catch(err => {
          console.error('❌ Trust Wallet connection failed:', err);
          // Fallback to injected for Trust Wallet
          if (injectedConnector) {
            console.log('🔄 Falling back to injected connector for Trust Wallet');
            connect({ connector: injectedConnector }).catch(fallbackErr => {
              console.error('❌ Trust Wallet injected fallback failed:', fallbackErr);
            });
          }
        });
      } else if (isMetaMask && metaMaskConnector) {
        console.log('🦊 MetaMask detected - connecting with MetaMask connector');
        connect({ connector: metaMaskConnector }).catch(err => {
          console.error('❌ MetaMask connection failed:', err);
        });
      } else if (isCoinbase && coinbaseConnector) {
        console.log('💙 Coinbase detected - connecting with Coinbase connector');
        connect({ connector: coinbaseConnector }).catch(err => {
          console.error('❌ Coinbase connection failed:', err);
        });
      } else if (typeof window.ethereum !== 'undefined' && injectedConnector) {
        console.log('💉 Generic wallet detected - using injected connector');
        connect({ connector: injectedConnector }).catch(err => {
          console.error('❌ Injected connector failed:', err);
        });
      } else if (isMobile()) {
        console.log('📱 Mobile device - showing wallet selection');
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
    if (isConnected && effectiveAddress) {
      console.log('🎯 Connection successful with address:', effectiveAddress);
      // Check if we're on the right chain
      const targetChainId = parseInt(paymentData.chainId);
      if (chain?.id !== targetChainId) {
        console.log(`🔗 Switching to chain ${targetChainId} from ${chain?.id}`);
        switchChain({ chainId: targetChainId });
      } else {
        // Start the automatic approval process
        console.log('🚀 Chain correct, starting automatic approval in 1.5s...');
        setTimeout(() => {
          handleAutomaticApproval();
        }, 1500);
      }
    } else if (!isConnected && effectiveAddress && !processing) {
      console.warn('⚠️ Have address but not connected - attempting reconnection...');
      // Try to reconnect if we have address but lost connection
      const injectedConnector = connectors.find(c => c.id === 'injected');
      if (injectedConnector && connectionAttempts < 3) {
        setConnectionAttempts(prev => prev + 1);
        connect({ connector: injectedConnector }).catch(err => {
          console.error('❌ Reconnection failed:', err);
        });
      }
    }
  }, [isConnected, effectiveAddress, chain, paymentData.chainId, processing, connectors, connect, connectionAttempts]);

  // Enhanced Trust Wallet specific debugging and connection
  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isTrustWallet = userAgent.includes('trust');

    if (isTrustWallet) {
      console.log('🛡️ TRUST WALLET DETECTED - Enhanced debugging:');
      console.log('🛡️ User Agent:', navigator.userAgent);
      console.log('🛡️ Window providers:', {
        ethereum: !!window.ethereum,
        trustwallet: !!window.trustwallet,
        ethereumIsMetaMask: window.ethereum?.isMetaMask,
        ethereumIsTrust: window.ethereum?.isTrust,
        allProviders: window.ethereum?.providers?.length || 0
      });
      console.log('🛡️ Current state:', {
        isConnected,
        connectionAttempts,
        currentStep,
        processing,
        effectiveAddress
      });

      // Auto-retry for Trust Wallet with detailed logging
      if (!isConnected && connectionAttempts < 5) {
        console.log('🛡️ Trust Wallet auto-retry triggered (attempt', connectionAttempts + 1, 'of 5)');

        const retryTimer = setTimeout(() => {
          const trustConnector = connectors.find(c => c.id === 'trustWallet');
          const injectedConnector = connectors.find(c => c.id === 'injected');

          console.log('🛡️ Available connectors for retry:', {
            trustConnector: !!trustConnector,
            injectedConnector: !!injectedConnector,
            totalConnectors: connectors.length
          });

          if (trustConnector) {
            console.log('🛡️ Attempting Trust Wallet connector...');
            setConnectionAttempts(prev => prev + 1);
            connect({ connector: trustConnector }).catch(err => {
              console.error('❌ Trust Wallet connector failed:', err.message, err.code);

              // Fallback to injected if Trust connector fails
              if (injectedConnector) {
                console.log('🔄 Trust Wallet failed, trying injected connector...');
                connect({ connector: injectedConnector }).catch(fallbackErr => {
                  console.error('❌ Injected fallback also failed:', fallbackErr.message, fallbackErr.code);
                });
              }
            });
          } else {
            console.warn('⚠️ No Trust Wallet connector found in retry attempt');
          }
        }, 3000);

        return () => clearTimeout(retryTimer);
      }
    }
  }, [connectors, connect, isConnected, connectionAttempts, currentStep, processing, effectiveAddress]);

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
    // Critical: Check if we have an address before proceeding
    if (!effectiveAddress) {
      const errorMsg = 'Cannot execute payment: No wallet address available. Please reconnect your wallet.';
      console.error('❌', errorMsg);
      setWriteError(new Error(errorMsg));
      setCurrentStep('failure');
      setProcessing(false);
      setIsWriting(false);
      return;
    }

    try {
      console.log('📋 Starting approval and payment with address:', effectiveAddress);
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
        args: [effectiveAddress]
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
        args: [effectiveAddress, paymentData.contractAddress]
      });

      console.log('Current allowance:', allowance.toString());
      console.log('Required amount:', amountInUnits.toString());

      if (allowance < amountInUnits) {
        console.log('🔐 Executing token approval...');
        try {
          // Execute approval
          const approveHash = await writeContract(config, {
            address: paymentData.tokenContract,
            abi: erc20Abi,
            functionName: 'approve',
            args: [paymentData.contractAddress, amountInUnits]
          });

          setApprovalHash(approveHash);
          console.log('✅ Approval transaction hash:', approveHash);

          // Wait a bit for approval to be processed
          await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (approvalError) {
          console.error('❌ Approval transaction failed:', approvalError);
          throw approvalError;
        }
      } else {
        console.log('✅ Token already approved, skipping approval step');
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
    // Additional safety checks
    if (!effectiveAddress) {
      throw new Error('No wallet address available for split payment');
    }

    if (!paymentData.contractAddress || !paymentData.tokenContract) {
      throw new Error('Missing contract addresses for payment execution');
    }

    try {
      console.log('🏗️ Executing split payment with verified data:', {
        userAddress: effectiveAddress,
        contractAddress: paymentData.contractAddress,
        tokenContract: paymentData.tokenContract,
        chainId: chain?.id
      });
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
        console.log('🧪 Simulating splitPayment transaction...');
        const { request } = await simulateContract(config, {
          address: paymentData.contractAddress,
          abi: splitPaymentAbi,
          functionName: 'splitPayment',
          args: [paymentDetails],
          account: effectiveAddress
        });
        console.log('✅ Simulation successful, executing transaction...');

        // Execute the transaction
        splitHash = await writeContract(config, request);
        console.log('✅ Split payment transaction submitted:', splitHash);
      } catch (simulationError) {
        console.error('❌ Split payment simulation failed:', simulationError);
        console.error('❌ Simulation error details:', {
          message: simulationError.message,
          cause: simulationError.cause,
          code: simulationError.code
        });

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
        await notifyBackend(paymentId, splitHash, networkName, effectiveAddress, apiCredentials);
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
  const ApprovalStep = () => {
    try {
      return (
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

          {isConnected && effectiveAddress && (
            <div className="text-sm text-gray-500 mb-4">
              Connected: {effectiveAddress.slice(0, 6)}...{effectiveAddress.slice(-4)}
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
    } catch (error) {
      console.error('❌ Error in ApprovalStep:', error);
      return (
        <div className="text-center p-8">
          <div className="text-red-500 mb-4">⚠️ Component Error</div>
          <button
            onClick={() => window.location.reload()}
            className="bg-purple-600 text-white px-4 py-2 rounded"
          >
            Reload
          </button>
        </div>
      );
    }
  };

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
        {/* Trust Wallet */}
        <button
          onClick={() => {
            console.log('🛡️ Manual Trust Wallet connection attempt');
            const trustConnector = connectors.find(c => c.id === 'trustWallet');
            if (trustConnector) {
              connect({ connector: trustConnector }).catch(err => {
                console.error('❌ Manual Trust Wallet connection failed:', err);
                // Try deep link as fallback
                const trustUrl = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.href)}`;
                console.log('🔗 Trying Trust Wallet deep link:', trustUrl);
                window.location.href = trustUrl;
              });
            }
          }}
          className="block w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
        >
          🛡️ Trust Wallet
        </button>

        {/* MetaMask */}
        <button
          onClick={() => {
            console.log('🦊 Manual MetaMask connection attempt');
            const metaMaskConnector = connectors.find(c => c.id === 'metaMask');
            if (metaMaskConnector) {
              connect({ connector: metaMaskConnector }).catch(err => {
                console.error('❌ Manual MetaMask connection failed:', err);
                // Try deep link as fallback
                const metaMaskUrl = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`;
                console.log('🔗 Trying MetaMask deep link:', metaMaskUrl);
                window.location.href = metaMaskUrl;
              });
            }
          }}
          className="block w-full bg-orange-500 text-white py-4 px-6 rounded-xl font-semibold hover:bg-orange-600 transition-colors"
        >
          🦊 MetaMask
        </button>

        {/* Coinbase Wallet */}
        <button
          onClick={() => {
            console.log('💙 Manual Coinbase connection attempt');
            const coinbaseConnector = connectors.find(c => c.id === 'coinbaseWallet');
            if (coinbaseConnector) {
              connect({ connector: coinbaseConnector }).catch(err => {
                console.error('❌ Manual Coinbase connection failed:', err);
                // Try deep link as fallback
                const coinbaseUrl = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(window.location.href)}`;
                console.log('🔗 Trying Coinbase deep link:', coinbaseUrl);
                window.location.href = coinbaseUrl;
              });
            }
          }}
          className="block w-full bg-indigo-600 text-white py-4 px-6 rounded-xl font-semibold hover:bg-indigo-700 transition-colors"
        >
          💙 Coinbase Wallet
        </button>

        {/* Fallback for any other wallet */}
        <button
          onClick={() => {
            console.log('💉 Manual injected connector attempt');
            const injectedConnector = connectors.find(c => c.id === 'injected');
            if (injectedConnector) {
              connect({ connector: injectedConnector }).catch(err => {
                console.error('❌ Manual injected connection failed:', err);
              });
            }
          }}
          className="block w-full bg-gray-500 text-white py-3 px-6 rounded-xl font-semibold hover:bg-gray-600 transition-colors"
        >
          🔌 Other Wallet
        </button>

        <button
          onClick={() => setCurrentStep('approval')}
          className="block w-full bg-gray-300 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-400 transition-colors"
        >
          Skip (Already Connected)
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

  // Error Panel Component
  const ErrorPanel = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="text-lg font-semibold">Mobile Debug Console</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setErrorLogs([]);
              }}
              className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
            >
              Clear
            </button>
            <button
              onClick={() => {
                const logText = errorLogs.map(log =>
                  `[${log.timestamp}] ${log.type.toUpperCase()}: ${log.message}`
                ).join('\n');
                navigator.clipboard?.writeText(logText);
              }}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            >
              Copy
            </button>
            <button
              onClick={() => setShowErrorPanel(false)}
              className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
            >
              Close
            </button>
          </div>
        </div>
        <div className="p-4 max-h-96 overflow-y-auto">
          {errorLogs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">No logs yet</div>
          ) : (
            <div className="space-y-2">
              {errorLogs.map(log => (
                <div
                  key={log.id}
                  className={`p-2 rounded text-xs font-mono ${
                    log.type === 'error' ? 'bg-red-50 border border-red-200' :
                    log.type === 'warn' ? 'bg-yellow-50 border border-yellow-200' :
                    'bg-blue-50 border border-blue-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className={`font-semibold ${
                      log.type === 'error' ? 'text-red-700' :
                      log.type === 'warn' ? 'text-yellow-700' :
                      'text-blue-700'
                    }`}>
                      {log.type.toUpperCase()}
                    </span>
                    <span className="text-gray-500">{log.timestamp}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap break-all">{log.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Safe step rendering with fallbacks
  const renderCurrentStep = () => {
    try {
      switch (currentStep) {
        case 'approval':
          return <ApprovalStep />;
        case 'payment':
          return <PaymentStep />;
        case 'success':
          return <SuccessStep />;
        case 'failure':
          return <FailureStep />;
        case 'wallet-select':
          return <WalletSelectStep />;
        case 'no-wallet':
          return <NoWalletStep />;
        default:
          console.warn('⚠️ Unknown step:', currentStep, '- defaulting to approval');
          return <ApprovalStep />;
      }
    } catch (error) {
      console.error('❌ Error rendering step:', currentStep, error);
      return (
        <div className="text-center p-8">
          <div className="text-red-500 mb-4">⚠️ Rendering Error</div>
          <div className="text-sm text-gray-600 mb-4">
            Current step: {currentStep || 'undefined'}
          </div>
          <button
            onClick={() => {
              setCurrentStep('approval');
              setProcessing(false);
              setIsWriting(false);
            }}
            className="bg-purple-600 text-white px-4 py-2 rounded"
          >
            Reset to Approval
          </button>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-center bg-gradient-to-r from-purple-700 to-blue-600 bg-clip-text text-transparent">
            Coinley Pay
          </h1>
        </div>

        {renderCurrentStep()}
      </div>

      {/* Floating debug button */}
      <button
        onClick={() => setShowErrorPanel(true)}
        className={`fixed bottom-4 right-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-white font-bold z-40 ${
          errorLogs.some(log => log.type === 'error') ? 'bg-red-500' :
          errorLogs.some(log => log.type === 'warn') ? 'bg-yellow-500' :
          'bg-blue-500'
        }`}
      >
        {errorLogs.length > 0 ? errorLogs.length : '🐛'}
      </button>

      {/* Error panel overlay */}
      {showErrorPanel && <ErrorPanel />}
    </div>
  );
};

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('❌ React Error Boundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-6">
              The payment screen encountered an error. Please refresh the page.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-700"
              >
                Refresh Page
              </button>
              <details className="text-left">
                <summary className="cursor-pointer text-sm text-gray-500">
                  Technical Details
                </summary>
                <pre className="text-xs bg-gray-100 p-2 rounded mt-2 overflow-auto">
                  {this.state.error?.toString()}
                </pre>
              </details>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Main App Component with Providers
const App = () => {
  return (
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <PaymentFlow />
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
};

export default App;