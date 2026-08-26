import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { applyTheme, readInitialTheme } from './theme';

// Das gespeicherte Design wird vor dem ersten Render gesetzt. Dadurch blitzt
// beim Neuladen nicht kurz das jeweils andere Farbschema auf.
applyTheme(readInitialTheme());

const root = document.getElementById('root');

if (!root) {
  throw new Error('Der Startpunkt der Anwendung fehlt.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
