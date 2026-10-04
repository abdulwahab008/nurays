# Contributing

Start with [README.md](README.md) (how to run the app) and [docs/DEVELOPER_ONBOARDING.md](docs/DEVELOPER_ONBOARDING.md).
The conventions (layers, money, i18n, real-time events) are in [.github/copilot-instructions.md](.github/copilot-instructions.md);
they apply to people as much as to AI tools.

## Making a change

1. Branch from `main` (`feature/…`, `fix/…`, `docs/…`).
2. Keep a change focused. Add or update tests for rules and money logic.
3. Database changes need a new migration; never edit one that has been applied (see `backend/prisma/README.md`).
4. Every user-facing string goes in `frontend-web/lib/i18n/messages/` in English and Urdu.
5. Before opening a pull request:

   ```bash
   cd backend && npx tsc --noEmit && npm test
   cd ../frontend-web && npx tsc --noEmit
   ```

6. Open a pull request using the template. CI runs type checks, builds, the end-to-end tests and a Docker build.

Update the docs in `docs/` when behaviour changes; they are written from the code and should stay that way.
