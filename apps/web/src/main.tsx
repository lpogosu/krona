import '@fontsource-variable/onest';
import '@fontsource/unbounded/700.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/caveat/700.css';
import './styles/tokens.css';
import './styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('В index.html нет #root');
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
