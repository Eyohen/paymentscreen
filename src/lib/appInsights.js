import { ApplicationInsights } from '@microsoft/applicationinsights-web';

const connectionString = import.meta.env.VITE_APPLICATIONINSIGHTS_CONNECTION_STRING;

export const appInsights = connectionString ? new ApplicationInsights({
  config: {
    connectionString,
    enableAutoRouteTracking: true,
    enableCorsCorrelation: true,
    correlationHeaderExcludedDomains: ['*.solana.com', '*.alchemy.com', '*.infura.io']
  }
}) : null;

if (appInsights) {
  appInsights.loadAppInsights();
  appInsights.trackPageView();
}
