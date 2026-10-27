-- Nến 1m CME (NQ, ES) kéo từ TradingView cho trang /replay. Không đăng nhập thì TradingView chỉ trả
-- khoảng một tuần gần nhất, nên cron mỗi tuần ghi vào đây thì lịch sử dài dần và mọi máy dùng chung.
--
-- Giá giữ NUMERIC đúng chuỗi số TradingView gửi (không qua float). Đây không phải tiền của sổ nhật
-- ký, nhưng NUMERIC giữ nguyên chữ số nên đọc ra y hệt lúc ghi.
CREATE TABLE replay_bars (
    symbol TEXT        NOT NULL,
    t      TIMESTAMPTZ NOT NULL, -- giờ mở nến, UTC
    o      NUMERIC     NOT NULL,
    h      NUMERIC     NOT NULL,
    l      NUMERIC     NOT NULL,
    c      NUMERIC     NOT NULL,
    v      NUMERIC     NOT NULL DEFAULT 0,
    -- khoá chính cũng là đích của ON CONFLICT: cron chạy lại hay nút Cập nhật ghi trùng phút thì
    -- ghi đè, không ra hai dòng
    PRIMARY KEY (symbol, t),
    CONSTRAINT replay_bars_symbol_len CHECK (char_length(symbol) BETWEEN 1 AND 16)
);
