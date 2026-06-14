-- Enable trigram matching for fuzzy / typo-tolerant product search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram indexes power similarity() and ILIKE '%...%' on product names.
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_name_urdu_trgm_idx
  ON products USING gin (name_urdu gin_trgm_ops);

-- The public catalog always filters on these two columns.
CREATE INDEX IF NOT EXISTS products_active_approved_idx
  ON products (is_active, approval_status);
