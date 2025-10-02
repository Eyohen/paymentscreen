import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

// ✅ CRITICAL: Add global BigInt serialization support
if (typeof BigInt.prototype.toJSON === 'undefined') {
  BigInt.prototype.toJSON = function() {
    return this.toString();
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
