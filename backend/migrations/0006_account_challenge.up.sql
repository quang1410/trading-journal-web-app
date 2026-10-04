-- Loại tài khoản và vòng thi quỹ. Spec: docs/superpowers/specs/2026-09-29-account-types-design.md §3.
-- Hàng cũ nhận 'personal' qua DEFAULT, bốn cột thử thách để NULL — thoả mọi CHECK dưới đây
-- nên không cần backfill.
ALTER TABLE accounts
    ADD COLUMN account_type       TEXT          NOT NULL DEFAULT 'personal',
    ADD COLUMN prop_firm          TEXT          NOT NULL DEFAULT '',
    ADD COLUMN challenge_phase    TEXT,
    ADD COLUMN challenge_status   TEXT,
    -- Phân số, như risk_per_trade: 0.1 = 10%.
    ADD COLUMN profit_target      NUMERIC(6, 4),
    ADD COLUMN max_drawdown_limit NUMERIC(6, 4);

ALTER TABLE accounts
    ADD CONSTRAINT accounts_type CHECK (account_type IN ('personal', 'prop')),
    ADD CONSTRAINT accounts_challenge_phase CHECK (challenge_phase IN ('phase_1', 'phase_2', 'funded')),
    ADD CONSTRAINT accounts_challenge_status CHECK (challenge_status IN ('in_progress', 'passed', 'failed')),
    -- Tài khoản quỹ PHẢI có vòng và trạng thái; tài khoản cá nhân KHÔNG được mang gì của quỹ.
    ADD CONSTRAINT accounts_challenge_shape CHECK (
        (account_type = 'personal'
            AND challenge_phase IS NULL AND challenge_status IS NULL
            AND profit_target IS NULL AND max_drawdown_limit IS NULL
            AND prop_firm = '')
        OR (account_type = 'prop'
            AND challenge_phase IS NOT NULL AND challenge_status IS NOT NULL)
    ),
    -- Funded là vòng cuối, không có vòng nào phía sau để "qua".
    ADD CONSTRAINT accounts_funded_not_passed CHECK (
        NOT (challenge_phase = 'funded' AND challenge_status = 'passed')
    );
