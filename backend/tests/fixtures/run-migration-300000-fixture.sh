#!/bin/bash
# Applies the dirty fixture, then the 300000 migration (twice: must be re-runnable) and asserts the clean-up.
# Usage: DB=<existing db-pushed database> bash tests/fixtures/run-migration-300000-fixture.sh
set -e
P="psql -h /tmp -p 54329 -U postgres -d ${DB:-fx} -q -v ON_ERROR_STOP=1"
cd "$(dirname "$0")/../.."
$P -f tests/fixtures/migration-300000-dirty.sql
$P -f prisma/migrations/20261001300000_indexes_uniques_integrity/migration.sql
$P -f prisma/migrations/20261001300000_indexes_uniques_integrity/migration.sql
q() { psql -h /tmp -p 54329 -U postgres -d ${DB:-fx} -Atc "$1"; }
check() { [ "$(q "$2")" = "$3" ] && echo "PASS $1" || { echo "FAIL $1: got $(q "$2")"; exit 1; }; }
check "one review kept" "select count(*) from reviews" 1
check "duplicates backed up" "select count(*) from reviews_dup_backup" 2
check "product rating recomputed" "select rating_average||'/'||total_reviews from products where id='p1'" "5.00/1"
check "seller rating recomputed" "select rating_average||'/'||total_reviews from sellers where id='s1'" "5.00/1"
check "one usage kept" "select count(*) from promotion_usages" 1
check "affected promo counter fixed" "select used_count from promotions where id='pr1'" 1
check "unrelated promo counter untouched" "select used_count from promotions where id='pr2'" 7
check "negative stock zeroed" "select stock_quantity from products where id='p1'" 0
check "negative wallet zeroed" "select balance from wallets where id='w1'" 0.00
check "negatives recorded" "select count(*) from negative_values_backup" 2
