import { useState } from 'react';
import { getStubFlags, setStubFlags } from '../api';

const OPTIONS: Array<{ flag: string; label: string }> = [
  { flag: 'oos', label: 'Amul Taaza Toned Milk 500 ml is out of stock' },
  { flag: 'price', label: 'Britannia White Bread 400 g price changes ₹49 → ₹52' },
  { flag: 'surge', label: 'Surge fee on the bill' },
  { flag: 'noeta', label: 'Order responses have no ETA' },
];

/** Stub mode only: toggles the fake Instamart server's scenario flags for demos and testing. */
export function DemoScenarios() {
  const [flags, setFlags] = useState<string[]>(getStubFlags);
  const expanded = flags.includes('demo') ? [...new Set([...flags.filter((x) => x !== 'demo'), 'oos', 'price', 'surge'])] : flags;
  const toggle = (f: string) => {
    const next = expanded.includes(f) ? expanded.filter((x) => x !== f) : [...expanded, f];
    setFlags(next);
    setStubFlags(next);
  };
  return (
    <details className="scenarios" data-testid="demo-scenarios">
      <summary>Demo scenarios (stub mode)</summary>
      {OPTIONS.map((o) => (
        <label key={o.flag}>
          <input type="checkbox" checked={expanded.includes(o.flag)} onChange={() => toggle(o.flag)} />
          {o.label}
        </label>
      ))}
    </details>
  );
}
