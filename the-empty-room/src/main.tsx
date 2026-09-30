import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { beginSession } from './systems/session';
import './styles/global.css';

// La mémoire est lue avant la première image : la pièce est juste dès le premier instant.
beginSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
