-- Bộ đếm tần suất dùng chung giữa mọi instance của API (K-04). Bộ đếm trong
-- bộ nhớ không dùng được trên Vercel: mỗi instance đếm riêng, kẻ tấn công chỉ
-- cần được phân về instance khác là có lượt mới.
--
-- Một dòng là một cửa sổ cố định: `hits` lượt trong cửa sổ kết thúc lúc
-- `expires_at` (UTC). Hết hạn thì lượt kế tiếp ghi đè thành cửa sổ mới.
--
-- key_hash là SHA-256 của khoá đếm (vd "login:attempt:email:<email>"): khoá chứa cả
-- email người lạ gõ vào form, không lưu bản thô.
CREATE TABLE rate_limit_counters (
    key_hash   BYTEA       PRIMARY KEY,
    hits       INTEGER     NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);

-- Cho lệnh dọn dòng hết hạn.
CREATE INDEX rate_limit_counters_expires_at ON rate_limit_counters (expires_at);
