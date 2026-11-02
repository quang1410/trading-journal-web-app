// Package ict phân tích nến NQ (và ES để so SMT) theo phương pháp ICT mà chủ sản phẩm dùng (ghi chú
// video của ReeseTradesNQ: DOL 4 bước, FVG/IFVG, range HR/LR, SMT, OXXC). Kết quả dùng cho tin bias
// trước phiên gửi Telegram và cho lệnh backtest.
//
// Package thuần: không import GORM, net/http, database/sql, context. Mọi giờ tính theo New York
// (America/New_York, có giờ mùa hè), nến lưu theo giây Unix UTC.
//
// Giá là float64: đây là giá chỉ số để so sánh cao/thấp, không phải tiền của sổ nhật ký (quy tắc 1
// nói về tiền). Giá nguồn có tối đa 3 chữ số thập phân nên so sánh float không đổi thứ tự.
package ict

import (
	"sort"
	"time"

	// tzdata: package tự mang múi giờ New York, không phụ thuộc máy chạy có /usr/share/zoneinfo.
	_ "time/tzdata"
)

// NY là múi giờ mọi phiên và mốc chia nến dựa vào.
var NY = mustLoad("America/New_York")

func mustLoad(name string) *time.Location {
	loc, err := time.LoadLocation(name)
	if err != nil {
		panic(err)
	}
	return loc
}

// Bar là một nến; T là giây Unix lúc mở nến.
type Bar struct {
	T          int64
	O, H, L, C float64
}

// Timeframe là một khung nến. Rank là thứ tự ưu tiên khi chọn range (0 = 15m, nhỏ nhất).
type Timeframe struct {
	Name string
	Min  int
	Rank int
}

// Sec là độ dài nến tính bằng giây.
func (tf Timeframe) Sec() int64 { return int64(tf.Min) * 60 }

// Timeframes: tám khung theo đúng thứ tự ưu tiên chủ sản phẩm chốt (range xét từ 15m lên Daily).
var Timeframes = []Timeframe{
	{"15m", 15, 0}, {"30m", 30, 1}, {"1H", 60, 2}, {"2H", 120, 3},
	{"4H", 240, 4}, {"8H", 480, 5}, {"12H", 720, 6}, {"D", 1440, 7},
}

// sessionAnchor: nến mọi khung chia mốc từ 18:00 New York (giờ mở phiên CME), như chart CME của
// TradingView: 4H mở 18:00, 22:00, 02:00…; Daily là ngày CME 18:00 hôm trước → 17:00.
const sessionAnchor = 18 * 60

// Chart giữ nến 1m và nến đã gom của tám khung. Dựng một lần, dùng cho nhiều lần phân tích (backtest
// gọi Analyze hàng trăm lần trên cùng một Chart).
type Chart struct {
	M1   []Bar
	Bars [][]Bar // Bars[r] là nến khung Timeframes[r]
}

// NewChart gom nến 1m (tăng dần theo giờ) thành tám khung.
func NewChart(m1 []Bar) *Chart {
	mods := make([]int, len(m1)) // phút trong ngày theo giờ New York của từng nến
	for i, b := range m1 {
		lt := time.Unix(b.T, 0).In(NY)
		mods[i] = lt.Hour()*60 + lt.Minute()
	}
	c := &Chart{M1: m1}
	for _, tf := range Timeframes {
		c.Bars = append(c.Bars, resample(m1, mods, tf.Min))
	}
	return c
}

func resample(m1 []Bar, mods []int, tf int) []Bar {
	var out []Bar
	for i, b := range m1 {
		off := ((mods[i]-sessionAnchor)%1440 + 1440) % 1440 % tf
		start := b.T - b.T%60 - int64(off)*60
		if n := len(out); n > 0 && out[n-1].T == start {
			last := &out[n-1]
			last.H = max(last.H, b.H)
			last.L = min(last.L, b.L)
			last.C = b.C
			continue
		}
		out = append(out, Bar{T: start, O: b.O, H: b.H, L: b.L, C: b.C})
	}
	return out
}

// closedBy giữ các nến đã đóng trước cutoff (giờ mở + độ dài ≤ cutoff) — không bao giờ nhìn thấy nến
// đang chạy, nên phân tích lúc cutoff không lộ giá tương lai.
func closedBy(bars []Bar, sec int64, cutoff int64) []Bar {
	n := sort.Search(len(bars), func(i int) bool { return bars[i].T+sec > cutoff })
	return bars[:n]
}

// between giữ các nến mở trong [from, to).
func between(bars []Bar, from, to int64) []Bar {
	i := sort.Search(len(bars), func(i int) bool { return bars[i].T >= from })
	j := sort.Search(len(bars), func(i int) bool { return bars[i].T >= to })
	return bars[i:j]
}

func tail(bars []Bar, n int) []Bar {
	if len(bars) > n {
		return bars[len(bars)-n:]
	}
	return bars
}

// nyTime dựng giờ New York của ngày (y, m, d) lúc h:mi.
func nyTime(y int, m time.Month, d, h, mi int) time.Time { return time.Date(y, m, d, h, mi, 0, 0, NY) }
