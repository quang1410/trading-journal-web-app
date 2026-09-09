CREATE TABLE note_templates (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    body_html  TEXT        NOT NULL,
    position   INT         NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trùng tên là lỗi người dùng cần THẤY, không phải hai mẫu giống nhau nằm im
-- cạnh nhau. lower() để "Setup A" và "setup a" là một.
CREATE UNIQUE INDEX note_templates_user_name ON note_templates (user_id, lower(name));

-- Danh sách luôn đọc theo đúng thứ tự này.
CREATE INDEX note_templates_user_pos ON note_templates (user_id, position, id);
