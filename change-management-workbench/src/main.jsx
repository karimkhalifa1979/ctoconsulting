import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './styles/app.css';
import App from './App.jsx';

// Theme preference: light, dark or the operating system setting.
try {
  const t = localStorage.getItem('cmw.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch { /* storage unavailable */ }

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
