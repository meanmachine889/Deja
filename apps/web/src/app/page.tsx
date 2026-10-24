import { redirect } from 'next/navigation';

// Landing page comes in task D8; until then the root opens the brain.
export default function Home() {
  redirect('/brain');
}
