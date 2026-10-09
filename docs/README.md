# Nuray documentation

Start with the [main README](../README.md): what Nuray does, how to run it, configuration and testing.

| Document | For | What's in it |
|---|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Developers | Components, request lifecycle, data model, jobs, real-time, scaling |
| [SYSTEM_FLOWS_AND_PROCESSES.md](SYSTEM_FLOWS_AND_PROCESSES.md) | Everyone | How each flow works step by step: sign-up, listing, ordering, payment, delivery, refunds, payouts |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Owners, operators | Every rule with its number: totals and GST, commission, delivery prices, rider pay and cash, timeouts, ranking |
| [PRODUCTION_READINESS_AUDIT.md](PRODUCTION_READINESS_AUDIT.md) | Owners, developers, operators | Launch audit: findings with status, security and performance reports, rider navigation fix, store launch plan, pre-launch checklist and recommendation |
| [OPERATIONS_AND_LOGGING.md](OPERATIONS_AND_LOGGING.md) | DevOps, security | What is logged, what to keep and for how long, alerts, backups and infrastructure checklist |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Admins | Every admin screen: what it's for and what each action does |
| [HUB_OPERATIONS_MANUAL.md](HUB_OPERATIONS_MANUAL.md) | Hub managers | Running a hub from the hub console |
| [API_DOCUMENTATION.md](API_DOCUMENTATION.md) | Developers | Every API route: who can call it, what it takes and returns |
| [REALTIME_ORDER_MANAGEMENT.md](REALTIME_ORDER_MANAGEMENT.md) | Developers | Socket.IO events and how the app uses them |
| [PAYMENT_GATEWAY_INTEGRATION.md](PAYMENT_GATEWAY_INTEGRATION.md) | Developers, operators | Payment methods, Safepay setup, adding a gateway |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Operators | Running Nuray in production, configuration, go-live checklist |
| [SECURITY_AND_COMPLIANCE.md](SECURITY_AND_COMPLIANCE.md) | Developers, operators | Security controls in place and known limitations |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Developers | Test layers, what they cover, how to run them |
| [E2E_TESTING_GUIDE.md](E2E_TESTING_GUIDE.md) | QA | Manual click-through checklist for every role |
| [ACCOUNT_CREDENTIALS.md](ACCOUNT_CREDENTIALS.md) | Everyone | How each account type is created and approved; seeded test accounts |
| [DEVELOPER_ONBOARDING.md](DEVELOPER_ONBOARDING.md) | New developers | Local setup, conventions, how to add things |
| [GOOGLE_OAUTH_SETUP.md](GOOGLE_OAUTH_SETUP.md) | Operators | Setting up Google sign-in |
| [DATABASE_SCHEMA.sql](DATABASE_SCHEMA.sql) | Developers | The full schema as SQL, generated from `backend/prisma/schema.prisma` |

Also: [`backend/prisma/README.md`](../backend/prisma/README.md) (migrations), [`backend/README.md`](../backend/README.md),
[`frontend-web/README.md`](../frontend-web/README.md).

Older planning documents, reviews and change logs are in [`archive/`](archive/); they don't describe the current system.
