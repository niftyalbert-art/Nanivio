import { createRoot } from 'react-dom/client';

import App from './App';
import { setBaseUrl } from '@workspace/api-client-react';

import './index.css';

// Remote API server
setBaseUrl('https://nanivio.onrender.com');

// When a new service worker takes control, reload so the fresh bundle is served
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(<App />);
