// Package tvfeed kéo nến 1 phút CME thật (NQ, ES) qua websocket chart của TradingView, cho nút
// "Cập nhật" của trang /replay.
//
// Trình duyệt không tự kéo được: TradingView chỉ nhận kết nối có header Origin là tradingview.com
// hoặc localhost, mà trình duyệt tự đặt Origin theo tên miền của app và không cho JavaScript đổi.
// Server thì đặt được Origin tuỳ ý, nên server kéo hộ.
//
// Đây là endpoint không chính thức (TradingView không có API công khai): họ đổi giao thức hay chặn
// IP của server là hỏng. Không đăng nhập thì chỉ được khoảng một tuần nến 1m gần nhất. Cùng giao
// thức với scripts/replay-data/tradingview.mjs (script giữ lịch sử dài, đóng gói vào git).
package tvfeed

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"
)

// DefaultURL là websocket chart của TradingView.
const DefaultURL = "wss://data.tradingview.com/socket.io/websocket?type=chart"

// origin được TradingView chấp nhận; Origin khác (tên miền của app) bị từ chối ngay lúc bắt tay.
const origin = "https://www.tradingview.com"

// Tickers: tên mã trong app → mã TradingView (hợp đồng liên tục, phiên Globex đầy đủ). Chỉ các mã
// này được kéo, để endpoint không thành proxy kéo mã tuỳ ý.
var Tickers = map[string]string{
	"NQ": "CME_MINI:NQ1!",
	"ES": "CME_MINI:ES1!",
}

// Bars là nến 1m tăng dần theo giờ, theo cột. T là giây Unix lúc mở nến. Giá và volume giữ nguyên
// chuỗi số TradingView gửi (json.Number) — không đi qua float64 nên không lệch chữ số nào.
type Bars struct {
	T []int64       `json:"t"`
	O []json.Number `json:"o"`
	H []json.Number `json:"h"`
	L []json.Number `json:"l"`
	C []json.Number `json:"c"`
	V []json.Number `json:"v"`
}

// Client kéo nến; giá trị rỗng dùng được (DefaultURL, giờ thật).
type Client struct {
	URL string
	Now func() time.Time
}

// khung tin socket.io cũ: "~m~<độ dài>~m~<nội dung>", một tin websocket có thể chứa nhiều khung
var frameSep = regexp.MustCompile(`~m~\d+~m~`)

func frame(s string) string { return fmt.Sprintf("~m~%d~m~%s", len(s), s) }

type message struct {
	M string            `json:"m"`
	P []json.RawMessage `json:"p"`
}

type seriesUpdate struct {
	S struct {
		S []struct {
			V []json.Number `json:"v"`
		} `json:"s"`
	} `json:"s"`
}

// Fetch trả mọi nến 1m TradingView chịu trả cho ticker, đã bỏ nến của phút đang chạy (chưa đóng).
// Hạn chót lấy từ ctx.
func (c Client) Fetch(ctx context.Context, ticker string) (Bars, error) {
	url := c.URL
	if url == "" {
		url = DefaultURL
	}
	now := c.Now
	if now == nil {
		now = time.Now
	}
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{
		HTTPHeader: http.Header{"Origin": {origin}, "User-Agent": {"Mozilla/5.0"}},
	})
	if err != nil {
		return Bars{}, fmt.Errorf("dial tradingview: %w", err)
	}
	defer conn.CloseNow()
	// một đợt 5000 nến dài vài trăm KB, vượt xa giới hạn 32 KB mặc định
	conn.SetReadLimit(64 << 20)

	write := func(s string) error { return conn.Write(ctx, websocket.MessageText, []byte(s)) }
	send := func(m string, p ...any) error {
		b, err := json.Marshal(map[string]any{"m": m, "p": p})
		if err != nil {
			return err
		}
		return write(frame(string(b)))
	}
	sym, _ := json.Marshal(map[string]string{"symbol": ticker, "adjustment": "splits", "session": "extended"})
	for _, m := range [][]any{
		{"set_auth_token", "unauthorized_user_token"},
		{"chart_create_session", "cs", ""},
		{"resolve_symbol", "cs", "sym", "=" + string(sym)},
		{"create_series", "cs", "s", "s1", "sym", "1", 5000, ""},
	} {
		if err := send(m[0].(string), m[1:]...); err != nil {
			return Bars{}, fmt.Errorf("send %s: %w", m[0], err)
		}
	}

	rows := map[int64][]json.Number{}
	lastSize := -1
	for {
		// Read trả trọn một tin websocket, và TradingView luôn gửi khung "~m~" trọn vẹn trong một tin,
		// nên không cần ghép khung qua nhiều lần đọc.
		_, data, err := conn.Read(ctx)
		if err != nil {
			return Bars{}, fmt.Errorf("read tradingview: %w", err)
		}
		for _, part := range frameSep.Split(string(data), -1) {
			if part == "" {
				continue
			}
			// nhịp tim: gửi trả nguyên văn, không thì server cắt kết nối
			if strings.HasPrefix(part, "~h~") {
				if err := write(frame(part)); err != nil {
					return Bars{}, fmt.Errorf("heartbeat: %w", err)
				}
				continue
			}
			var msg message
			if json.Unmarshal([]byte(part), &msg) != nil {
				continue
			}
			if strings.Contains(msg.M, "error") {
				// lỗi lúc xin thêm nến cũ (đã có nến) thì giữ phần đã nhận; lỗi ngay từ đầu (sai mã…) thì báo
				if len(rows) > 0 {
					return columns(rows, now().Unix()/60*60), nil
				}
				return Bars{}, fmt.Errorf("tradingview %s: %.200s", msg.M, part)
			}
			if (msg.M == "timescale_update" || msg.M == "du") && len(msg.P) > 1 {
				var u seriesUpdate
				dec := json.NewDecoder(strings.NewReader(string(msg.P[1])))
				dec.UseNumber()
				if dec.Decode(&u) != nil {
					continue
				}
				for _, b := range u.S.S {
					if len(b.V) < 5 {
						continue
					}
					t, err := unixSeconds(b.V[0])
					if err != nil {
						return Bars{}, err
					}
					rows[t] = b.V
				}
			}
			// trả xong một đợt thì xin thêm nến cũ hơn, tới khi không thêm được cây nào
			if msg.M == "series_completed" {
				if len(rows) == lastSize {
					return columns(rows, now().Unix()/60*60), nil
				}
				lastSize = len(rows)
				if err := send("request_more_data", "cs", "s", 5000); err != nil {
					return Bars{}, fmt.Errorf("send request_more_data: %w", err)
				}
			}
		}
	}
}

// unixSeconds đọc giờ dạng "1792766460.0" (hay "1.79276646e9") ra giây Unix. Đây là giờ, không
// phải tiền, nên đi qua float khi chuỗi không phải số nguyên là chấp nhận được.
func unixSeconds(n json.Number) (int64, error) {
	s, _, _ := strings.Cut(n.String(), ".")
	if t, err := strconv.ParseInt(s, 10, 64); err == nil && !strings.ContainsAny(n.String(), "eE") {
		return t, nil
	}
	f, err := strconv.ParseFloat(n.String(), 64)
	if err != nil {
		return 0, fmt.Errorf("bad bar time %q: %w", n, err)
	}
	return int64(f), nil
}

// columns xếp nến theo giờ và bỏ nến mở từ openMinute trở đi (phút chưa đóng).
func columns(rows map[int64][]json.Number, openMinute int64) Bars {
	keys := make([]int64, 0, len(rows))
	for t := range rows {
		if t < openMinute {
			keys = append(keys, t)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	b := Bars{T: keys, O: []json.Number{}, H: []json.Number{}, L: []json.Number{}, C: []json.Number{}, V: []json.Number{}}
	for _, t := range keys {
		v := rows[t]
		vol := json.Number("0")
		if len(v) > 5 {
			vol = v[5]
		}
		b.O, b.H, b.L, b.C, b.V = append(b.O, v[1]), append(b.H, v[2]), append(b.L, v[3]), append(b.C, v[4]), append(b.V, vol)
	}
	return b
}
