import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { config } from './wagmiConfig';
import { queryClient } from './config/queryClient';
import CoinleyPayment from './CoinleyPayment';
import SdkHostedPayment from './SdkHostedPayment';
import { resolvePaymentMode } from './lib/paymentMode';

const App = () => {
  const mode = resolvePaymentMode(window.location.search);

  // SDK-host mode brings its own wagmi + react-query providers via CoinleyProvider —
  // do NOT wrap it in paymentscreen's WagmiProvider (would nest two wagmi contexts).
  if (mode === 'sdk-host') {
    return <SdkHostedPayment />;
  }

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <CoinleyPayment />
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default App;
