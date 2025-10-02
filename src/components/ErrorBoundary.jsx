import React from 'react';

/**
 * Error Boundary Component
 * Catches React errors and prevents blank white screen
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('🚨 React Error Boundary caught an error:', {
      error: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString()
    });

    this.setState({
      error,
      errorInfo
    });

    // Send error to external logging service (optional)
    if (window.Sentry) {
      window.Sentry.captureException(error);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoBack = () => {
    window.history.back();
  };

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 p-4 flex items-center justify-center">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl p-8">
            {/* Error Icon */}
            <div className="w-20 h-20 mx-auto bg-red-500 rounded-full flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* Error Title */}
            <h1 className="text-2xl font-bold text-gray-800 mb-3 text-center">
              Oops! Something Went Wrong
            </h1>

            {/* Error Description */}
            <p className="text-gray-600 text-center mb-6">
              The payment screen encountered an unexpected error. This might be due to:
            </p>

            <ul className="text-sm text-gray-700 mb-6 space-y-2">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Invalid payment link or missing parameters</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Wallet browser compatibility issue</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Network connectivity problem</span>
              </li>
            </ul>

            {/* Error Details (collapsed by default) */}
            <details className="mb-6 bg-gray-50 rounded-lg p-4">
              <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900">
                Technical Details
              </summary>
              <div className="mt-3 text-xs font-mono text-red-600 overflow-x-auto">
                <p className="mb-2"><strong>Error:</strong> {this.state.error?.message || 'Unknown error'}</p>
                <pre className="bg-white p-2 rounded border border-red-200 overflow-x-auto">
                  {this.state.error?.stack || 'No stack trace available'}
                </pre>
              </div>
            </details>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={this.handleReload}
                className="w-full bg-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:bg-purple-700 transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.handleGoBack}
                className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
              >
                Go Back
              </button>
            </div>

            {/* Support Message */}
            <p className="text-xs text-gray-500 text-center mt-6">
              If this issue persists, please contact the merchant or Coinley support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
