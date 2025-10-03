import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../config/queryClient';
import usePaymentStore from '../stores/paymentStore';

/**
 * API Configuration
 */
const API_URL = process.env.REACT_APP_COINLEY_API_URL || 'https://talented-mercy-production.up.railway.app';

/**
 * API Client with error handling
 */
const apiClient = {
  async get(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async post(endpoint, data, headers = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }
};

/**
 * Hook: Fetch payment details by paymentId
 *
 * @param {string} paymentId - Payment ID from URL params
 * @returns {object} Query result with payment data
 */
export const usePaymentDetails = (paymentId) => {
  const { addDebugLog } = usePaymentStore();

  return useQuery({
    queryKey: queryKeys.paymentDetails(paymentId),
    queryFn: async () => {
      addDebugLog('info', `🔄 Fetching payment details for: ${paymentId}`);

      const data = await apiClient.get(`/api/payments/public/${paymentId}`);

      addDebugLog('success', '✅ Payment details fetched successfully', {
        paymentId: data.id,
        amount: data.amount,
        merchant: data.Merchant?.businessName,
        network: data.Network?.name
      });

      return data;
    },
    enabled: !!paymentId, // Only run if paymentId exists
    staleTime: Infinity, // Payment details never change
    retry: 3,
    onError: (error) => {
      addDebugLog('error', '❌ Failed to fetch payment details', {
        paymentId,
        error: error.message
      });
    }
  });
};

/**
 * Hook: Verify payment transaction
 *
 * @returns {object} Mutation result for payment verification
 */
export const usePaymentVerification = () => {
  const queryClient = useQueryClient();
  const { addDebugLog } = usePaymentStore();

  return useMutation({
    mutationFn: async ({ paymentId, transactionHash, network, senderAddress, apiCredentials }) => {
      addDebugLog('info', `🔍 Verifying payment transaction: ${transactionHash}`);

      const headers = {};
      if (apiCredentials?.apiKey && apiCredentials?.apiSecret) {
        headers['X-API-Key'] = apiCredentials.apiKey;
        headers['X-API-Secret'] = apiCredentials.apiSecret;
      }

      const result = await apiClient.post('/api/payments/process', {
        paymentId,
        transactionHash,
        network,
        senderAddress,
        source: 'payment_screen'
      }, headers);

      addDebugLog('success', '✅ Payment verified successfully', {
        paymentId,
        transactionHash,
        status: result.status
      });

      return result;
    },
    onSuccess: (data, variables) => {
      // Invalidate payment queries to refetch updated status
      queryClient.invalidateQueries({ queryKey: queryKeys.payment(variables.paymentId) });
    },
    onError: (error, variables) => {
      addDebugLog('error', '❌ Payment verification failed', {
        paymentId: variables.paymentId,
        error: error.message
      });
    },
    retry: 2,
    retryDelay: 1000
  });
};

/**
 * Hook: Check payment status
 *
 * @param {string} paymentId - Payment ID
 * @param {boolean} enabled - Whether to enable polling
 * @returns {object} Query result with payment status
 */
export const usePaymentStatus = (paymentId, enabled = false) => {
  const { addDebugLog } = usePaymentStore();

  return useQuery({
    queryKey: queryKeys.paymentStatus(paymentId),
    queryFn: async () => {
      const data = await apiClient.get(`/api/payments/status/${paymentId}`);

      addDebugLog('info', `💳 Payment status: ${data.status}`, {
        paymentId,
        status: data.status,
        transactionHash: data.transactionHash
      });

      return data;
    },
    enabled: !!paymentId && enabled,
    refetchInterval: (data) => {
      // Poll every 3 seconds if payment is pending
      if (data?.status === 'pending' || data?.status === 'processing') {
        return 3000;
      }
      // Stop polling if completed or failed
      return false;
    },
    retry: false // Don't retry status checks
  });
};

/**
 * Hook: Get transaction receipt
 *
 * @param {string} txHash - Transaction hash
 * @param {object} provider - Web3 provider
 * @returns {object} Query result with transaction receipt
 */
export const useTransactionReceipt = (txHash, provider) => {
  const { addDebugLog } = usePaymentStore();

  return useQuery({
    queryKey: queryKeys.transactionReceipt(txHash),
    queryFn: async () => {
      addDebugLog('info', `🔍 Fetching transaction receipt: ${txHash}`);

      if (!provider) {
        throw new Error('No provider available');
      }

      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        throw new Error('Transaction not yet mined');
      }

      addDebugLog('success', '✅ Transaction receipt fetched', {
        txHash,
        status: receipt.status,
        blockNumber: receipt.blockNumber
      });

      return receipt;
    },
    enabled: !!txHash && !!provider,
    retry: 5, // Retry up to 5 times (transaction may not be mined yet)
    retryDelay: (attemptIndex) => Math.min(3000 * 2 ** attemptIndex, 30000), // 3s, 6s, 12s, 24s, 30s
    onError: (error) => {
      addDebugLog('warn', '⚠️ Transaction receipt not available yet', {
        txHash,
        error: error.message
      });
    }
  });
};

/**
 * Hook: Prefetch payment details
 * Useful for optimistic loading
 *
 * @param {string} paymentId - Payment ID to prefetch
 */
export const usePrefetchPayment = (paymentId) => {
  const queryClient = useQueryClient();

  return {
    prefetch: async () => {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.paymentDetails(paymentId),
        queryFn: () => apiClient.get(`/api/payments/public/${paymentId}`),
        staleTime: Infinity
      });
    }
  };
};
