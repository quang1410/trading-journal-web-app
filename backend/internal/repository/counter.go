package repository

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log"
	"time"

	"gorm.io/gorm"
)

// sweepBatch là trần số dòng hết hạn xoá mỗi lần dọn, để một lần ghi không
// bao giờ phải gánh việc dọn cả bảng.
const sweepBatch = 100

// CounterRepo là bộ đếm tần suất dùng chung giữa mọi instance, cửa sổ cố định.
type CounterRepo struct{ db *gorm.DB }

func NewCounterRepo(db *gorm.DB) *CounterRepo { return &CounterRepo{db: db} }

type counterRow struct {
	Hits      int
	ExpiresAt time.Time
}

func hashKey(key string) []byte {
	sum := sha256.Sum256([]byte(key))
	return sum[:]
}

// Hit tính thêm một lượt cho key và trả số lượt trong cửa sổ hiện tại cùng
// thời điểm cửa sổ kết thúc. Cửa sổ đã hết hạn (hoặc chưa có) thì bắt đầu cửa
// sổ mới dài `window` tính từ now.
//
// Một câu upsert duy nhất: Postgres khoá dòng trong ON CONFLICT DO UPDATE, nên
// N instance tăng cùng lúc thấy N con số khác nhau. Đọc rồi mới ghi thì hai
// request cùng thấy "còn lượt".
func (r *CounterRepo) Hit(ctx context.Context, key string, window time.Duration, now time.Time) (int, time.Time, error) {
	const q = `INSERT INTO rate_limit_counters AS c (key_hash, hits, expires_at)
	           VALUES (@key, 1, @expires)
	           ON CONFLICT (key_hash) DO UPDATE SET
	               hits       = CASE WHEN c.expires_at <= @now THEN 1 ELSE c.hits + 1 END,
	               expires_at = CASE WHEN c.expires_at <= @now THEN EXCLUDED.expires_at ELSE c.expires_at END
	           RETURNING hits, expires_at`
	now = now.UTC()
	var row counterRow
	err := r.db.WithContext(ctx).Raw(q, map[string]any{
		"key": hashKey(key), "expires": now.Add(window), "now": now,
	}).Scan(&row).Error
	if err != nil {
		return 0, time.Time{}, fmt.Errorf("hit counter: %w", err)
	}
	// Dọn khi mở cửa sổ mới chứ không phải mỗi lượt: đủ để bảng không phình
	// theo số khoá rác, mà phần lớn lượt đếm vẫn chỉ tốn một câu lệnh. Câu
	// riêng, không chung transaction với upsert, nên không giữ khoá dòng nào
	// của request khác — SKIP LOCKED để hai lần dọn song song không chờ nhau.
	if row.Hits == 1 {
		const sweep = `DELETE FROM rate_limit_counters WHERE key_hash IN (
		                   SELECT key_hash FROM rate_limit_counters
		                   WHERE expires_at <= ? LIMIT ? FOR UPDATE SKIP LOCKED)`
		// Dọn hỏng không được làm hỏng lượt đếm đã ghi xong: chỉ ghi log, lần
		// mở cửa sổ sau dọn tiếp.
		if err := r.db.WithContext(ctx).Exec(sweep, now, sweepBatch).Error; err != nil {
			log.Printf("sweep rate limit counters: %v", err)
		}
	}
	return row.Hits, row.ExpiresAt, nil
}

// Peek đọc số lượt hiện tại mà không tính thêm. Không có hoặc đã hết hạn thì
// trả 0.
func (r *CounterRepo) Peek(ctx context.Context, key string, now time.Time) (int, time.Time, error) {
	const q = `SELECT hits, expires_at FROM rate_limit_counters WHERE key_hash = ? AND expires_at > ?`
	var rows []counterRow
	if err := r.db.WithContext(ctx).Raw(q, hashKey(key), now.UTC()).Scan(&rows).Error; err != nil {
		return 0, time.Time{}, fmt.Errorf("peek counter: %w", err)
	}
	if len(rows) == 0 {
		return 0, time.Time{}, nil
	}
	return rows[0].Hits, rows[0].ExpiresAt, nil
}

// Undo trả lại một lượt trong cửa sổ đang chạy. Không có, đã hết hạn hay đã về
// 0 thì không làm gì.
func (r *CounterRepo) Undo(ctx context.Context, key string, now time.Time) error {
	const q = `UPDATE rate_limit_counters SET hits = hits - 1
	           WHERE key_hash = ? AND expires_at > ? AND hits > 0`
	if err := r.db.WithContext(ctx).Exec(q, hashKey(key), now.UTC()).Error; err != nil {
		return fmt.Errorf("undo counter: %w", err)
	}
	return nil
}

// Delete xoá bộ đếm của key. Không có thì không làm gì.
func (r *CounterRepo) Delete(ctx context.Context, key string) error {
	if err := r.db.WithContext(ctx).Exec(`DELETE FROM rate_limit_counters WHERE key_hash = ?`, hashKey(key)).Error; err != nil {
		return fmt.Errorf("delete counter: %w", err)
	}
	return nil
}
