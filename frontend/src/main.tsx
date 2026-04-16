import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Точка входа React 18 с createRoot (React 18.3.1 — §1)
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
