import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './components/chat/ChatView.css';
import './styles/app-theme.css';
import './styles/reference-depth.css';
import './styles/nanivio-aurora.css';
import './styles/nanivio-neon.css';
import './i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
