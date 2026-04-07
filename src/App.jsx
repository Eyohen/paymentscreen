import React from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmiConfig';
import { queryClient } from './config/queryClient';
import CoinleyPayment from './CoinleyPayment';

const App = () => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <CoinleyPayment />
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
