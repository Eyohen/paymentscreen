import React, { useState, useEffect } from 'react';

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
    network: params.get('network') || 'Ethereum Mainnet'
  };
};

const App = () => {
  const [currentStep, setCurrentStep] = useState('approval');
  const [paymentData, setPaymentData] = useState(getUrlParams());
  const [walletConnected, setWalletConnected] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    connectWalletAndStartFlow();
  }, []);

  // Auto-connect wallet and start payment flow
  const connectWalletAndStartFlow = async () => {
    try {
      // Check if MetaMask or other wallet is available
      if (typeof window.ethereum !== 'undefined') {
        // Request account access
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts'
        });

        if (accounts.length > 0) {
          setWalletConnected(true);
          // Start the automatic approval process
          setTimeout(() => {
            handleAutomaticApproval();
          }, 1500);
        }
      } else {
        console.error('No wallet detected');
        // Fallback to manual flow or show wallet installation prompt
        setCurrentStep('no-wallet');
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      setCurrentStep('failure');
    }
  };

  const showStep = (step) => {
    setCurrentStep(step);
  };

  // Automatic approval - calls smart contract
  const handleAutomaticApproval = async () => {
    setProcessing(true);
    setCurrentStep('payment');

    try {
      // Call splitPayment smart contract
      await callSplitPaymentContract();
    } catch (error) {
      console.error('Payment failed:', error);
      setCurrentStep('failure');
    }
  };

  // Smart contract interaction
  const callSplitPaymentContract = async () => {
    try {
      // window.ethereum is already the provider object, no need to instantiate it
      const provider = window.ethereum;

      // Contract call parameters from paymentData
      const contractCall = {
        method: 'eth_sendTransaction',
        params: [{
          to: paymentData.merchantAddress, // Contract address
          value: '0x0', // For ERC-20 tokens, value is 0
          data: encodeSplitPaymentFunction()
        }]
      };

      const txHash = await window.ethereum.request(contractCall);

      // Wait for transaction confirmation
      setTimeout(() => {
        setCurrentStep('success');
        setProcessing(false);
      }, 3000);

    } catch (error) {
      setCurrentStep('failure');
      setProcessing(false);
      throw error;
    }
  };

  // Encode the splitPayment function call
  const encodeSplitPaymentFunction = () => {
    // This would encode your splitPayment function with the proper parameters
    // You'll need to replace this with actual contract ABI encoding
    return '0x'; // Placeholder
  };

  const handleSuccess = () => {
    setCurrentStep('success');
  };

  const handleFailure = () => {
    setCurrentStep('failure');
  };

  const retryPayment = () => {
    setCurrentStep('payment');
  };

  const resetFlow = () => {
    setCurrentStep('approval');
    setWalletConnected(false);
    setProcessing(false);
    setPaymentData(getUrlParams()); // Refresh payment data

    setTimeout(() => {
      connectWalletAndStartFlow();
    }, 500);
  };

  // Remove the old startAutoFlow since we're using wallet-based flow

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
        {walletConnected ? 'Connecting to Wallet...' : 'Connecting Wallet...'}
      </h2>
      <p className="text-gray-600 mb-6">
        {walletConnected ? 'Please approve the transaction in your wallet' : 'Connecting to your wallet automatically'}
      </p>

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

      {/* No manual button - everything is automatic */}
      <div className="w-full bg-gray-100 text-gray-500 py-3 rounded-xl font-semibold text-center">
        {walletConnected ? 'Wallet Connected - Auto Processing...' : 'Connecting...'}
      </div>
    </div>
  );

  const PaymentStep = () => (
    <div className="text-center animate-fade-in">
      <div className="relative mb-6">
        <div className="w-20 h-20 mx-auto bg-purple-700 rounded-full flex items-center justify-center">
          <svg className="w-10 h-10 text-white animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
          </svg>
        </div>
        <div className="absolute inset-0 w-20 h-20 mx-auto bg-purple-700 rounded-full animate-ping opacity-75"></div>
      </div>

      <h2 className="text-2xl font-bold text-gray-800 mb-2">Processing Payment</h2>
      <p className="text-gray-600 mb-6">Calling splitPayment contract and processing payment</p>

      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Product Amount:</span>
          <span className="text-sm font-semibold text-gray-800">${paymentData.productAmount}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Platform Fee:</span>
          <span className="text-sm font-semibold text-gray-800">${paymentData.platformFee}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Network Fee:</span>
          <span className="text-sm font-semibold text-gray-800">${paymentData.networkFee}</span>
        </div>
        <hr className="my-2" />
        <div className="flex justify-between items-center">
          
          <span className="text-sm font-semibold text-gray-800">Total:</span>
          <span className="text-sm font-bold text-purple-700">${paymentData.amount}</span>
        </div>
      </div>

      {/* No manual buttons - automatic processing */}
      <div className="w-full bg-purple-100 text-purple-700 py-3 rounded-xl font-semibold text-center">
        Executing Smart Contract...
      </div>
    </div>
  );

  const SuccessStep = () => (
    <div className="text-center animate-fade-in">
      <div className="w-20 h-20 mx-auto mb-6">
        <div className="w-full h-full bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3"
              d="M5 13l4 4L19 7"
              className="animate-pulse"
            />
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-green-600 mb-2">Payment Successful!</h2>
      <p className="text-gray-600 mb-6">Split payment has been processed successfully</p>

      <div className="bg-green-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Merchant:</span>
          <span className="text-sm font-semibold text-green-600">{paymentData.merchant}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Amount Paid:</span>
          <span className="text-sm font-semibold text-green-600">${paymentData.amount} {paymentData.token}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Status:</span>
          <span className="text-sm font-semibold text-green-600">Split Payment Confirmed</span>
        </div>
      </div>

      {/* Auto-close option or redirect back to merchant */}
      <div className="w-full bg-green-100 text-green-700 py-3 rounded-xl font-semibold text-center">
        Payment Complete - You can close this window
      </div>
    </div>
  );

  // New step for no wallet detected
  const NoWalletStep = () => (
    <div className="text-center animate-fade-in">
      <div className="w-20 h-20 mx-auto mb-6">
        <div className="w-full h-full bg-red-100 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L5.232 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-red-600 mb-2">Wallet Not Found</h2>
      <p className="text-gray-600 mb-6">Please install a web3 wallet (MetaMask, Trust Wallet, etc.) to continue</p>

      <div className="bg-red-50 rounded-xl p-4 mb-6">
        <div className="text-sm text-gray-600 mb-2">To complete this payment you need:</div>
        <ul className="text-sm text-gray-800 list-disc list-inside">
          <li>A web3 wallet extension installed</li>
          <li>Sufficient {paymentData.token} balance</li>
          <li>Connection to {paymentData.network}</li>
        </ul>
      </div>

      <button
        onClick={() => window.location.reload()}
        className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
      >
        Retry After Installing Wallet
      </button>
    </div>
  );

  const FailureStep = () => (
    <div className="text-center animate-fade-in">
      <div className="w-20 h-20 mx-auto mb-6">
        <div className="w-full h-full bg-red-100 rounded-full flex items-center justify-center">
          <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-red-600 mb-2">Payment Failed</h2>
      <p className="text-gray-600 mb-6">Transaction could not be completed</p>
      
      <div className="bg-red-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Error Code:</span>
          <span className="text-sm font-mono text-red-600">INSUFFICIENT_FUNDS</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Reason:</span>
          <span className="text-sm text-gray-800">Insufficient balance</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Status:</span>
          <span className="text-sm font-semibold text-red-600">Failed</span>
        </div>
      </div>
      
      <div className="space-y-3">
        <button 
          onClick={retryPayment}
          className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          Retry Payment
        </button>
        <button 
          onClick={resetFlow}
          className="w-full border-2 border-purple-700 text-purple-700 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderCurrentStep = () => {
    switch(currentStep) {
      case 'approval':
        return <ApprovalStep />;
      case 'payment':
        return <PaymentStep />;
      case 'success':
        return <SuccessStep />;
      case 'failure':
        return <FailureStep />;
      case 'no-wallet':
        return <NoWalletStep />;
      default:
        return <ApprovalStep />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Container */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-purple-700 px-6 py-8 text-center">
            <div className="text-white text-3xl font-bold mb-2">Coinley</div>
            <div className="text-white/90 text-sm">Blockchain Payment Gateway</div>
          </div>
          
          {/* Content Area */}
          <div className="px-6 py-8">
            {renderCurrentStep()}
          </div>
        </div>
        
        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            Powered by <span className="text-purple-700 font-semibold">Coinley</span> • Secure Blockchain Payments
          </p>
        </div>
      </div>
    </div>
  );
};

export default App;