CREATE TABLE journal_notes (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT      NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    period     TEXT        NOT NULL,
    period_key TEXT        NOT NULL,
    body_html  TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT journal_notes_period CHECK (period IN ('day', 'week'))
);

-- Ràng buộc này là thứ THỰC THI quy tắc một-ghi-chú-mỗi-kỳ, và cũng là đích
-- của ON CONFLICT trong lệnh upsert. Kiểm trong code thay cho nó sẽ bị hai
-- request song song đi qua mặt.
CREATE UNIQUE INDEX journal_notes_key
    ON journal_notes (account_id, period, period_key);
