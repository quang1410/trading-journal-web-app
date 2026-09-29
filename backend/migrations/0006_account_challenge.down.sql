-- DROP COLUMN kéo theo mọi CHECK có nhắc tới cột đó.
ALTER TABLE accounts
    DROP COLUMN max_drawdown_limit,
    DROP COLUMN profit_target,
    DROP COLUMN challenge_status,
    DROP COLUMN challenge_phase,
    DROP COLUMN prop_firm,
    DROP COLUMN account_type;
