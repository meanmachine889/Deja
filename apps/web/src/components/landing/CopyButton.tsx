'use client';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="text-faint transition hover:text-ink"
      aria-label="Copy command"
    >
      {done ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}
