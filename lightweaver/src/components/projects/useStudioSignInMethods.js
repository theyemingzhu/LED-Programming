import { useEffect, useState } from 'react';
import { readStudioPasswordlessMethods } from '../../lib/studioPasswordlessClient.js';

export function useStudioSignInMethods(active) {
  const [methods, setMethods] = useState(null);
  const [methodsError, setMethodsError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let current = true;
    setMethodsError(false);
    readStudioPasswordlessMethods().then(
      value => { if (current) setMethods(value); },
      () => { if (current) setMethodsError(true); },
    );
    return () => { current = false; };
  }, [active, attempt]);

  return { methods, methodsError, retryMethods: () => setAttempt(value => value + 1) };
}
