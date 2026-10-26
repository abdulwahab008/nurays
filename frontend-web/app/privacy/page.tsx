import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, ContactUs, Operator } from '@/components/legal/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy | Nuray',
  description: 'What Nuray collects, why, who it is shared with and your choices.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="26 October 2026">
      <p>
        This policy explains what personal information <Operator /> (&quot;Nuray&quot;, &quot;we&quot;) collects when you
        use Nuray, why, who it is shared with and the choices you have. We handle it in line with the laws of Pakistan that
        apply to it, including the Prevention of Electronic Crimes Act, 2016.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong>: name, e-mail address, phone number, password (stored only as a one-way hash), and, if you sign in with Google, your Google profile name, e-mail and picture.</li>
        <li><strong>Addresses</strong>: the delivery addresses you save, including the map pin (latitude and longitude) and the community it belongs to.</li>
        <li><strong>Orders</strong>: what you ordered, from which kitchen, prices, delivery details, status history, and your reviews.</li>
        <li><strong>Payments</strong>: the payment method, transaction references and, for transfers to a kitchen, the receipt image you upload. We do not see or store card numbers; card payments are handled by our payment provider.</li>
        <li><strong>Messages</strong>: chat messages and voice notes exchanged about an order.</li>
        <li><strong>Sellers and riders</strong>: business and identity details and documents submitted for verification (for example CNIC, licence, kitchen photos), payout account details, and delivery activity, including a rider&apos;s location while on a delivery (in the Nuray app, also with the app in the background or the screen off, if the rider allows it; it stops when the delivery is done).</li>
        <li><strong>Technical data</strong>: IP address, device and browser information and logs, used for security and to keep the service running.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To run the marketplace: take orders, work out which kitchens deliver to you and at what fee, deliver, take payments and give refunds.</li>
        <li>To keep accounts secure: verification codes, fraud and abuse prevention, and protecting handovers (your handover code is shown only to you).</li>
        <li>To support you and resolve complaints, and to meet legal, tax and accounting obligations.</li>
        <li>To send service messages about your account and orders (e-mail, SMS, and push notifications if you allow them). We do not send marketing messages without your consent.</li>
      </ul>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>The kitchen and rider for your order</strong>: your name, delivery address and order details, so they can prepare and deliver it, and your phone number only while that is needed for the order. A kitchen sees the receipt for a transfer made to its own account.</li>
        <li><strong>Service providers</strong> working for us: hosting and file storage, SMS (for verification codes), e-mail delivery, our online payment provider, error monitoring, and map services (OpenStreetMap-based). Some of them may store data on servers outside Pakistan; we share only what each one needs.</li>
        <li><strong>Authorities</strong>, when Pakistani law or a court order requires it.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>Storage and security</h2>
      <p>
        Payment receipts, verification documents and chat media are stored privately and are only shown, through links that
        expire after a few minutes, to people involved in that order or to Nuray staff who need them. Passwords are hashed,
        connections are encrypted and staff sign in with two-step verification. No system is perfectly secure; tell us
        through <ContactUs /> if you suspect a problem.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep account information while your account is open. Order, payment and accounting records are kept as long as
        Pakistani tax law requires (currently up to six years), then deleted or anonymised. One-time verification codes are
        deleted within a day. Records of actions taken in the service (kept for security, such as who changed an order or a
        setting) are deleted after two years.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can view and correct your profile and addresses in the app, and delete saved addresses at any time.</li>
        <li>You can delete your account yourself from <Link href="/profile" className="underline">your profile</Link> (Danger zone, Delete account); the steps are also described at <Link href="/delete-account" className="underline">/delete-account</Link>. Some records must be kept for legal reasons even after an account is closed.</li>
        <li>You can ask us for a copy of your information, or ask a question about it, through <ContactUs />.</li>
        <li>You can turn off push notifications in your browser or device settings.</li>
      </ul>

      <h2>Children</h2>
      <p>Nuray is not meant for children under 18, who should use it only with a parent or guardian.</p>

      <h2>Changes and contact</h2>
      <p>
        We will update this policy when our practices change; the date above shows the latest version. Questions about your
        information: <ContactUs />.
      </p>
    </LegalPage>
  );
}
