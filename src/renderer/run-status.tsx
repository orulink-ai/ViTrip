import { useEffect, useState } from 'react';
import { ThinkingIndicator } from './components/assistant-ui/elements/thinking-indicator';

/** Mounted for one run; changing tool labels never resets its elapsed time. */
export function RunStatus({ label }: { label: string }) {
  const [startedAt] = useState(() => Date.now());
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(timer);
  }, [startedAt]);
  return <ThinkingIndicator role="status" label={label} elapsed={`${seconds}s`} />;
}
