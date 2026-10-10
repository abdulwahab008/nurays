import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LegalPage, LEGAL, supportEmailIsSet } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Help & contact | Nuray',
  description: 'Answers to common questions about ordering, delivery, payment and refunds on Nuray, and how to reach us.',
};

/** A question that opens to its answer; plain HTML, so it works before (and without) any script. */
function Faq({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white open:bg-slate-50/60">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-slate-900 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span>{question}</span>
        <span aria-hidden="true" className="text-slate-400 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-4 pb-4 text-[15px] leading-7 text-slate-700 space-y-2">{children}</div>
    </details>
  );
}

/** The public help page the app stores link to: answers without signing in, and how to reach support. */
export default function HelpPage() {
  return (
    <LegalPage title="Help & contact" updated="10 October 2026" legalText={false}>
      <section aria-labelledby="contact" className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
        <h2 id="contact" className="!mt-0">Talk to us</h2>
        <ul className="mt-2">
          <li>
            <strong>Email:</strong>{' '}
            {supportEmailIsSet ? (
              <a href={`mailto:${LEGAL.email}`} className="underline">{LEGAL.email}</a>
            ) : (
              <span>{LEGAL.email}</span>
            )}
          </li>
          <li>
            <strong>About an order:</strong> <Link href="/login" className="underline">sign in</Link>, open{' '}
            <Link href="/orders" className="underline">My Orders</Link> and choose the order. You can chat with the kitchen
            there, and an order that shows as delivered but never reached you can be reported from the same page: it goes
            to support with the order attached.
          </li>
          <li>
            <strong>Other questions:</strong> signed-in customers can open a ticket on the{' '}
            <Link href="/support" className="underline">support page</Link> and follow the replies there.
          </li>
        </ul>
      </section>

      <h2>Ordering</h2>
      <div className="space-y-2">
        <Faq question="How do I order?">
          <p>
            Choose a kitchen near you, add dishes to your tray, pick delivery or pickup and pay. An order is from one kitchen.
            Prices, the delivery fee and tax are shown before you confirm.
          </p>
        </Faq>
        <Faq question="Why do I only see some kitchens, or none?">
          <p>
            Kitchens deliver within the communities they serve. Save your address with its pin on the map so Nuray can match
            it to your community and show the kitchens that can deliver to you.
          </p>
        </Faq>
        <Faq question="The kitchen has not accepted my order. What happens?">
          <p>
            If the kitchen does not accept an order in time it is cancelled automatically and anything you paid is refunded.
          </p>
        </Faq>
      </div>

      <h2>Delivery</h2>
      <div className="space-y-2">
        <Faq question="How do I follow my order?">
          <p>
            Open <Link href="/orders" className="underline">My Orders</Link> and choose the order. It shows each step, and once
            the rider has the food, where they are on the map.
          </p>
        </Faq>
        <Faq question="What is the 4-digit code on my order?">
          <p>
            Each order has a handover code that only you can see on the order page. Give it to whoever hands you the order
            (the rider, the kitchen or the pickup counter) only <strong>after</strong> you have received it; it confirms the
            delivery. Never read it out before the food is in your hands.
          </p>
        </Faq>
        <Faq question="My order is late, or the rider cannot find me.">
          <p>
            Check the order page for its status and the rider&apos;s position. If it still looks wrong, chat with the kitchen
            from the order page or write to support, and we will sort it out with the kitchen and the rider. A clear landmark
            and house number on your saved address, and a note for the rider, help a great deal.
          </p>
        </Faq>
      </div>

      <h2>Payment</h2>
      <div className="space-y-2">
        <Faq question="How can I pay?">
          <ul>
            <li><strong>Cash on delivery:</strong> you pay whoever hands over the order.</li>
            <li><strong>Online payment</strong> (card or mobile wallet), when it is available, and your <strong>Nuray Wallet</strong> balance.</li>
            <li>
              <strong>Transfer to the kitchen</strong> (JazzCash, EasyPaisa or bank): pay the account shown on your order and
              upload the receipt. Only ever pay the account shown on the order page.
            </li>
          </ul>
        </Faq>
        <Faq question="Online payment is not offered at checkout.">
          <p>
            It is switched off for the moment. Pay with cash on delivery, your wallet, or a transfer to the kitchen instead.
          </p>
        </Faq>
        <Faq question="I paid but my order still says unpaid.">
          <p>
            Online payments can take a short while to show; the order page updates by itself. For a transfer, the kitchen must
            confirm the receipt first. If it has been more than an hour, write to support.
          </p>
        </Faq>
      </div>

      <h2>Cancellations and refunds</h2>
      <div className="space-y-2">
        <Faq question="Can I cancel an order?">
          <p>
            Yes, from the order page, until the kitchen accepts it. After that the food is being prepared; chat with the
            kitchen from the order page or write to support if something is wrong.
          </p>
        </Faq>
        <Faq question="How and when do I get a refund?">
          <p>
            Wallet payments are refunded to your wallet straight away. Online and transfer payments are refunded by transfer,
            normally within 3 to 7 working days. The full rules are in the{' '}
            <Link href="/refund-policy" className="underline">Refund &amp; Cancellation Policy</Link>.
          </p>
        </Faq>
      </div>

      <h2>Your account</h2>
      <div className="space-y-2">
        <Faq question="I did not get my verification code or email.">
          <p>
            Check your spam folder, wait a minute and ask for a new code from the sign-in page. Codes can only be requested
            a few times an hour. If nothing arrives, write to us from the address or number on the account.
          </p>
        </Faq>
        <Faq question="I forgot my password.">
          <p>
            Use <Link href="/forgot-password" className="underline">Forgot password</Link> on the sign-in page; we send a
            link to the email address on the account.
          </p>
        </Faq>
        <Faq question="How do I delete my account?">
          <p>
            From your profile, in the app, at any time. The steps, and what is deleted and what is kept, are on the{' '}
            <Link href="/delete-account" className="underline">delete account page</Link>. Your data is described in the{' '}
            <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </Faq>
      </div>

      <h2>Cooking or riding with Nuray</h2>
      <div className="space-y-2">
        <Faq question="How do I sell my food on Nuray?">
          <p>
            <Link href="/sellers/register" className="underline">Register your kitchen</Link>. Nuray checks every kitchen
            before it can sell, and you can start taking orders once you are approved.
          </p>
        </Faq>
        <Faq question="How do I deliver with Nuray?">
          <p>
            <Link href="/register?user_type=rider" className="underline">Create a rider account</Link> and send your
            details and documents. Riders are approved by Nuray before they can take jobs.
          </p>
        </Faq>
      </div>
    </LegalPage>
  );
}
