import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { LanguageProvider } from './i18n/index.jsx';
import { SessionProvider } from './session.jsx';
import { startAutoSync } from './sync/outbox.js';
import './index.css';

// Send entries saved offline as soon as (and whenever) the connection is back.
startAutoSync();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>
);
