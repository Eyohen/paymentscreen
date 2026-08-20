import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../config/queryClient';
import { resolveApiBaseUrl } from '../config/apiBase';
import { versionEndpoint } from '../config/apiVersion';
import usePaymentStore from '../stores/paymentStore';

/**
 * API Configuration — the deep-link `apiUrl` query param lets a payment created
 * on a non-default backend (e.g. staging) be fetched from the right server, but
 * it is validated against an allowlist first: this client sends merchant API
 * credentials and trusts the deposit address it receives back.
 */
const API_URL = resolveApiBaseUrl();

/**
 * API Client with error handling
 */
const apiClient = {
  async get(endpoint) {
    // Single place the version is applied, so endpoints added later cannot
    // forget it.
    const response = await fetch(`${API_URL}${versionEndpoint(endpoint)}`);
    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },

  async post(endpoint, data, headers = {}) {
    const response = await fetch(`${API_URL}${versionEndpoint(endpoint)}`, {
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

      const response = await apiClient.get(`/api/payments/public/${paymentId}`);
      const data = response.payment || response;

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
 * Hook: Create a deposit payment (for swap/bridge flow)
 * Converts an existing pending payment into a deposit payment with a CREATE2 address.
 */
export const useCreateDepositPayment = () => {
  const { addDebugLog } = usePaymentStore();

  return useMutation({
    mutationFn: async ({ amount, currency, network, existingPaymentId, metadata, apiCredentials }) => {
      addDebugLog('info', `Creating deposit payment for ${amount} ${currency} on ${network}`);

      const headers = {};
      if (apiCredentials?.apiKey && apiCredentials?.apiSecret) {
        headers['X-API-Key'] = apiCredentials.apiKey;
        headers['X-API-Secret'] = apiCredentials.apiSecret;
      } else if (apiCredentials?.publicKey) {
        headers['X-Public-Key'] = apiCredentials.publicKey;
      }

      const result = await apiClient.post('/api/deposits/create', {
        amount,
        currency,
        network,
        existingPaymentId,
        metadata
      }, headers);

      addDebugLog('success', `Deposit payment created: ${result.payment?.depositAddress}`, {
        depositAddress: result.payment?.depositAddress,
        paymentId: result.payment?.id
      });

      return result;
    },
    onError: (error) => {
      addDebugLog('error', 'Deposit payment creation failed', { error: error.message });
    }
  });
};

/**
 * Hook: Poll deposit status until funds arrive
 */
export const useDepositStatus = (paymentId, enabled = false) => {
  const { addDebugLog } = usePaymentStore();

  return useQuery({
    queryKey: queryKeys.depositStatus(paymentId),
    queryFn: async () => {
      const data = await apiClient.get(`/api/deposits/status/${paymentId}`);
      return data;
    },
    enabled: !!paymentId && enabled,
    refetchInterval: (data) => {
      const status = data?.payment?.status;
      if (status === 'completed' || status === 'swept' || status === 'failed') {
        return false; // Stop polling
      }
      return 5000; // Poll every 5 seconds
    },
    retry: false,
    onSuccess: (data) => {
      const status = data?.payment?.status;
      if (status === 'completed' || status === 'swept') {
        addDebugLog('success', 'Deposit confirmed on destination chain');
      }
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
