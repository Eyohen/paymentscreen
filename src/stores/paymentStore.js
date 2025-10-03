import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Centralized payment store using Zustand for state management
const usePaymentStore = create(
  devtools(
    persist(
      (set, get) => ({
        // ==================== PAYMENT STATE ====================
        currentStep: 'idle', // idle, connection, approval, payment, verification, success, error
        paymentData: null,
        transactionHash: null,
        approvalHash: null,
        processing: false,
        error: null,

        // ==================== PROVIDER STATE ====================
        detectedProviders: [], // EIP-6963 providers
        selectedProvider: null,
        walletEnv: null, // Detected wallet environment
        providerReady: false,
        isConnected: false,
        connectionAttempts: 0,

        // ==================== DEBUG/LOGGING STATE ====================
        debugLogs: [],
        showDebugPanel: true,
        copySuccess: false,

        // ==================== ACTIONS ====================

        // Payment Data Actions
        setPaymentData: (data) => set({ paymentData: data }),
        setCurrentStep: (step) => set({ currentStep: step }),
        setProcessing: (processing) => set({ processing }),
        setError: (error) => set({ error, currentStep: error ? 'error' : get().currentStep }),
        setTransactionHash: (hash) => set({ transactionHash: hash }),
        setApprovalHash: (hash) => set({ approvalHash: hash }),

        // Provider Actions
        setDetectedProviders: (providers) => set({ detectedProviders: providers }),
        setSelectedProvider: (provider) => set({ selectedProvider: provider }),
        setWalletEnv: (env) => set({ walletEnv: env }),
        setProviderReady: (ready) => set({ providerReady: ready }),
        setIsConnected: (connected) => set({ isConnected: connected }),
        incrementConnectionAttempts: () => set((state) => ({ connectionAttempts: state.connectionAttempts + 1 })),
        resetConnectionAttempts: () => set({ connectionAttempts: 0 }),

        // Debug Logging Actions
        addDebugLog: (type, message, data = null) => {
          const timestamp = new Date().toLocaleTimeString();

          // ✅ Serialize BigInt to prevent JSON errors
          const serializeSafeData = (obj) => {
            if (obj === null || obj === undefined) return obj;
            if (typeof obj === 'bigint') return obj.toString();
            if (Array.isArray(obj)) return obj.map(serializeSafeData);
            if (typeof obj === 'object') {
              const safe = {};
              for (const key in obj) {
                safe[key] = serializeSafeData(obj[key]);
              }
              return safe;
            }
            return obj;
          };

          const logEntry = {
            id: Date.now() + Math.random(),
            type,
            message,
            data: serializeSafeData(data),
            timestamp,
            iso: new Date().toISOString()
          };

          set((state) => ({
            debugLogs: [...state.debugLogs, logEntry].slice(-50) // Keep last 50 logs
          }));

          // Also log to console
          console.log(`[${type.toUpperCase()}] [${timestamp}] ${message}`, data || '');
        },

        clearLogs: () => set({ debugLogs: [] }),

        toggleDebugPanel: () => set((state) => ({ showDebugPanel: !state.showDebugPanel })),

        // Copy logs to clipboard
        copyLogsToClipboard: async () => {
          const { debugLogs } = get();

          if (debugLogs.length === 0) {
            return;
          }

          try {
            // Format logs as readable text
            const logsText = debugLogs.map(log => {
              let text = `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`;
              if (log.data) {
                text += `\nData: ${JSON.stringify(log.data, null, 2)}`;
              }
              return text;
            }).join('\n\n' + '='.repeat(80) + '\n\n');

            // Add header with system info
            const header = `COINLEY PAYMENT SCREEN DEBUG LOGS
${'='.repeat(80)}
Generated: ${new Date().toISOString()}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}
Total Logs: ${debugLogs.length}
${'='.repeat(80)}

`;

            const fullText = header + logsText;

            // Try modern clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(fullText);
              set({ copySuccess: true });
              setTimeout(() => set({ copySuccess: false }), 2000);
            } else {
              // Fallback for older browsers/mobile
              const textArea = document.createElement('textarea');
              textArea.value = fullText;
              textArea.style.position = 'fixed';
              textArea.style.left = '-999999px';
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              set({ copySuccess: true });
              setTimeout(() => set({ copySuccess: false }), 2000);
            }

            get().addDebugLog('success', '📋 Logs copied to clipboard successfully');
          } catch (err) {
            get().addDebugLog('error', '❌ Failed to copy logs', { error: err.message });
          }
        },

        // Reset entire store
        reset: () => set({
          currentStep: 'idle',
          paymentData: null,
          transactionHash: null,
          approvalHash: null,
          processing: false,
          error: null,
          detectedProviders: [],
          selectedProvider: null,
          walletEnv: null,
          providerReady: false,
          isConnected: false,
          connectionAttempts: 0,
          debugLogs: [],
          copySuccess: false
        })
      }),
      {
        name: 'coinley-payment-store', // localStorage key
        partialize: (state) => ({
          // Only persist these fields
          debugLogs: state.debugLogs.slice(-50), // Keep last 50 logs in localStorage
          showDebugPanel: state.showDebugPanel
        })
      }
    ),
    {
      name: 'CoinleyPaymentStore' // DevTools name
    }
  )
);

export default usePaymentStore;
