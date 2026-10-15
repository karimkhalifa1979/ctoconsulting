import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/app.css';

// The hosted preview build hides features its sandbox blocks (file downloads, printing).
if (import.meta.env.VITE_HOSTED) document.documentElement.dataset.hosted = import.meta.env.VITE_HOSTED;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
