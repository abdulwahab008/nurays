import { cancellationReasonForCustomer } from './cancellationText';

/**
 * The words of every server-made notification, in each language the apps speak, keyed by kind. A notification is
 * written in its recipient's language when it is made (the stored row, the live event, push, email and SMS all carry
 * the same words); English when they have not chosen Urdu. Names and other text people typed stay as typed; the reasons the
 * apps and the server write themselves are translated. The admin area is English-only, so staff alerts are always English.
 */

export type NotificationLanguage = 'en' | 'ur';

export interface NotificationWords {
  title: string;
  message: string;
}

export const notificationLanguageOf = (preference: string | null | undefined): NotificationLanguage => (preference === 'ur' ? 'ur' : 'en');

const entry = <P>(en: (p: P) => NotificationWords, ur: (p: P) => NotificationWords) => ({ en, ur });
const englishOnly = <P>(en: (p: P) => NotificationWords) => ({ en, ur: en });

// Keeps "#FN-1042" reading left to right inside an Urdu sentence (as the website's Urdu strings do).
const no = (orderNumber: string) => `⁦#${orderNumber}⁩`;

type NoParams = Record<string, never>;
type Order = { orderNumber: string };
type OrderStatus = Order & { pickup: boolean; cancelledBy: string | null; reason: string | null };
type Named = { name: string };
type Rejected = { reason: string };

// The fixed reasons written by the kitchen's reject dialog, the payment dispute button and the stale-order sweep, as the website says them in Urdu.
const URDU_REASONS: Record<string, string> = {
  'item unavailable': 'ڈش دستیاب نہیں',
  'too busy / high kitchen load': 'ابھی بہت مصروف ہیں',
  'unable to prepare in time': 'وقت پر تیار نہیں ہو سکتا',
  'temporary kitchen or utility issue': 'گیس، بجلی یا کچن کا مسئلہ',
  'kitchen unavailable': 'کچن دستیاب نہیں',
  "the kitchen didn't confirm the order in time.": 'کچن نے وقت پر آرڈر قبول نہیں کیا',
  "the payment wasn't completed in time.": 'ادائیگی وقت پر مکمل نہیں ہوئی',
  'payment transfer not found in kitchen account': 'کچن کے اکاؤنٹ میں ٹرانسفر نہیں ملی',
  'payment not received': 'ادائیگی موصول نہیں ہوئی',
};

/** A known reason in Urdu, keeping any words the kitchen added after it ("Item unavailable: out of rice"); anything else as written. */
const reasonInUrdu = (reason: string) => {
  const split = reason.indexOf(': ');
  const known = URDU_REASONS[(split > 0 ? reason.slice(0, split) : reason).trim().toLowerCase()];
  if (!known) return reason;
  return split > 0 ? `${known} — ${reason.slice(split + 2)}` : known;
};

const payoutMethod: Record<NotificationLanguage, Record<string, string>> = {
  en: { bank_transfer: 'bank', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' },
  ur: { bank_transfer: 'بینک', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa' },
};

const CATALOGUE = {
  'order.confirmed': entry<OrderStatus>(
    (p) => ({ title: 'Order confirmed', message: `The kitchen accepted your order #${p.orderNumber}.` }),
    (p) => ({ title: 'آرڈر قبول ہو گیا', message: `کچن نے آپ کا آرڈر ${no(p.orderNumber)} قبول کر لیا ہے۔` })
  ),
  'order.preparing': entry<OrderStatus>(
    (p) => ({ title: 'Order being prepared', message: `Your order #${p.orderNumber} is being prepared.` }),
    (p) => ({ title: 'آرڈر تیار ہو رہا ہے', message: `آپ کا آرڈر ${no(p.orderNumber)} تیار ہو رہا ہے۔` })
  ),
  'order.ready': entry<OrderStatus>(
    (p) => ({
      title: 'Order ready',
      message: p.pickup ? `Your order #${p.orderNumber} is ready for you to collect.` : `Your order #${p.orderNumber} is packed and waiting for its rider.`,
    }),
    (p) => ({
      title: 'آرڈر تیار ہے',
      message: p.pickup ? `آپ کا آرڈر ${no(p.orderNumber)} تیار ہے، آ کر لے جائیں۔` : `آپ کا آرڈر ${no(p.orderNumber)} پیک ہو گیا ہے اور رائیڈر کا انتظار ہے۔`,
    })
  ),
  'order.dispatched': entry<OrderStatus>(
    (p) => ({ title: 'Order picked up', message: `Your order #${p.orderNumber} has left the kitchen.` }),
    (p) => ({ title: 'آرڈر اٹھا لیا گیا', message: `آپ کا آرڈر ${no(p.orderNumber)} کچن سے روانہ ہو گیا ہے۔` })
  ),
  'order.in_transit': entry<OrderStatus>(
    (p) => ({ title: 'Order on the way', message: `Your order #${p.orderNumber} is on its way!` }),
    (p) => ({ title: 'آرڈر راستے میں ہے', message: `آپ کا آرڈر ${no(p.orderNumber)} راستے میں ہے!` })
  ),
  'order.delivered': entry<OrderStatus>(
    (p) => ({ title: 'Order delivered', message: `Your order #${p.orderNumber} has been delivered. Enjoy!` }),
    (p) => ({ title: 'آرڈر پہنچ گیا', message: `آپ کا آرڈر ${no(p.orderNumber)} پہنچ گیا ہے۔ مزے سے کھائیں!` })
  ),
  'order.delivery_failed': entry<OrderStatus>(
    (p) => ({ title: 'Delivery unsuccessful', message: `We couldn't deliver order #${p.orderNumber}. Our team will reach out shortly.` }),
    (p) => ({ title: 'ڈیلیوری نہیں ہو سکی', message: `ہم آرڈر ${no(p.orderNumber)} نہیں پہنچا سکے۔ ہماری ٹیم جلد آپ سے رابطہ کرے گی۔` })
  ),
  'order.completed': entry<OrderStatus>(
    (p) => ({ title: 'Order completed', message: `Your order #${p.orderNumber} is complete. Thanks for ordering!` }),
    (p) => ({ title: 'آرڈر مکمل', message: `آپ کا آرڈر ${no(p.orderNumber)} مکمل ہو گیا۔ آرڈر کرنے کا شکریہ!` })
  ),
  'order.cancelled': entry<OrderStatus>(
    (p) => {
      const why = cancellationReasonForCustomer(p.cancelledBy, p.reason);
      const message =
        p.cancelledBy === 'seller'
          ? `The kitchen could not take your order #${p.orderNumber}${why ? `: ${why}` : ''}. It has been cancelled.`
          : p.cancelledBy === 'system'
            ? `Your order #${p.orderNumber} was cancelled automatically${why ? `: ${why}` : ''}.`
            : `Your order #${p.orderNumber} has been cancelled.`;
      return { title: 'Order cancelled', message };
    },
    (p) => {
      const reason = cancellationReasonForCustomer(p.cancelledBy, p.reason);
      const why = reason && reasonInUrdu(reason);
      const message =
        p.cancelledBy === 'seller'
          ? `کچن آپ کا آرڈر ${no(p.orderNumber)} نہیں لے سکا${why ? `: ${why}` : ''}۔ آرڈر منسوخ کر دیا گیا ہے۔`
          : p.cancelledBy === 'system'
            ? `آپ کا آرڈر ${no(p.orderNumber)} خود بخود منسوخ ہو گیا${why ? `: ${why}` : ''}۔`
            : `آپ کا آرڈر ${no(p.orderNumber)} منسوخ ہو گیا ہے۔`;
      return { title: 'آرڈر منسوخ', message };
    }
  ),
  'order.refunded': entry<OrderStatus>(
    (p) => ({ title: 'Order refunded', message: `Your order #${p.orderNumber} has been refunded.` }),
    (p) => ({ title: 'آرڈر کی رقم واپس', message: `آپ کے آرڈر ${no(p.orderNumber)} کی رقم واپس کر دی گئی ہے۔` })
  ),
  'order.placed': entry<Order & { total: string }>(
    (p) => ({ title: 'Order placed', message: `Your order #${p.orderNumber} (${p.total}) has been placed.` }),
    (p) => ({ title: 'آرڈر دے دیا گیا', message: `آپ کا آرڈر ${no(p.orderNumber)} (${p.total}) دے دیا گیا ہے۔` })
  ),

  'order.payNow': entry<Order & { total: string }>(
    (p) => ({
      title: 'Your order is accepted: please pay',
      message: `The kitchen accepted order #${p.orderNumber}. Open the order to see its account and send ${p.total} within the hour.`,
    }),
    (p) => ({
      title: 'آپ کا آرڈر قبول ہو گیا: براہِ کرم ادائیگی کریں',
      message: `کچن نے آرڈر ${no(p.orderNumber)} قبول کر لیا ہے۔ آرڈر کھول کر اس کا اکاؤنٹ دیکھیں اور ایک گھنٹے کے اندر ${p.total} بھیج دیں۔`,
    })
  ),

  'kitchen.newOrder': entry<Order & { dishesTotal: string }>(
    (p) => ({ title: 'New order received', message: `New order #${p.orderNumber}: ${p.dishesTotal} of your dishes. Please accept it within 30 minutes.` }),
    (p) => ({ title: 'نیا آرڈر آیا ہے', message: `نیا آرڈر ${no(p.orderNumber)}: آپ کی ڈشز ${p.dishesTotal} کی۔ براہِ کرم 30 منٹ کے اندر قبول کریں۔` })
  ),
  'kitchen.newOrderAwaitingPayment': entry<Order & { dishesTotal: string }>(
    (p) => ({
      title: 'New order (awaiting payment)',
      message: `Order #${p.orderNumber} (${p.dishesTotal} of your dishes) is waiting for the customer's online payment. Don't start it yet.`,
    }),
    (p) => ({
      title: 'نیا آرڈر (ادائیگی کا انتظار)',
      message: `آرڈر ${no(p.orderNumber)} (آپ کی ڈشز ${p.dishesTotal} کی) کسٹمر کی آن لائن ادائیگی کا منتظر ہے۔ ابھی تیاری شروع نہ کریں۔`,
    })
  ),
  'kitchen.newPaidOrder': entry<Order>(
    (p) => ({ title: 'New paid order', message: `Order #${p.orderNumber} has been paid online. Please accept it within 30 minutes.` }),
    (p) => ({ title: 'نیا ادا شدہ آرڈر', message: `آرڈر ${no(p.orderNumber)} کی آن لائن ادائیگی ہو گئی ہے۔ براہِ کرم 30 منٹ کے اندر قبول کریں۔` })
  ),
  'kitchen.orderCancelled': entry<Order & { by: 'customer' | 'system' | 'support' }>(
    (p) => ({
      title: `Order #${p.orderNumber} cancelled`,
      message:
        p.by === 'system'
          ? `Order #${p.orderNumber} was cancelled automatically. Don't prepare it.`
          : `Order #${p.orderNumber} was cancelled by ${p.by === 'customer' ? 'the customer' : 'Nuray support'}. Don't prepare it.`,
    }),
    (p) => ({
      title: `آرڈر ${no(p.orderNumber)} منسوخ`,
      message:
        p.by === 'system'
          ? `آرڈر ${no(p.orderNumber)} خود بخود منسوخ ہو گیا۔ اسے تیار نہ کریں۔`
          : `آرڈر ${no(p.orderNumber)} ${p.by === 'customer' ? 'کسٹمر' : 'Nuray سپورٹ'} نے منسوخ کر دیا۔ اسے تیار نہ کریں۔`,
    })
  ),
  'kitchen.checkPayment': entry<Order & { amount: string; reference: string }>(
    (p) => ({
      title: `Check a payment: order #${p.orderNumber}`,
      message: `The customer says they sent ${p.amount} (reference ${p.reference}). Confirm it once it's in your account.`,
    }),
    (p) => ({
      title: `ادائیگی چیک کریں: آرڈر ${no(p.orderNumber)}`,
      message: `کسٹمر کے مطابق انہوں نے ${p.amount} بھیجے ہیں (ریفرنس ${p.reference})۔ رقم آپ کے اکاؤنٹ میں آ جائے تو تصدیق کریں۔`,
    })
  ),
  'kitchen.paymentConfirmedBySupport': entry<Order>(
    (p) => ({
      title: `Payment confirmed: order #${p.orderNumber}`,
      message: `Nuray support checked the transfer for order #${p.orderNumber}: it reached your account, so the order is paid.`,
    }),
    (p) => ({
      title: `ادائیگی کی تصدیق: آرڈر ${no(p.orderNumber)}`,
      message: `Nuray سپورٹ نے آرڈر ${no(p.orderNumber)} کی ٹرانسفر چیک کر لی: رقم آپ کے اکاؤنٹ میں پہنچ گئی ہے، اس لیے آرڈر کی ادائیگی ہو چکی ہے۔`,
    })
  ),
  'kitchen.approved': entry<NoParams>(
    () => ({ title: 'Your kitchen was approved', message: 'You can now list dishes and take orders.' }),
    () => ({ title: 'آپ کا کچن منظور ہو گیا', message: 'اب آپ ڈشز لگا سکتے ہیں اور آرڈر لے سکتے ہیں۔' })
  ),
  'kitchen.rejected': entry<Rejected>(
    (p) => ({ title: 'Your kitchen application was not approved', message: `Reason: ${p.reason}` }),
    (p) => ({ title: 'آپ کے کچن کی درخواست منظور نہیں ہوئی', message: `وجہ: ${p.reason}` })
  ),
  'kitchen.suspended': entry<NoParams>(
    () => ({ title: 'Your kitchen was suspended', message: 'Your dishes are hidden and you cannot take new orders. Contact support for details.' }),
    () => ({ title: 'آپ کا کچن معطل کر دیا گیا', message: 'آپ کی ڈشز چھپا دی گئی ہیں اور آپ نئے آرڈر نہیں لے سکتے۔ تفصیل کے لیے سپورٹ سے رابطہ کریں۔' })
  ),
  'kitchen.reactivated': entry<NoParams>(
    () => ({ title: 'Your kitchen is active again', message: 'You can take orders again.' }),
    () => ({ title: 'آپ کا کچن دوبارہ فعال ہے', message: 'آپ دوبارہ آرڈر لے سکتے ہیں۔' })
  ),
  'dish.approved': entry<Named>(
    (p) => ({ title: 'Dish approved', message: `"${p.name}" is live. Customers can order it now.` }),
    (p) => ({ title: 'ڈش منظور ہو گئی', message: `"${p.name}" اب لائیو ہے۔ کسٹمر اسے آرڈر کر سکتے ہیں۔` })
  ),
  'dish.rejected': entry<Named & Rejected>(
    (p) => ({ title: 'Dish not approved', message: `"${p.name}" wasn't approved: ${p.reason}` }),
    (p) => ({ title: 'ڈش منظور نہیں ہوئی', message: `"${p.name}" منظور نہیں ہوئی: ${p.reason}` })
  ),
  'dish.underReview': entry<Named>(
    (p) => ({ title: 'Your changes are under review', message: `"${p.name}" is hidden from customers until staff approve the changes.` }),
    (p) => ({ title: 'آپ کی تبدیلیاں زیرِ جائزہ ہیں', message: `جب تک عملہ تبدیلیاں منظور نہ کرے، "${p.name}" کسٹمرز سے چھپی رہے گی۔` })
  ),
  'category.approved': entry<Named>(
    (p) => ({ title: 'Category approved', message: `"${p.name}" is now a category. You can list your dishes in it.` }),
    (p) => ({ title: 'کیٹیگری منظور ہو گئی', message: `"${p.name}" اب ایک کیٹیگری ہے۔ آپ اپنی ڈشز اس میں لگا سکتے ہیں۔` })
  ),
  'category.rejected': entry<Named & Rejected>(
    (p) => ({ title: 'Category request not approved', message: `"${p.name}" wasn't added: ${p.reason}` }),
    (p) => ({ title: 'کیٹیگری کی درخواست منظور نہیں ہوئی', message: `"${p.name}" شامل نہیں کی گئی: ${p.reason}` })
  ),
  'payout.sent': entry<{ amount: string; transactionId: string | null }>(
    (p) => ({ title: 'Payout sent', message: `We sent your payout of ${p.amount}${p.transactionId ? ` (transaction ${p.transactionId})` : ''}.` }),
    (p) => ({ title: 'پے آؤٹ بھیج دیا گیا', message: `ہم نے آپ کا ${p.amount} کا پے آؤٹ بھیج دیا ہے${p.transactionId ? ` (ٹرانزیکشن ${p.transactionId})` : ''}۔` })
  ),
  'payout.accountChanged': entry<{ hours: number }>(
    (p) => ({ title: 'Your payout account was changed', message: `Your payouts will go to the new account after ${p.hours} hours. If you did not make this change, contact Nuray now.` }),
    (p) => ({ title: 'آپ کا پے آؤٹ اکاؤنٹ تبدیل کر دیا گیا', message: `${p.hours} گھنٹے بعد آپ کے پے آؤٹ نئے اکاؤنٹ میں جائیں گے۔ اگر یہ تبدیلی آپ نے نہیں کی تو ابھی Nuray سے رابطہ کریں۔` })
  ),
  'payout.failed': entry<{ amount: string; reason: string }>(
    (p) => ({
      title: "Your payout didn't go through",
      message: `Your payout of ${p.amount} could not be sent: ${p.reason}. The amount is back in your balance; check your payout details and request it again.`,
    }),
    (p) => ({
      title: 'آپ کا پے آؤٹ نہیں جا سکا',
      message: `آپ کا ${p.amount} کا پے آؤٹ نہیں بھیجا جا سکا: ${p.reason}۔ رقم آپ کے بیلنس میں واپس آ گئی ہے؛ اپنی پے آؤٹ کی تفصیلات چیک کر کے دوبارہ درخواست دیں۔`,
    })
  ),
  'payout.daily': entry<{ amount: string; periodEnd: string; method: string }>(
    (p) => ({
      title: 'Your payout is on its way',
      message: `${p.amount} for your orders up to ${p.periodEnd} is being sent to your ${payoutMethod.en[p.method] ?? p.method} account. The statement lists every order.`,
    }),
    (p) => ({
      title: 'آپ کا پے آؤٹ آ رہا ہے',
      message: `${p.periodEnd} تک کے آپ کے آرڈرز کے ${p.amount} آپ کے ${payoutMethod.ur[p.method] ?? p.method} اکاؤنٹ میں بھیجے جا رہے ہیں۔ اسٹیٹمنٹ میں ہر آرڈر درج ہے۔`,
    })
  ),
  'payout.riderDue': entry<{ amount: string }>(
    (p) => ({
      title: 'Your pay is due today',
      message: `Nuray owes you ${p.amount} after the cash you hold. It is paid today; an admin will send it.`,
    }),
    (p) => ({
      title: 'آج آپ کی تنخواہ واجب ہے',
      message: `آپ کے پاس موجود نقدی کے بعد Nuray پر آپ کے ${p.amount} واجب ہیں۔ یہ آج ادا کیے جائیں گے؛ ایڈمن بھیجے گا۔`,
    })
  ),  'owing.reminder': entry<{ owed: string; pausesOn: string }>(
    (p) => ({
      title: 'You owe Nuray commission',
      message: `You owe Nuray ${p.owed} in commission on cash orders. It is taken from your online earnings; if it is still owed on ${p.pausesOn}, cash orders pause until it is paid.`,
    }),
    (p) => ({
      title: 'آپ پر Nuray کا کمیشن واجب ہے',
      message: `نقد آرڈرز کا ${p.owed} کمیشن آپ پر Nuray کا واجب ہے۔ یہ آپ کی آن لائن کمائی سے کٹ جاتا ہے؛ اگر ${p.pausesOn} تک واجب رہا تو ادائیگی تک نقد آرڈر رک جائیں گے۔`,
    })
  ),
  'owing.cashPaused': entry<{ owed: string }>(
    (p) => ({
      title: 'Cash and transfer orders are paused',
      message: `You owe Nuray ${p.owed}. New orders paid to you in cash or by transfer to your account are paused until it is paid; online orders still come in and pay it off.`,
    }),
    (p) => ({
      title: 'نقد اور ٹرانسفر والے آرڈر رک گئے ہیں',
      message: `آپ پر Nuray کے ${p.owed} واجب ہیں۔ ادائیگی تک وہ نئے آرڈر رکے رہیں گے جن کی رقم آپ نقد یا اپنے اکاؤنٹ میں ٹرانسفر سے لیتے ہیں؛ آن لائن آرڈر آتے رہیں گے اور یہ رقم ادا کرتے رہیں گے۔`,
    })
  ),
  'owing.paid': entry<{ amount: string; stillOwed: string | null }>(
    (p) => ({
      title: 'Payment to Nuray received',
      message: `We received your payment of ${p.amount}.${p.stillOwed ? ` Still owed: ${p.stillOwed}.` : ' You owe nothing now, and cash orders are open.'}`,
    }),
    (p) => ({
      title: 'Nuray کو ادائیگی موصول ہو گئی',
      message: `ہمیں آپ کی ${p.amount} کی ادائیگی مل گئی ہے۔${p.stillOwed ? ` ابھی واجب: ${p.stillOwed}۔` : ' اب آپ پر کچھ واجب نہیں، اور نقد آرڈر کھل گئے ہیں۔'}`,
    })
  ),

  'payment.confirmedByKitchen': entry<Order>(
    (p) => ({ title: 'Payment confirmed', message: `The kitchen confirmed your payment for order #${p.orderNumber}.` }),
    (p) => ({ title: 'ادائیگی کی تصدیق ہو گئی', message: `کچن نے آرڈر ${no(p.orderNumber)} کے لیے آپ کی ادائیگی کی تصدیق کر دی ہے۔` })
  ),
  'payment.confirmedBySupport': entry<Order>(
    (p) => ({ title: 'Payment confirmed', message: `Nuray support confirmed your payment for order #${p.orderNumber}.` }),
    (p) => ({ title: 'ادائیگی کی تصدیق ہو گئی', message: `Nuray سپورٹ نے آرڈر ${no(p.orderNumber)} کے لیے آپ کی ادائیگی کی تصدیق کر دی ہے۔` })
  ),
  'payment.disputed': entry<Order & { reason: string | null }>(
    (p) => ({
      title: "The kitchen couldn't find your payment",
      message: `For order #${p.orderNumber}: "${p.reason || 'Payment not received'}". Check the transfer and send the receipt again, or contact support.`,
    }),
    (p) => ({
      title: 'کچن کو آپ کی ادائیگی نہیں ملی',
      message: `آرڈر ${no(p.orderNumber)}: "${reasonInUrdu(p.reason || 'Payment not received')}"۔ ٹرانسفر چیک کر کے رسید دوبارہ بھیجیں، یا سپورٹ سے رابطہ کریں۔`,
    })
  ),
  'payment.received': entry<Order>(
    (p) => ({ title: 'Payment received', message: `We received your payment for order #${p.orderNumber}.` }),
    (p) => ({ title: 'ادائیگی موصول ہو گئی', message: `ہمیں آرڈر ${no(p.orderNumber)} کے لیے آپ کی ادائیگی مل گئی ہے۔` })
  ),
  'payment.creditedToWallet': entry<Order>(
    (p) => ({ title: 'Payment credited to your wallet', message: `An online payment for order #${p.orderNumber} wasn't needed, so it is in your Nuray Wallet.` }),
    (p) => ({ title: 'رقم آپ کے والٹ میں ڈال دی گئی', message: `آرڈر ${no(p.orderNumber)} کی آن لائن ادائیگی کی ضرورت نہیں تھی، اس لیے یہ رقم آپ کے Nuray والٹ میں ہے۔` })
  ),
  'wallet.toppedUp': entry<{ amount: string }>(
    (p) => ({ title: 'Wallet topped up', message: `${p.amount} was added to your Nuray Wallet.` }),
    (p) => ({ title: 'والٹ ٹاپ اپ ہو گیا', message: `آپ کے Nuray والٹ میں ${p.amount} شامل ہو گئے۔` })
  ),
  'refund.sent': entry<Order & { amount: string; reference: string | null }>(
    (p) => ({
      title: 'Refund sent',
      message: `We sent your refund of ${p.amount} for order #${p.orderNumber}${p.reference ? ` (reference ${p.reference})` : ''}.`,
    }),
    (p) => ({
      title: 'ری فنڈ بھیج دیا گیا',
      message: `ہم نے آرڈر ${no(p.orderNumber)} کا ${p.amount} کا ری فنڈ بھیج دیا ہے${p.reference ? ` (ریفرنس ${p.reference})` : ''}۔`,
    })
  ),

  'rider.approved': entry<NoParams>(
    () => ({ title: 'Your rider application was approved', message: 'You can go on duty and take deliveries.' }),
    () => ({ title: 'آپ کی رائیڈر کی درخواست منظور ہو گئی', message: 'اب آپ ڈیوٹی پر آ کر ڈیلیوریاں لے سکتے ہیں۔' })
  ),
  'rider.rejected': entry<Rejected>(
    (p) => ({ title: 'Your rider application was not approved', message: `Reason: ${p.reason}. You can fix it and apply again.` }),
    (p) => ({ title: 'آپ کی رائیڈر کی درخواست منظور نہیں ہوئی', message: `وجہ: ${p.reason}۔ آپ اسے درست کر کے دوبارہ درخواست دے سکتے ہیں۔` })
  ),
  'delivery.assigned': entry<Order & { pickupAddress: string; dropoffArea: string; cashToCollect: number }>(
    (p) => {
      const to = p.dropoffArea ? `deliver to ${p.dropoffArea}` : 'open the job for the drop-off';
      const cash = p.cashToCollect > 0 ? ` Collect Rs ${Math.round(p.cashToCollect)} in cash.` : '';
      return { title: 'New delivery assigned to you', message: `Order #${p.orderNumber}: pick up from ${p.pickupAddress}, ${to}.${cash}` };
    },
    (p) => {
      const to = p.dropoffArea ? `${p.dropoffArea} پہنچائیں` : 'ڈراپ آف کے لیے جاب کھولیں';
      const cash = p.cashToCollect > 0 ? ` Rs ${Math.round(p.cashToCollect)} نقد وصول کریں۔` : '';
      return { title: 'آپ کو نئی ڈیلیوری ملی ہے', message: `آرڈر ${no(p.orderNumber)}: ${p.pickupAddress} سے اٹھائیں، ${to}۔${cash}` };
    }
  ),
  'delivery.cancelled': entry<Order>(
    (p) => ({ title: 'Job cancelled', message: `Order #${p.orderNumber} was cancelled. Don't pick it up; if you already have the food, contact support.` }),
    (p) => ({ title: 'جاب منسوخ', message: `آرڈر ${no(p.orderNumber)} منسوخ ہو گیا ہے۔ اسے نہ اٹھائیں؛ اگر کھانا آپ کے پاس ہے تو سپورٹ سے رابطہ کریں۔` })
  ),
  'delivery.takenBack': entry<Order>(
    (p) => ({ title: 'Job taken back', message: `Order #${p.orderNumber} is no longer yours: it was given back to other riders. Don't pick it up.` }),
    (p) => ({ title: 'جاب واپس لے لی گئی', message: `آرڈر ${no(p.orderNumber)} اب آپ کا نہیں رہا: یہ دوسرے رائیڈرز کو دے دیا گیا ہے۔ اسے نہ اٹھائیں۔` })
  ),
  'rider.depositRejected': entry<{ amount: string; reason: string }>(
    (p) => ({ title: 'Deposit not accepted', message: `Your deposit of ${p.amount} was not accepted: ${p.reason}. The cash still counts as with you; please check and submit it again.` }),
    (p) => ({ title: 'جمع شدہ رقم قبول نہیں ہوئی', message: `آپ کی ${p.amount} کی جمع شدہ رقم قبول نہیں ہوئی: ${p.reason}۔ یہ نقدی ابھی آپ کے پاس شمار ہوتی ہے؛ براہِ کرم چیک کر کے دوبارہ جمع کرائیں۔` })
  ),
  'rider.cashOverdue': entry<{ hours: number }>(
    (p) => ({ title: 'Deposit your cash', message: `You have held customer cash for more than ${p.hours} hours. Deposit it to Nuray's account and submit the receipt; until then you get no new cash orders.` }),
    (p) => ({ title: 'اپنی نقدی جمع کرائیں', message: `آپ کے پاس کسٹمر کی نقدی ${p.hours} گھنٹے سے زیادہ ہے۔ اسے Nuray کے اکاؤنٹ میں جمع کرا کے رسید جمع کرائیں؛ تب تک آپ کو نئے نقد آرڈر نہیں ملیں گے۔` })
  ),
  'rider.settlement': entry<{ cashHandedIn: number; keptAsPay: number; cashHeld: number }>(
    (p) => {
      const parts = [
        p.cashHandedIn > 0 ? `Rs ${p.cashHandedIn.toLocaleString()} handed in` : null,
        p.keptAsPay > 0 ? `Rs ${p.keptAsPay.toLocaleString()} kept as your pay` : null,
      ].filter(Boolean);
      return { title: 'Settlement recorded', message: `${parts.join(', ')}. You now hold Rs ${p.cashHeld.toLocaleString()} in cash.` };
    },
    (p) => {
      const parts = [
        p.cashHandedIn > 0 ? `Rs ${p.cashHandedIn.toLocaleString()} جمع کرائے` : null,
        p.keptAsPay > 0 ? `Rs ${p.keptAsPay.toLocaleString()} اپنی کمائی کے طور پر رکھے` : null,
      ].filter(Boolean);
      return { title: 'سیٹلمنٹ درج ہو گئی', message: `${parts.join('، ')}۔ اب آپ کے پاس Rs ${p.cashHeld.toLocaleString()} نقد ہیں۔` };
    }
  ),
  'rider.paymentSent': entry<{ amount: string; reference: string | null }>(
    (p) => ({ title: 'Payment sent', message: `Nuray sent you ${p.amount}${p.reference ? ` (reference ${p.reference})` : ''}.` }),
    (p) => ({ title: 'ادائیگی بھیج دی گئی', message: `Nuray نے آپ کو ${p.amount} بھیج دیے ہیں${p.reference ? ` (ریفرنس ${p.reference})` : ''}۔` })
  ),

  'support.reply': entry<{ ticketNumber: string; excerpt: string }>(
    (p) => ({ title: `New reply on ticket ${p.ticketNumber}`, message: p.excerpt }),
    (p) => ({ title: `ٹکٹ ${p.ticketNumber} پر نیا جواب`, message: p.excerpt })
  ),
  'support.resolved': entry<{ ticketNumber: string; excerpt: string }>(
    (p) => ({ title: `Ticket ${p.ticketNumber} resolved`, message: p.excerpt }),
    (p) => ({ title: `ٹکٹ ${p.ticketNumber} حل ہو گیا`, message: p.excerpt })
  ),

  'admin.paymentUnconfirmed': englishOnly<Order & { hours: number }>((p) => ({
    title: `Order #${p.orderNumber}: payment not confirmed`,
    message: `The customer reported a transfer more than ${p.hours} hours ago and the kitchen hasn't confirmed or disputed it.`,
  })),
  'admin.kitchenPaused': englishOnly<{ kitchen: string; owed: string }>((p) => ({
    title: `${p.kitchen} owes Nuray ${p.owed}`,
    message: 'Its cash and direct-transfer orders are paused until it pays or its online orders cover the amount.',
  })),
  'admin.depositSubmitted': englishOnly<{ amount: string }>((p) => ({
    title: 'Rider deposit to check',
    message: `A rider deposited ${p.amount} and sent the receipt. Check it arrived, then approve it.`,
  })),
  'admin.cashOverdue': englishOnly<{ count: number; total: string; hours: number }>((p) => ({
    title: 'Rider cash overdue',
    message: `${p.count} rider${p.count === 1 ? ' has' : 's have'} held customer cash (${p.total} in hand) for more than ${p.hours} hours.`,
  })),
  'admin.booksCheck': englishOnly<{ count: number }>((p) => ({
    title: "Last night's books check found problems",
    message: `${p.count} thing${p.count === 1 ? '' : 's'} in Nuray's books need${p.count === 1 ? 's' : ''} looking at. Open Accounts to see what.`,
  })),
  'admin.moneyDispute': englishOnly<{ ticket: string; subject: string }>((p) => ({
    title: 'A question about money',
    message: `${p.ticket}: ${p.subject}. Money questions are high priority in Support.`,
  })),
  'admin.payoutAccountChanged': englishOnly<{ kitchen: string; hours: number }>((p) => ({
    title: 'A kitchen changed its payout account',
    message: `${p.kitchen} changed where it is paid. Its payouts wait ${p.hours} hours; check with the kitchen if this looks wrong.`,
  })),
  'admin.largePayout': englishOnly<{ kitchen: string; amount: string }>((p) => ({
    title: 'A large payout needs a second admin',
    message: `${p.amount} to ${p.kitchen} must be approved by a second admin before it is sent.`,
  })),
  'admin.payoutNotReceived': englishOnly<{ kitchen: string; amount: string; reference: string }>((p) => ({
    title: 'A kitchen says a payout did not arrive',
    message: `${p.kitchen} has not received ${p.amount} (reference ${p.reference}). Check the transfer with the bank or wallet.`,
  })),
  'admin.dailyPayouts': englishOnly<{ count: number; total: string }>((p) => ({
    title: "Today's kitchen payouts to send",
    message: `${p.count} kitchen payout${p.count === 1 ? '' : 's'} (${p.total}) are waiting to be sent.`,
  })),
  'admin.riderPayDue': englishOnly<{ count: number; total: string }>((p) => ({
    title: "Today's rider pay to send",
    message: `${p.count} rider${p.count === 1 ? ' is' : 's are'} owed ${p.total} after the cash they hold. Pay them from the Riders page.`,
  })),
  'approval.kitchenApplication': englishOnly<{ businessName: string }>((p) => ({ title: 'New kitchen application', message: `${p.businessName} applied to sell on Nuray.` })),
  'approval.categoryRequest': englishOnly<Named>((p) => ({ title: 'New category request', message: `A kitchen asked for the category "${p.name}".` })),
  'approval.newDish': englishOnly<Named>((p) => ({ title: 'New dish to approve', message: `"${p.name}" was added and is waiting for approval.` })),
  'approval.dishChanged': englishOnly<Named>((p) => ({ title: 'A dish was changed and needs review', message: `"${p.name}" was edited by its kitchen.` })),
  'approval.riderApplication': englishOnly<{ city: string }>((p) => ({ title: 'New rider application', message: `A rider (${p.city}) sent their application and documents.` })),
};

export type NotificationKind = keyof typeof CATALOGUE;
type ParamsOf<K extends NotificationKind> = Parameters<(typeof CATALOGUE)[K]['en']>[0];

/** What a notification says, before it is known whose language to say it in. */
export type NotificationText = { [K in NotificationKind]: { kind: K; params: ParamsOf<K> } }[NotificationKind];

export const notificationText = <K extends NotificationKind>(kind: K, params: ParamsOf<K>) => ({ kind, params }) as NotificationText;

export function renderNotification(text: NotificationText, language: NotificationLanguage): NotificationWords {
  const write = CATALOGUE[text.kind][language] as (p: NotificationText['params']) => NotificationWords;
  return write(text.params);
}
