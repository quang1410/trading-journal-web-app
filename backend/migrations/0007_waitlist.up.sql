CREATE TABLE waitlist_signups (
    id           BIGSERIAL   PRIMARY KEY,
    email        TEXT        NOT NULL,
    locale       TEXT        NOT NULL DEFAULT 'vi',
    source       TEXT        NULL,
    journal_tool TEXT        NULL,
    markets      TEXT        NOT NULL DEFAULT '',
    prop_status  TEXT        NULL,
    answered_at  TIMESTAMPTZ NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_locale       CHECK (locale IN ('vi', 'en')),
    CONSTRAINT waitlist_email_len    CHECK (char_length(email) <= 254),
    CONSTRAINT waitlist_source_len   CHECK (char_length(source) <= 64),
    CONSTRAINT waitlist_journal_tool CHECK (journal_tool IN ('spreadsheet', 'notion', 'other_app', 'none')),
    CONSTRAINT waitlist_prop_status  CHECK (prop_status IN ('active', 'past', 'never'))
);

-- email được lưu ĐÃ chuẩn hoá (trim + lowercase, domain.NormalizeEmail), nên
-- index thường là đủ, không cần lower(email). Ràng buộc này là thứ thực thi
-- "mỗi email một dòng" và là đích của ON CONFLICT: kiểm trong code thay nó sẽ
-- bị hai request song song đi qua mặt.
CREATE UNIQUE INDEX waitlist_signups_email ON waitlist_signups (email);
