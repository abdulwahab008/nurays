-- Each run of the books check (nightly, or from the Accounts screen) and the problems it found.
CREATE TABLE "books_checks" (
    "id" TEXT NOT NULL,
    "ran_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" TEXT NOT NULL,
    "issues" JSONB NOT NULL,

    CONSTRAINT "books_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "books_checks_trigger" CHECK ("trigger" IN ('nightly', 'manual'))
);

CREATE INDEX "books_checks_ran_at_idx" ON "books_checks"("ran_at");
