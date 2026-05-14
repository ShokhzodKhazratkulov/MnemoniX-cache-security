
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { PostProvider } from './context/PostContext';
import { SyncProvider } from './context/SyncContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient, setupPersistence } from './lib/query';

// Initialize persistence
setupPersistence();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SyncProvider>
          <PostProvider>
            <App />
          </PostProvider>
        </SyncProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
