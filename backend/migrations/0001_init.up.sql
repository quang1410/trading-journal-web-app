CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code            TEXT          NOT NULL,
    name            TEXT          NOT NULL DEFAULT '',
    initial_balance NUMERIC(18, 2) NOT NULL,
    risk_per_trade  NUMERIC(6, 4)  NOT NULL DEFAULT 0.01,
    currency        TEXT          NOT NULL DEFAULT 'USD',
    -- Tên IANA. Quyết định mọi phép gom nhóm theo ngày; đổi giá trị này là
    -- đổi cách gom nhóm của toàn bộ lịch sử lệnh.
    timezone        TEXT          NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (user_id, code)
);

CREATE TABLE trades (
    id               BIGSERIAL PRIMARY KEY,
    account_id       BIGINT         NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    -- Backend cấp; quyết định thứ tự lũy kế. Frontend gửi lên thì bỏ qua.
    stt              INTEGER        NOT NULL,
    -- Lưu UTC. Trường day/week/month/weekday là suy diễn, không có cột.
    entered_at       TIMESTAMPTZ    NOT NULL,
    symbol           TEXT           NOT NULL,
    direction        TEXT           NOT NULL CHECK (direction IN ('Long', 'Short')),
    entry            NUMERIC(18, 5),
    exit             NUMERIC(18, 5),
    volume           NUMERIC(18, 4),
    profit           NUMERIC(18, 2) NOT NULL,
    profit_theory    NUMERIC(18, 2),
    fee              NUMERIC(18, 2) NOT NULL DEFAULT 0,
    setup            TEXT           NOT NULL DEFAULT 'KHÔNG CÓ SETUP',
    timeframe        TEXT           NOT NULL DEFAULT '' CHECK (timeframe IN ('', 'M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W')),
    entry_quality    TEXT           NOT NULL DEFAULT '' CHECK (entry_quality IN ('', 'Đúng kế hoạch', 'Quá sớm', 'Quá muộn', 'Bốc đồng')),
    in_trade_quality TEXT           NOT NULL DEFAULT '' CHECK (in_trade_quality IN ('', 'Tuân thủ kế hoạch', 'Dời Chốt lời', 'Dời dừng lỗ ra xa', 'Muốn thoát lệnh')),
    exit_quality     TEXT           NOT NULL DEFAULT '' CHECK (exit_quality IN ('', 'Chạm Chốt lời', 'Chạm Dừng lỗ', 'Thoát chủ động (lý do kỹ thuật)', 'Thoát lệnh cảm tính, sợ hãi')),
    psychology       TEXT           NOT NULL DEFAULT '' CHECK (psychology IN ('', 'Không lỗi', 'SỢ BỎ LỠ (FOMO)', 'SỢ HÃI', 'HI VỌNG', 'THAM LAM', 'GIAO DỊCH TRẢ THÙ', 'LUÔN MUỐN MÌNH ĐÚNG')),
    notes            TEXT           NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);

CREATE UNIQUE INDEX trades_account_stt_idx ON trades (account_id, stt);
CREATE INDEX trades_account_entered_at_idx ON trades (account_id, entered_at);
CREATE INDEX trades_deleted_at_idx ON trades (deleted_at);

CREATE TABLE cash_flows (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT         NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    date       DATE           NOT NULL,
    amount     NUMERIC(18, 2) NOT NULL CHECK (amount > 0),
    type       TEXT           NOT NULL CHECK (type IN ('deposit', 'withdraw')),
    note       TEXT           NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX cash_flows_account_idx ON cash_flows (account_id, date);
