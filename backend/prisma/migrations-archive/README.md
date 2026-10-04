# Archived migrations

The migration history before `migrations/0_baseline`. Kept for reference only:
Prisma does not read this folder.

These migrations could not build a database by themselves (the first tables were created with
`prisma db push`), so they were replaced by a single baseline built from the complete schema.
Databases that ran some of them are brought under the new history with `npm run db:baseline`
(see `../README.md`).
