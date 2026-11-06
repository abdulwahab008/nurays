import { defineMessages } from '@/lib/i18n';

/** The role gate (components/RoleGuard.tsx): the loading line and the note shown when a page is for another kind of account. */
export const guardMessages = defineMessages({
  en: {
    loading: 'Loading...',
    forCustomer: 'That page is for customers. Here is your own home.',
    forSeller: 'That page is for kitchens. Here is your own home.',
    forRider: 'That page is for riders. Here is your own home.',
    forAdmin: 'That page is for Nuray staff. Here is your own home.',
    forHub: 'That page is for hub managers. Here is your own home.',
  },
  ur: {
    loading: 'لوڈ ہو رہا ہے...',
    forCustomer: 'یہ صفحہ کسٹمرز کے لیے ہے۔ یہ آپ کا اپنا ہوم ہے۔',
    forSeller: 'یہ صفحہ کچنز کے لیے ہے۔ یہ آپ کا اپنا ہوم ہے۔',
    forRider: 'یہ صفحہ رائیڈرز کے لیے ہے۔ یہ آپ کا اپنا ہوم ہے۔',
    forAdmin: 'یہ صفحہ نورائے کے عملے کے لیے ہے۔ یہ آپ کا اپنا ہوم ہے۔',
    forHub: 'یہ صفحہ ہب مینیجرز کے لیے ہے۔ یہ آپ کا اپنا ہوم ہے۔',
  },
});
