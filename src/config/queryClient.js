import { QueryClient } from '@tanstack/react-query';

/**
 * Optimized TanStack Query configuration for Coinley Payment Screen
 *
 * Features:
 * - Request deduplication
 * - Smart caching with configurable stale times
 * - Exponential backoff retry logic
 * - Mobile-optimized refetch behavior
 * - Error handling with retry limits
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Caching Strategy
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 minutes
      cacheTime: 1000 * 60 * 10, // Keep unused data in cache for 10 minutes

      // Retry Logic
      retry: 3, // Retry failed requests 3 times
      retryDelay: (attemptIndex) => {
        // Exponential backoff: 1s, 2s, 4s, 8s (max 30s)
        return Math.min(1000 * 2 ** attemptIndex, 30000);
      },

      // Mobile Optimizations
      refetchOnWindowFocus: false, // Don't refetch when returning to tab (mobile UX)
      refetchOnReconnect: true, // DO refetch when internet reconnects
      refetchOnMount: false, // Don't refetch on component mount if data is fresh

      // Network Mode
      networkMode: 'online', // Only run queries when online

      // Error Handling
      useErrorBoundary: false, // Handle errors locally, not with error boundary

      // Request Deduplication
      structuralSharing: true, // Prevent unnecessary re-renders
    },

    mutations: {
      // Mutations (POST/PUT requests)
      retry: 2, // Retry failed mutations 2 times
      retryDelay: 1000, // Wait 1s between retries
      networkMode: 'online', // Only run mutations when online
    }
  }
});

/**
 * Query Key Factory for consistent cache key management
 */
export const queryKeys = {
  // Payment queries
  payment: (paymentId) => ['payment', paymentId],
  paymentDetails: (paymentId) => ['payment', 'details', paymentId],
  paymentStatus: (paymentId) => ['payment', 'status', paymentId],

  // Transaction queries
  transaction: (txHash) => ['transaction', txHash],
  transactionReceipt: (txHash) => ['transaction', 'receipt', txHash],

  // Token queries
  tokenBalance: (address, tokenAddress) => ['token', 'balance', address, tokenAddress],
  tokenAllowance: (owner, spender, tokenAddress) => ['token', 'allowance', owner, spender, tokenAddress],
};

/**
 * Clear all payment-related cache
 */
export const clearPaymentCache = () => {
  queryClient.removeQueries({ queryKey: ['payment'] });
};

/**
 * Invalidate specific payment query
 */
export const invalidatePayment = (paymentId) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.payment(paymentId) });
};

/**
 * Prefetch payment details for faster loading
 */
export const prefetchPaymentDetails = async (paymentId) => {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.paymentDetails(paymentId),
    queryFn: () => fetch(`/api/payments/public/${paymentId}`).then(res => res.json()),
    staleTime: Infinity // Payment details never change
  });
};
