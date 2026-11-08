import { createContext, useContext } from 'react';
import type { PlatformAdapter } from './platform';
import type { ConversionWorkerClient } from './worker-client';

export interface UiServices {
  platform: PlatformAdapter;
  /** Creates the module worker that owns loaded archives. */
  createWorker: () => Worker;
  appVersion: string;
}

export interface ServicesContextValue extends UiServices {
  client: ConversionWorkerClient | null;
  workerError: string | null;
}

export const ServicesContext = createContext<ServicesContextValue | null>(null);

export function useServices(): ServicesContextValue {
  const value = useContext(ServicesContext);
  if (!value) throw new Error('useServices must be used inside a ServicesProvider.');
  return value;
}
