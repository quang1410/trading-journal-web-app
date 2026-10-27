package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"journal/internal/domain"
)

// ReplayBarRepo lưu nến 1m CME của trang /replay (bảng replay_bars).
type ReplayBarRepo struct{ db *gorm.DB }

func NewReplayBarRepo(db *gorm.DB) *ReplayBarRepo { return &ReplayBarRepo{db: db} }

// Upsert ghi các nến của một mã trong MỘT câu lệnh. Phút đã có thì lấy bản mới: lần kéo sau của
// TradingView là bản đã chốt của phút đó. Giá đi dạng chuỗi rồi ép NUMERIC trong Postgres, không
// qua float.
func (r *ReplayBarRepo) Upsert(ctx context.Context, symbol string, b domain.MinuteBars) error {
	if b.Len() == 0 {
		return nil
	}
	if err := b.Validate(); err != nil {
		return fmt.Errorf("upsert replay bars %s: %w", symbol, err)
	}
	const q = `INSERT INTO replay_bars (symbol, t, o, h, l, c, v)
	           SELECT ?, to_timestamp(x.t), x.o, x.h, x.l, x.c, x.v
	           FROM unnest(?::bigint[], ?::numeric[], ?::numeric[], ?::numeric[], ?::numeric[], ?::numeric[])
	                AS x(t, o, h, l, c, v)
	           ON CONFLICT (symbol, t) DO UPDATE
	           SET o = excluded.o, h = excluded.h, l = excluded.l, c = excluded.c, v = excluded.v`
	times := make([]string, b.Len())
	for i, t := range b.T {
		times[i] = strconv.FormatInt(t, 10)
	}
	err := r.db.WithContext(ctx).Exec(q, symbol, pgArrayLiteral(times),
		pgNumericArray(b.O), pgNumericArray(b.H), pgNumericArray(b.L), pgNumericArray(b.C), pgNumericArray(b.V)).Error
	if err != nil {
		return fmt.Errorf("upsert replay bars %s: %w", symbol, translate(err))
	}
	return nil
}

// After trả tối đa limit nến của symbol mở SAU giây Unix after, tăng dần theo giờ; more = còn nến
// sau trang này. Người gọi lấy trang kế bằng after = giờ của nến cuối.
func (r *ReplayBarRepo) After(ctx context.Context, symbol string, after int64, limit int) (domain.MinuteBars, bool, error) {
	var rows []struct {
		T             int64
		O, H, L, C, V string
	}
	const q = `SELECT extract(epoch FROM t)::bigint AS t, o::text AS o, h::text AS h, l::text AS l, c::text AS c, v::text AS v
	           FROM replay_bars
	           WHERE symbol = ? AND t > to_timestamp(?)
	           ORDER BY t
	           LIMIT ?`
	if err := r.db.WithContext(ctx).Raw(q, symbol, after, limit+1).Scan(&rows).Error; err != nil {
		return domain.MinuteBars{}, false, fmt.Errorf("read replay bars %s: %w", symbol, translate(err))
	}
	more := len(rows) > limit
	if more {
		rows = rows[:limit]
	}
	var b domain.MinuteBars
	for _, row := range rows {
		b.Append(row.T, json.Number(row.O), json.Number(row.H), json.Number(row.L), json.Number(row.C), json.Number(row.V))
	}
	return b, more, nil
}

// pgArrayLiteral viết mảng Postgres dạng chuỗi "{a,b,c}". GORM bung slice thành danh sách
// "(a, b, c)" chứ không thành mảng, nên mảng đi dạng chuỗi rồi ép kiểu trong câu lệnh. Phần tử là
// số (json.Number do decoder kiểm, hoặc số nguyên), không có dấu phẩy hay ngoặc nên không cần escape.
func pgArrayLiteral(items []string) string { return "{" + strings.Join(items, ",") + "}" }

func pgNumericArray(ns []json.Number) string {
	out := make([]string, len(ns))
	for i, n := range ns {
		out[i] = n.String()
	}
	return pgArrayLiteral(out)
}
