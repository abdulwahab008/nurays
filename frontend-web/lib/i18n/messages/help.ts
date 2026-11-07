import { defineMessages } from '..';

/** The help page (/help) and the questions on the support page (/support): one set of answers for both. */
export const helpMessages = defineMessages({
  en: {
    title: 'Help and contact',
    updated: '10 October 2026',
    talkToUs: 'Talk to us',
    email: 'Email:',
    aboutOrder: 'About an order:',
    aboutOrderSignedIn:
      'open {orders} and choose the order. You can chat with the kitchen there, and an order that shows as delivered but never reached you can be reported from the same page: it goes to support with the order attached.',
    aboutOrderSignedOut:
      'sign in, open {orders} and choose the order. You can chat with the kitchen there, and an order that shows as delivered but never reached you can be reported from the same page: it goes to support with the order attached.',
    otherQuestions: 'Other questions:',
    otherSignedIn: 'open a ticket on the {support} and follow the replies there.',
    otherSignedOut: 'sign in and open a ticket on the {support}, then follow the replies there.',
    myOrders: 'My orders',
    supportPage: 'support page',
    refundPolicy: 'refund and cancellation policy',
    forgotPassword: 'Forgot password',
    deleteAccountPage: 'delete account page',
    privacyPolicy: 'privacy policy',
    registerKitchen: 'Register your kitchen',
    riderAccount: 'Create a rider account',
    lastUpdated: 'Last updated:',
    footerTerms: 'Terms of service',
    footerPrivacy: 'Privacy policy',
    footerRefund: 'Refund and cancellation policy',
    footerHelp: 'Help and contact',

    'cat.ordering': 'Ordering',
    'cat.delivery': 'Delivery',
    'cat.payment': 'Payment',
    'cat.refunds': 'Cancellations and refunds',
    'cat.account': 'Your account',
    'cat.join': 'Cooking or riding with Nuray',

    'howToOrder.q': 'How do I order?',
    'howToOrder.a':
      'Choose a kitchen near you, add dishes to your tray, pick delivery or pickup and pay. An order is from one kitchen. Prices, the delivery fee and tax are shown before you confirm.',
    'fewKitchens.q': 'Why do I only see some kitchens, or none?',
    'fewKitchens.a':
      'Kitchens deliver within the areas they serve. Save your address with its pin on the map so Nuray can match it to your area and show the kitchens that can deliver to you.',
    'notAccepted.q': 'The kitchen has not accepted my order. What happens?',
    'notAccepted.a': 'If the kitchen does not accept an order in time it is cancelled automatically and anything you paid is refunded.',

    'follow.q': 'How do I follow my order?',
    'follow.a': 'Open {orders} and choose the order. It shows each step, and once the rider has the food, where they are on the map.',
    'code.q': 'What is the 4-digit code on my order?',
    'code.a':
      'Each order has a handover code that only you can see on the order page. Give it to whoever hands you the order (the rider, the kitchen or the pickup counter) only after you have received it; it confirms the delivery. Never read it out before the food is in your hands.',
    'late.q': 'My order is late, or the rider cannot find me.',
    'late.a':
      "Check the order page for its status and the rider's position. If it still looks wrong, chat with the kitchen from the order page or write to support, and we will sort it out with the kitchen and the rider. A clear landmark and house number on your saved address, and a note for the rider, help a great deal.",

    'payWays.q': 'How can I pay?',
    'payWays.a':
      'Cash on delivery, paid to whoever hands over the order. Online payment (card or mobile wallet) when it is available, and your Nuray wallet balance. Or a transfer to the kitchen (JazzCash, EasyPaisa or bank): pay the account shown on your order and upload the receipt. Only ever pay the account shown on the order page.',
    'noOnline.q': 'Online payment is not offered at checkout.',
    'noOnline.a': 'It is switched off for the moment. Pay with cash on delivery, your wallet, or a transfer to the kitchen instead.',
    'unpaid.q': 'I paid but my order still says unpaid.',
    'unpaid.a':
      'Online payments can take a short while to show; the order page updates by itself. For a transfer, the kitchen must confirm the receipt first. If it has been more than an hour, write to support.',

    'cancel.q': 'Can I cancel an order?',
    'cancel.a':
      'Yes, from the order page, until the kitchen accepts it. After that the food is being prepared; chat with the kitchen from the order page or write to support if something is wrong.',
    'refund.q': 'How and when do I get a refund?',
    'refund.a':
      'Wallet payments are refunded to your wallet straight away. Online and transfer payments are refunded by transfer, normally within 3 to 7 working days. The full rules are in the {refundPolicy}.',

    'noCode.q': 'I did not get my verification code or email.',
    'noCode.a':
      'Check your spam folder, wait a minute and ask for a new code from the sign-in page. Codes can only be requested a few times an hour. If nothing arrives, write to us from the address or number on the account.',
    'password.q': 'I forgot my password.',
    'password.a': 'Use {forgotPassword} on the sign-in page; we send a link to the email address on the account.',
    'deleteAccount.q': 'How do I delete my account?',
    'deleteAccount.a':
      'From your profile, in the app, at any time. The steps, and what is deleted and what is kept, are on the {deleteAccountPage}. Your data is described in the {privacyPolicy}.',

    'sell.q': 'How do I sell my food on Nuray?',
    'sell.a': '{registerKitchen}. Nuray checks every kitchen before it can sell, and you can start taking orders once you are approved.',
    'ride.q': 'How do I deliver with Nuray?',
    'ride.a': '{riderAccount} and send your details and documents. Riders are approved by Nuray before they can take jobs.',
  },
  ur: {
    title: 'مدد اور رابطہ',
    updated: '10 اکتوبر 2026',
    talkToUs: 'ہم سے بات کریں',
    email: 'ای میل:',
    aboutOrder: 'کسی آرڈر کے بارے میں:',
    aboutOrderSignedIn:
      '{orders} کھولیں اور آرڈر چنیں۔ وہاں آپ کچن سے بات کر سکتے ہیں، اور جو آرڈر ڈیلیور شدہ دکھائے مگر آپ تک نہ پہنچا ہو اس کی شکایت بھی اسی صفحے سے ہو سکتی ہے: وہ آرڈر سمیت سپورٹ کو جاتی ہے۔',
    aboutOrderSignedOut:
      'سائن اِن کریں، {orders} کھولیں اور آرڈر چنیں۔ وہاں آپ کچن سے بات کر سکتے ہیں، اور جو آرڈر ڈیلیور شدہ دکھائے مگر آپ تک نہ پہنچا ہو اس کی شکایت بھی اسی صفحے سے ہو سکتی ہے: وہ آرڈر سمیت سپورٹ کو جاتی ہے۔',
    otherQuestions: 'دوسرے سوالات:',
    otherSignedIn: '{support} پر ٹکٹ کھولیں اور جواب وہیں دیکھیں۔',
    otherSignedOut: 'سائن اِن کر کے {support} پر ٹکٹ کھولیں اور جواب وہیں دیکھیں۔',
    myOrders: 'میرے آرڈرز',
    supportPage: 'سپورٹ صفحہ',
    refundPolicy: 'ری فنڈ اور منسوخی کی پالیسی',
    forgotPassword: 'پاس ورڈ بھول گئے',
    deleteAccountPage: 'اکاؤنٹ ختم کرنے کا صفحہ',
    privacyPolicy: 'پرائیویسی پالیسی',
    registerKitchen: 'اپنا کچن رجسٹر کریں',
    riderAccount: 'رائیڈر اکاؤنٹ بنائیں',
    lastUpdated: 'آخری تبدیلی:',
    footerTerms: 'شرائط و ضوابط',
    footerPrivacy: 'رازداری کی پالیسی',
    footerRefund: 'رقم کی واپسی اور منسوخی کی پالیسی',
    footerHelp: 'مدد اور رابطہ',

    'cat.ordering': 'آرڈر کرنا',
    'cat.delivery': 'ڈیلیوری',
    'cat.payment': 'ادائیگی',
    'cat.refunds': 'منسوخی اور ری فنڈ',
    'cat.account': 'آپ کا اکاؤنٹ',
    'cat.join': 'نورے کے ساتھ کھانا پکانا یا ڈیلیوری',

    'howToOrder.q': 'میں آرڈر کیسے کروں؟',
    'howToOrder.a':
      'اپنے قریب کا کوئی کچن چنیں، ڈشز ٹرے میں ڈالیں، ڈیلیوری یا پِک اپ چنیں اور ادائیگی کریں۔ ایک آرڈر ایک ہی کچن سے ہوتا ہے۔ قیمتیں، ڈیلیوری فیس اور ٹیکس تصدیق سے پہلے دکھائے جاتے ہیں۔',
    'fewKitchens.q': 'مجھے صرف کچھ کچن کیوں نظر آتے ہیں، یا کوئی نہیں؟',
    'fewKitchens.a':
      'کچن اپنے علاقوں میں ہی ڈیلیوری کرتے ہیں۔ اپنا پتہ نقشے پر پِن کے ساتھ محفوظ کریں تاکہ نورے اسے آپ کے علاقے سے ملا کر وہ کچن دکھا سکے جو آپ تک ڈیلیوری کرتے ہیں۔',
    'notAccepted.q': 'کچن نے میرا آرڈر قبول نہیں کیا۔ اب کیا ہوگا؟',
    'notAccepted.a': 'اگر کچن وقت پر آرڈر قبول نہ کرے تو وہ خود بخود منسوخ ہو جاتا ہے اور آپ کی ادا کی ہوئی رقم واپس کر دی جاتی ہے۔',

    'follow.q': 'میں اپنا آرڈر کیسے دیکھوں؟',
    'follow.a': '{orders} کھولیں اور آرڈر چنیں۔ اس میں ہر مرحلہ دکھتا ہے، اور جب کھانا رائیڈر کے پاس ہو تو نقشے پر اس کی جگہ بھی۔',
    'code.q': 'میرے آرڈر پر 4 ہندسوں کا کوڈ کیا ہے؟',
    'code.a':
      'ہر آرڈر کا ایک حوالگی کوڈ ہوتا ہے جو صرف آپ آرڈر کے صفحے پر دیکھ سکتے ہیں۔ یہ کوڈ آرڈر دینے والے (رائیڈر، کچن یا پِک اپ کاؤنٹر) کو صرف آرڈر ملنے کے بعد بتائیں؛ اسی سے ڈیلیوری کی تصدیق ہوتی ہے۔ کھانا ہاتھ میں آنے سے پہلے کبھی نہ بتائیں۔',
    'late.q': 'میرا آرڈر لیٹ ہے، یا رائیڈر مجھے ڈھونڈ نہیں پا رہا۔',
    'late.a':
      'آرڈر کے صفحے پر اس کا اسٹیٹس اور رائیڈر کی جگہ دیکھیں۔ اگر پھر بھی کچھ غلط لگے تو آرڈر کے صفحے سے کچن سے بات کریں یا سپورٹ کو لکھیں، ہم کچن اور رائیڈر کے ساتھ مل کر معاملہ حل کریں گے۔ محفوظ پتے پر واضح نشانی اور مکان نمبر، اور رائیڈر کے لیے نوٹ بہت مدد کرتے ہیں۔',

    'payWays.q': 'میں ادائیگی کیسے کر سکتا ہوں؟',
    'payWays.a':
      'کیش آن ڈیلیوری، آرڈر دینے والے کو۔ آن لائن ادائیگی (کارڈ یا موبائل والٹ) جب دستیاب ہو، اور آپ کے نورے والٹ کا بیلنس۔ یا کچن کو ٹرانسفر (جاز کیش، ایزی پیسہ یا بینک): آرڈر پر دکھائے گئے اکاؤنٹ میں رقم بھیجیں اور رسید اپ لوڈ کریں۔ ہمیشہ صرف وہی اکاؤنٹ استعمال کریں جو آرڈر کے صفحے پر دکھایا گیا ہو۔',
    'noOnline.q': 'چیک آؤٹ پر آن لائن ادائیگی نہیں مل رہی۔',
    'noOnline.a': 'یہ فی الحال بند ہے۔ اس کے بجائے کیش آن ڈیلیوری، اپنے والٹ، یا کچن کو ٹرانسفر سے ادائیگی کریں۔',
    'unpaid.q': 'میں نے ادائیگی کر دی مگر آرڈر ابھی بھی غیر ادا شدہ دکھا رہا ہے۔',
    'unpaid.a':
      'آن لائن ادائیگی دکھنے میں تھوڑا وقت لگ سکتا ہے؛ آرڈر کا صفحہ خود اپ ڈیٹ ہو جاتا ہے۔ ٹرانسفر میں پہلے کچن کو رسید کی تصدیق کرنی ہوتی ہے۔ اگر ایک گھنٹے سے زیادہ ہو گیا ہو تو سپورٹ کو لکھیں۔',

    'cancel.q': 'کیا میں آرڈر منسوخ کر سکتا ہوں؟',
    'cancel.a':
      'جی ہاں، آرڈر کے صفحے سے، جب تک کچن اسے قبول نہ کرے۔ اس کے بعد کھانا تیار ہو رہا ہوتا ہے؛ کچھ غلط ہو تو آرڈر کے صفحے سے کچن سے بات کریں یا سپورٹ کو لکھیں۔',
    'refund.q': 'ری فنڈ کیسے اور کب ملتا ہے؟',
    'refund.a':
      'والٹ سے کی گئی ادائیگی فوراً والٹ میں واپس آ جاتی ہے۔ آن لائن اور ٹرانسفر کی ادائیگی ٹرانسفر سے واپس ہوتی ہے، عام طور پر 3 سے 7 کاروباری دنوں میں۔ پورے اصول {refundPolicy} میں ہیں۔',

    'noCode.q': 'مجھے تصدیقی کوڈ یا ای میل نہیں ملی۔',
    'noCode.a':
      'اپنا اسپیم فولڈر دیکھیں، ایک منٹ رکیں اور سائن اِن صفحے سے نیا کوڈ مانگیں۔ ایک گھنٹے میں چند بار ہی کوڈ مانگا جا سکتا ہے۔ اگر پھر بھی کچھ نہ آئے تو اکاؤنٹ والے پتے یا نمبر سے ہمیں لکھیں۔',
    'password.q': 'میں اپنا پاس ورڈ بھول گیا۔',
    'password.a': 'سائن اِن صفحے پر {forgotPassword} استعمال کریں؛ ہم اکاؤنٹ والی ای میل پر ایک لنک بھیجتے ہیں۔',
    'deleteAccount.q': 'میں اپنا اکاؤنٹ کیسے ختم کروں؟',
    'deleteAccount.a':
      'ایپ میں اپنی پروفائل سے، کسی بھی وقت۔ طریقہ، اور کیا ختم ہوتا ہے اور کیا رکھا جاتا ہے، {deleteAccountPage} پر ہے۔ آپ کے ڈیٹا کی تفصیل {privacyPolicy} میں ہے۔',

    'sell.q': 'میں نورے پر اپنا کھانا کیسے بیچوں؟',
    'sell.a': '{registerKitchen}۔ نورے ہر کچن کو بیچنے سے پہلے جانچتا ہے، اور منظوری کے بعد آپ آرڈر لینا شروع کر سکتے ہیں۔',
    'ride.q': 'میں نورے کے ساتھ ڈیلیوری کیسے کروں؟',
    'ride.a': '{riderAccount} اور اپنی تفصیلات اور دستاویزات بھیجیں۔ رائیڈرز کو جاب لینے سے پہلے نورے منظور کرتا ہے۔',
  },
});
