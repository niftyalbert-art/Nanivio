import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// When a new service worker takes control, reload so the fresh bundle is served
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

createRoot(document.getElementById('root')!).render(<App />);
