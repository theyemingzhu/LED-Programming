ALTER TABLE account_sign_in_emails ADD COLUMN mandala_subject TEXT;
CREATE UNIQUE INDEX account_sign_in_emails_mandala_subject_idx
  ON account_sign_in_emails (mandala_subject) WHERE mandala_subject IS NOT NULL;
