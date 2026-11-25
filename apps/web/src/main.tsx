// Global CSS FIRST, in cascade order: design tokens -> reset + primitives -> admin (scoped under .admin-main).
// These imports must stay above every component import: Vite emits CSS in import order, and feature CSS
// (fx, shell, home, work, ...) imported by components must come AFTER base.css so it can refine primitives.
import './styles/tokens.css';
import './styles/base.css';
import './styles/legacy-admin.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { PortfolioProvider } from './context/PortfolioContext';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import { ErrorBoundary, ErrorScreen } from './app/ErrorBoundary';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const app = <BrowserRouter><AuthProvider><PortfolioProvider><App /></PortfolioProvider></AuthProvider></BrowserRouter>;
// Last line of defence: an error outside any page (providers, router, shell) shows a recoverable
// screen instead of a blank document. Pages and decorative chrome have their own boundaries in App.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={error => <ErrorScreen error={error} fullscreen />}>
      {clientId ? <GoogleOAuthProvider clientId={clientId}>{app}</GoogleOAuthProvider> : app}
    </ErrorBoundary>
  </StrictMode>
);
