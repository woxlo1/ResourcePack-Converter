import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { ServicesContext, type ServicesContextValue, type UiServices } from './services-context';
import { ConversionWorkerClient } from './worker-client';

export function ServicesProvider({
  value,
  children,
}: {
  value: UiServices;
  children: ReactNode;
}): ReactElement {
  const [client, setClient] = useState<ConversionWorkerClient | null>(null);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const createWorker = value.createWorker;

  useEffect(() => {
    let instance: ConversionWorkerClient | null = null;
    try {
      instance = new ConversionWorkerClient(createWorker());
      setClient(instance);
      setWorkerError(null);
    } catch (error) {
      setClient(null);
      setWorkerError(error instanceof Error ? error.message : String(error));
    }
    return () => {
      instance?.terminate();
    };
  }, [createWorker]);

  const contextValue = useMemo<ServicesContextValue>(
    () => ({ ...value, client, workerError }),
    [value, client, workerError],
  );

  return <ServicesContext.Provider value={contextValue}>{children}</ServicesContext.Provider>;
}
