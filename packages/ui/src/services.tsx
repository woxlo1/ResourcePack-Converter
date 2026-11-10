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
    let cancelled = false;

    // Creating the worker is an external-system side effect, so it cannot run
    // during render. The state update is deferred to a microtask to avoid a
    // synchronous cascading render inside the effect.
    const setup = async (): Promise<void> => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        instance = new ConversionWorkerClient(createWorker());
        setClient(instance);
        setWorkerError(null);
      } catch (error) {
        setClient(null);
        setWorkerError(error instanceof Error ? error.message : String(error));
      }
    };

    void setup();

    return () => {
      cancelled = true;
      instance?.terminate();
    };
  }, [createWorker]);

  const contextValue = useMemo<ServicesContextValue>(
    () => ({ ...value, client, workerError }),
    [value, client, workerError],
  );

  return <ServicesContext.Provider value={contextValue}>{children}</ServicesContext.Provider>;
}
