import { useState, useEffect } from "react";
import { KubeConfig, CoreV1Api, AppsV1Api } from "@kubernetes/client-node";

export interface KubeClients {
  kubeConfig: KubeConfig;
  coreV1: CoreV1Api;
  appsV1: AppsV1Api;
  currentContext: string;
  availableContexts: string[];
  setContext: (context: string) => void;
  error: string | null;
}

export function useKubeClient(initialContext?: string): KubeClients {
  const [contextName, setContextName] = useState<string | undefined>(
    initialContext,
  );
  const [clients, setClients] = useState<Omit<KubeClients, "setContext">>(() =>
    buildClients(contextName),
  );

  useEffect(() => {
    setClients(buildClients(contextName));
  }, [contextName]);

  return { ...clients, setContext: setContextName };
}

function buildClients(contextName?: string): Omit<KubeClients, "setContext"> {
  try {
    const kc = new KubeConfig();
    kc.loadFromDefault();

    if (contextName) {
      kc.setCurrentContext(contextName);
    }

    const currentContext = kc.getCurrentContext();
    const availableContexts = kc.getContexts().map((c) => c.name);

    return {
      kubeConfig: kc,
      coreV1: kc.makeApiClient(CoreV1Api),
      appsV1: kc.makeApiClient(AppsV1Api),
      currentContext,
      availableContexts,
      error: null,
    };
  } catch (err) {
    const kc = new KubeConfig();
    return {
      kubeConfig: kc,
      coreV1: kc.makeApiClient(CoreV1Api),
      appsV1: kc.makeApiClient(AppsV1Api),
      currentContext: "",
      availableContexts: [],
      error: String(err),
    };
  }
}
