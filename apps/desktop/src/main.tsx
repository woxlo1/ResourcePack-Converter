import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  App,
  ServicesProvider,
  createDefaultWorker,
  type UiServices,
} from '@rpc/ui';
import { createDesktopPlatform } from './desktop-platform';

const services: UiServices = {
  platform: createDesktopPlatform(),
  createWorker: createDefaultWorker,
  appVersion: '0.1.0',
};

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    <ServicesProvider value={services}>
      <App />
    </ServicesProvider>
  </StrictMode>,
);
