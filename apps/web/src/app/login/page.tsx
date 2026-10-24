'use client';
import { ID } from 'appwrite';
import { Copy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { account, OFFLINE } from '@/lib/browser';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (OFFLINE) router.replace('/brain');
    else account().get().then((u) => setUserId(u.$id)).catch(() => {});
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') await account().create({ userId: ID.unique(), email, password, name: name || undefined });
      await account().createEmailPasswordSession({ email, password });
      setUserId((await account().get()).$id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const install = `DEJA_OWNER_ID=${userId}\nclaude mcp add deja -- pnpm -s --dir ~/deja mcp`;

  return (
    <main className="dot-grid flex min-h-dvh items-center justify-center bg-void px-4">
      <div className="w-full max-w-sm">
        <p className="flex items-center gap-2 font-serif text-2xl">
          <span className="h-2 w-2 rounded-full bg-amber" /> déjà
        </p>
        {userId ? (
          <div className="glass mt-6 p-6">
            <h1 className="font-serif text-3xl leading-tight">Connect your agent.</h1>
            <p className="mt-2 text-sm text-mute">Put your owner id in the repo’s .env, then add the MCP server to Claude Code.</p>
            <pre className="mt-4 overflow-x-auto border border-line bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-ink-2">
              {install}
            </pre>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(install)}
                className="inline-flex items-center gap-1.5 border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-line-2"
              >
                <Copy size={12} /> Copy
              </button>
              <button onClick={() => router.push('/brain')} className=" bg-ink px-4 py-1.5 text-xs font-medium text-void">
                Open brain →
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="glass mt-6 flex flex-col gap-3 p-6">
            <h1 className="font-serif text-3xl leading-tight">{mode === 'signin' ? 'Welcome back.' : 'Give your agents a memory.'}</h1>
            {mode === 'signup' && <Field label="Name" value={name} onChange={setName} autoComplete="name" />}
            <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
            <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} />
            {error && <p className="text-xs text-conflict">{error}</p>}
            <button disabled={busy} className="mt-1 bg-amber py-2.5 text-sm font-medium text-void transition hover:brightness-110 disabled:opacity-50">
              {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="text-xs text-mute hover:text-ink">
              {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-mute">
      {props.label}
      <input
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete={props.autoComplete}
        required={props.required}
        minLength={props.minLength}
        className=" border border-line bg-black/30 px-3 py-2 text-sm text-ink focus:border-amber/50 focus:outline-none"
      />
    </label>
  );
}
