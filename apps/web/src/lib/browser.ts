'use client';
// Browser-side Appwrite: auth session, short-lived JWTs for our API, and Realtime.
import { Account, Channel, Client, Realtime } from 'appwrite';

export const OFFLINE = process.env.NEXT_PUBLIC_DEJA_OFFLINE === '1';

let client: Client | null = null;
export function appwrite(): Client {
  client ??= new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'unset');
  return client;
}

export const account = () => new Account(appwrite());

let jwt: { token: string; at: number } | null = null;
async function getJwt(): Promise<string> {
  // Appwrite JWTs live 15 minutes; refresh well before that.
  if (jwt && Date.now() - jwt.at < 10 * 60_000) return jwt.token;
  const res = await account().createJWT();
  jwt = { token: res.jwt, at: Date.now() };
  return jwt.token;
}

export function clearJwt() {
  jwt = null;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (!OFFLINE) headers.authorization = `Bearer ${await getJwt()}`;
  const res = await fetch(path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data as T;
}

/** Subscribe to every row written to the events table the signed-in user can read. */
export async function subscribeEvents(onEvent: (row: Record<string, unknown>) => void): Promise<() => void> {
  if (OFFLINE) return () => {};
  const realtime = new Realtime(appwrite());
  const sub = await realtime.subscribe(Channel.tablesdb('deja').table('events').row(), (e) => {
    if (e.events.some((name) => name.endsWith('.create'))) onEvent(e.payload as Record<string, unknown>);
  });
  return () => sub.close();
}
