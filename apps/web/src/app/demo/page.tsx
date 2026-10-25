import { BrainApp } from '../brain/BrainApp';

export const metadata = { title: 'Demo brain · Déjà' };

/** Public, read-only demo brain: explore without signing up. */
export default function DemoPage() {
  return <BrainApp demo />;
}
