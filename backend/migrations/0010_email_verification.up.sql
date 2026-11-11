-- K-56: hạ tầng email + xác minh email.
--
-- locale: ngôn ngữ của thư hệ thống gửi cho user. Lưu lúc đăng ký.
-- email_verified_at: NULL = chưa chứng minh sở hữu email. User đã có TRƯỚC
-- migration này được coi là đã xác minh (chính chủ dự án), nên không bị chặn
-- sau thời gian ân hạn.
ALTER TABLE users
    ADD COLUMN locale            TEXT        NOT NULL DEFAULT 'vi',
    ADD COLUMN email_verified_at TIMESTAMPTZ NULL,
    ADD CONSTRAINT users_locale CHECK (locale IN ('vi', 'en'));

UPDATE users SET email_verified_at = created_at;

-- Token một lần gửi qua email. Dùng chung cho xác minh email ('verify') và
-- đặt lại mật khẩu ('reset', R-3). Chỉ lưu SHA-256 hex của token thô, giống
-- refresh_tokens: đọc trộm bảng này cũng không dùng được link nào.
CREATE TABLE email_tokens (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose    TEXT        NOT NULL,
    token_hash TEXT        NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT email_tokens_purpose CHECK (purpose IN ('verify', 'reset'))
);

CREATE INDEX email_tokens_user_idx ON email_tokens (user_id);
