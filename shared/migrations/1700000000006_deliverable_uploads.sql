-- Up Migration

ALTER TABLE deliverables
  ADD COLUMN files          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN external_links jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN deliverables.files IS
  'Array of { key, name, contentType, sizeBytes, sha256, finalUrl }. Each file lives in platform-owned R2/S3. The sha256 is verified server-side at submit time so any later read can prove the bytes were not swapped.';
COMMENT ON COLUMN deliverables.external_links IS
  'Array of { url, label? } for off-platform references (live demos, GitHub PRs, Loom recordings). Advisory only — not hash-bound. The judge sees them as context in the prompt but does not fetch them.';

-- Down Migration

ALTER TABLE deliverables
  DROP COLUMN IF EXISTS external_links,
  DROP COLUMN IF EXISTS files;
