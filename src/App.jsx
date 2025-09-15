import React, { useState, useEffect } from 'react';

const App = () => {
  const [currentStep, setCurrentStep] = useState('approval');
  const [approvalButtonText, setApprovalButtonText] = useState('Simulate Approval');
  const [approvalButtonDisabled, setApprovalButtonDisabled] = useState(false);

  useEffect(() => {
    startAutoFlow();
  }, []);

  const showStep = (step) => {
    setCurrentStep(step);
  };

  const handleApproval = () => {
    setApprovalButtonText('Approving...');
    setApprovalButtonDisabled(true);
    
    setTimeout(() => {
      setCurrentStep('payment');
    }, 2000);
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
    setApprovalButtonText('Simulate Approval');
    setApprovalButtonDisabled(false);
    
    setTimeout(() => {
      startAutoFlow();
    }, 500);
  };

  const startAutoFlow = () => {
    // Step 1: Auto-advance to approval after 1.5 seconds
    setTimeout(() => {
      if (currentStep === 'approval') {
        handleApproval();
      }
    }, 1500);
    
    // Step 2: Auto-advance to payment processing after 3 seconds total
    setTimeout(() => {
      setCurrentStep('payment');
    }, 3000);
    
    // Step 3: Auto-advance to success after 4.5 seconds total
    setTimeout(() => {
      handleSuccess();
    }, 4500);
  };

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
      
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Approve Transaction</h2>
      <p className="text-gray-600 mb-6">Please approve the transaction on Ethereum network in your wallet</p>
      
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Network:</span>
          <span className="text-sm font-semibold text-gray-800">Ethereum Mainnet</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Token:</span>
          <span className="text-sm font-semibold text-gray-800">USDC</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Amount:</span>
          <span className="text-sm font-semibold text-purple-700">$99.99</span>
        </div>
      </div>
      
      <button 
        onClick={handleApproval}
        disabled={approvalButtonDisabled}
        className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {approvalButtonText}
      </button>
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
      <p className="text-gray-600 mb-6">Splitting transaction fees and processing payment</p>
      
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Product Amount:</span>
          <span className="text-sm font-semibold text-gray-800">$95.00</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Platform Fee:</span>
          <span className="text-sm font-semibold text-gray-800">$2.99</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Network Fee:</span>
          <span className="text-sm font-semibold text-gray-800">$2.00</span>
        </div>
        <hr className="my-2" />
        <div className="flex justify-between items-center">
          <span className="text-sm font-semibold text-gray-800">Total:</span>
          <span className="text-sm font-bold text-purple-700">$99.99</span>
        </div>
      </div>
      
      <div className="flex space-x-2 mb-6">
        <button 
          onClick={handleSuccess}
          className="flex-1 bg-green-500 text-white py-2 rounded-lg text-sm hover:bg-green-600 transition-colors"
        >
          Simulate Success
        </button>
        <button 
          onClick={handleFailure}
          className="flex-1 bg-red-500 text-white py-2 rounded-lg text-sm hover:bg-red-600 transition-colors"
        >
          Simulate Failure
        </button>
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
      <p className="text-gray-600 mb-6">Your payment has been processed successfully</p>
      
      <div className="bg-green-50 rounded-xl p-4 mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Transaction ID:</span>
          <span className="text-xs font-mono text-gray-800">0x7d2f...8a9c</span>
        </div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">Amount Paid:</span>
          <span className="text-sm font-semibold text-green-600">$99.99 USDC</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Status:</span>
          <span className="text-sm font-semibold text-green-600">Confirmed</span>
        </div>
      </div>
      
      <button 
        onClick={resetFlow}
        className="w-full bg-purple-700 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity"
      >
        Process Another Payment
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