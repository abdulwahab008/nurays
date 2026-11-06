import type { Metadata } from 'next';
import { HelpContent } from './HelpContent';

export const metadata: Metadata = {
  title: 'Help & contact | Nuray',
  description: 'Answers to common questions about ordering, delivery, payment and refunds on Nuray, and how to reach us.',
};

/** The public help page the app stores link to: answers without signing in, and how to reach support. */
export default function HelpPage() {
  return <HelpContent />;
}
