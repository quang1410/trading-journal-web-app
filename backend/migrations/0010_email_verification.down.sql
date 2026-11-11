DROP TABLE email_tokens;
ALTER TABLE users
    DROP CONSTRAINT users_locale,
    DROP COLUMN email_verified_at,
    DROP COLUMN locale;
