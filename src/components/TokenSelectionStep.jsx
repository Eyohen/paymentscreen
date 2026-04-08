import React, { useState } from 'react';
import { CHAIN_ID_TO_SHORT_NAME } from '../config/lifiConfig';

/**
 * Token selection step for swap/bridge payments.
 * Shows tokens the user holds that can cover the payment amount.
 */
const TokenSelectionStep = ({
    tokens,
    loading,
    error,
    paymentAmount,
    paymentCurrency,
    paymentChainId,
    onSelectToken,
    onScanOtherChains,
    onBack,
    crossChainTokens,
    loadingCrossChain,
}) => {
    const [showCrossChain, setShowCrossChain] = useState(false);

    const handleScanOtherChains = () => {
        setShowCrossChain(true);
        onScanOtherChains?.();
    };

    const getRouteLabel = (token) => {
        const isOnPaymentChain = token.chainId === paymentChainId || !token.chainId;
        const isStable = !token.isSwapToken;

        if (isStable && isOnPaymentChain) return { label: 'Direct', color: '#22c55e' };
        if (isStable && !isOnPaymentChain) return { label: 'Bridge', color: '#3b82f6' };
        if (!isStable && isOnPaymentChain) return { label: 'Swap', color: '#a855f7' };
        return { label: 'Swap + Bridge', color: '#f59e0b' };
    };

    const formatBalance = (balance) => {
        if (!balance) return '0';
        const num = parseFloat(balance);
        if (num > 1000) return `${(num / 1000).toFixed(1)}K`;
        if (num > 1) return num.toFixed(2);
        return num.toFixed(4);
    };

    const TokenRow = ({ token }) => {
        const route = getRouteLabel(token);
        return (
            <button
                onClick={() => onSelectToken(token)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-purple-400 hover:bg-purple-50 transition-all"
            >
                {token.logo ? (
                    <img
                        src={token.logo}
                        alt={token.symbol}
                        className="w-8 h-8 rounded-full"
                        onError={(e) => {
                            e.target.src = `https://ui-avatars.com/api/?name=${token.symbol?.slice(0, 2)}&background=7042D2&color=fff&size=32`;
                        }}
                    />
                ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-purple-600">{token.symbol?.slice(0, 2)}</span>
                    </div>
                )}
                <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-gray-900">{token.symbol}</span>
                        {token.chainName && token.chainId !== paymentChainId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                                {token.chainName}
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-gray-400">{formatBalance(token.balance)}</span>
                </div>
                <div className="text-right">
                    {token.usdValue !== undefined && (
                        <span className="text-sm font-medium text-gray-700">~${token.usdValue.toFixed(2)}</span>
                    )}
                    <div
                        className="text-[10px] font-medium mt-0.5"
                        style={{ color: route.color }}
                    >
                        {route.label}
                    </div>
                </div>
            </button>
        );
    };

    return (
        <div className="space-y-4">
            <div className="text-center mb-2">
                <h3 className="text-lg font-semibold text-gray-900">Choose payment token</h3>
                <p className="text-sm text-gray-500 mt-1">
                    Pay {paymentAmount} {paymentCurrency} with any token
                </p>
            </div>

            {/* Tokens on current chain */}
            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                            <div className="w-8 h-8 rounded-full bg-gray-200" />
                            <div className="flex-1">
                                <div className="h-4 bg-gray-200 rounded w-20 mb-1" />
                                <div className="h-3 bg-gray-100 rounded w-12" />
                            </div>
                            <div className="h-4 bg-gray-200 rounded w-16" />
                        </div>
                    ))}
                </div>
            ) : error ? (
                <div className="p-4 rounded-xl bg-red-50 text-center">
                    <p className="text-sm text-red-600">Failed to load tokens</p>
                    <p className="text-xs text-red-400 mt-1">{error}</p>
                </div>
            ) : tokens.length === 0 ? (
                <div className="p-4 rounded-xl bg-gray-50 text-center">
                    <p className="text-sm text-gray-600">No tokens found on this network</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {tokens.map(token => (
                        <TokenRow key={`${token.contractAddress}-${token.chainId}`} token={token} />
                    ))}
                </div>
            )}

            {/* Cross-chain expander */}
            {!showCrossChain ? (
                <button
                    onClick={handleScanOtherChains}
                    className="w-full p-3 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 hover:border-purple-400 hover:text-purple-600 transition-all"
                >
                    Pay from another chain
                </button>
            ) : (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Other chains</p>
                    {loadingCrossChain ? (
                        <div className="flex items-center justify-center gap-2 p-4">
                            <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm text-gray-500">Scanning chains...</span>
                        </div>
                    ) : crossChainTokens?.length > 0 ? (
                        crossChainTokens.map(token => (
                            <TokenRow key={`${token.contractAddress}-${token.chainId}`} token={token} />
                        ))
                    ) : (
                        <p className="text-sm text-gray-400 text-center p-2">No tokens found on other chains</p>
                    )}
                </div>
            )}

            {/* Back button */}
            {onBack && (
                <button
                    onClick={onBack}
                    className="w-full p-2 text-sm text-gray-500 hover:text-gray-700"
                >
                    Back
                </button>
            )}
        </div>
    );
};

export default TokenSelectionStep;
