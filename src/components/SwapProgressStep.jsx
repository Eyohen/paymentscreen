import React from 'react';

/**
 * Shows swap/bridge quote for confirmation, then progress during execution.
 */
const SwapProgressStep = ({
    step, // 'confirming' | 'bridging' | 'waiting_deposit' | 'completed' | 'error'
    quote,
    selectedToken,
    paymentAmount,
    paymentCurrency,
    estimatedTime,
    progressMessage,
    error,
    onConfirm,
    onChangeToken,
    onRetry,
}) => {
    // Quote confirmation screen
    if (step === 'confirming' && quote) {
        return (
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 text-center">Confirm payment</h3>

                <div className="p-4 rounded-xl bg-gray-50 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">You send</span>
                        <span className="text-sm font-medium text-gray-900">
                            ~{quote.inputAmount} {quote.originTokenSymbol}
                            {quote.originChainName && quote.originChainName !== quote.destChainName && (
                                <span className="text-gray-400 ml-1">on {quote.originChainName}</span>
                            )}
                        </span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Merchant receives</span>
                        <span className="text-sm font-medium text-gray-900">
                            {paymentAmount} {paymentCurrency}
                        </span>
                    </div>
                    {quote.bridgeFee && parseFloat(quote.bridgeFee) > 0 && (
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Network fee</span>
                            <span className="text-xs text-gray-400">
                                ~{quote.bridgeFee} {quote.bridgeFeeCurrency}
                            </span>
                        </div>
                    )}
                    {estimatedTime && (
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-500">Estimated time</span>
                            <span className="text-xs text-gray-400">
                                ~{estimatedTime > 60 ? `${Math.ceil(estimatedTime / 60)} min` : `${estimatedTime}s`}
                            </span>
                        </div>
                    )}
                </div>

                <button
                    onClick={onConfirm}
                    className="w-full py-3 px-4 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 transition-all"
                >
                    Confirm & Pay
                </button>

                {onChangeToken && (
                    <button
                        onClick={onChangeToken}
                        className="w-full py-2 text-sm text-gray-500 hover:text-gray-700"
                    >
                        Change token
                    </button>
                )}
            </div>
        );
    }

    // Processing / waiting states
    if (step === 'bridging' || step === 'waiting_deposit' || step === 'quoting') {
        return (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-12 h-12 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <div className="text-center">
                    <p className="text-sm font-medium text-gray-900">
                        {step === 'quoting' && 'Getting quote...'}
                        {step === 'bridging' && 'Processing payment...'}
                        {step === 'waiting_deposit' && 'Confirming payment...'}
                    </p>
                    {progressMessage && (
                        <p className="text-xs text-gray-500 mt-1">{progressMessage}</p>
                    )}
                </div>
            </div>
        );
    }

    // Error state
    if (step === 'error') {
        return (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
                <div className="text-center">
                    <p className="text-sm font-medium text-gray-900">Something went wrong</p>
                    <p className="text-xs text-gray-500 mt-1">Please try again.</p>
                </div>
                <div className="flex gap-2">
                    {onRetry && (
                        <button
                            onClick={onRetry}
                            className="py-2 px-4 rounded-xl bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
                        >
                            Try Again
                        </button>
                    )}
                    {onChangeToken && (
                        <button
                            onClick={onChangeToken}
                            className="py-2 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
                        >
                            Change Token
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // Completed
    if (step === 'completed') {
        return (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <p className="text-sm font-medium text-gray-900">Payment confirmed!</p>
            </div>
        );
    }

    return null;
};

export default SwapProgressStep;
