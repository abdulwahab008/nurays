-- N3: push to the store apps. A subscription is now a browser's (web push, as before), an Android phone's (an FCM
-- token) or an iPhone's (an APNs device token), kept in "endpoint". The encryption keys belong to web push only.
-- Existing rows are browsers: they get "web" and keep their keys. Nothing is removed.
ALTER TABLE "push_subscriptions" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'web';
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_platform_check" CHECK ("platform" IN ('web', 'android', 'ios'));
ALTER TABLE "push_subscriptions" ALTER COLUMN "p256dh" DROP NOT NULL;
ALTER TABLE "push_subscriptions" ALTER COLUMN "auth" DROP NOT NULL;
-- A browser's subscription without its keys cannot be sent to.
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_web_keys_check" CHECK ("platform" <> 'web' OR ("p256dh" IS NOT NULL AND "auth" IS NOT NULL));
