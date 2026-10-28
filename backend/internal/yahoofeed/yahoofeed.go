// Package yahoofeed kéo nến 1 phút CME (NQ=F, ES=F) qua API chart của Yahoo Finance — nguồn thứ hai
// cho trang /replay, bên cạnh TradingView (package tvfeed).
//
// Yahoo cho lùi xa hơn TradingView không đăng nhập: khoảng 30 ngày nến 1m thay vì một tuần, nhưng mỗi
// request tối đa 8 ngày, nên một lần kéo dài được chia nhiều đoạn. Đối chiếu với TradingView (tuần
// 18–23/10/2026): High/Low khớp 99,5%, Open/Close lệch vài tick ở một số phút, và Yahoo thiếu khoảng
// 10 phút mỗi ngày quanh 04:00 UTC. Vì vậy nến Yahoo chỉ lấp phút còn trống, TradingView thắng ở phút
// trùng (xem service.LiveBarService).
//
// Trình duyệt không gọi thẳng được: Yahoo không trả header CORS. Đây cũng là endpoint không chính
// thức — Yahoo đổi định dạng hay chặn IP server là hỏng.
package yahoofeed

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"time"

	"journal/internal/domain"
)

// DefaultURL là gốc API chart của Yahoo; mã nối thẳng phía sau.
const DefaultURL = "https://query1.finance.yahoo.com/v8/finance/chart/"

const (
	// MaxChunk: Yahoo trả lỗi 422 nếu một request xin quá 8 ngày nến 1m; lấy 7 ngày cho chắc.
	MaxChunk = 7 * 86400
	// MaxBack: nến 1m chỉ lùi được khoảng 30 ngày (thử thật: 29 ngày được, 31 ngày lỗi 422). Đoạn nào
	// bắt đầu quá mốc này thì Yahoo từ chối cả đoạn, nên kẹp lại ở 29 ngày.
	MaxBack = 29 * 86400
)

// Tickers: tên mã trong app → mã Yahoo (hợp đồng liên tục, như NQ1! của TradingView). Chỉ các mã này
// được kéo, để server không thành proxy kéo mã tuỳ ý.
var Tickers = map[string]string{
	"NQ": "NQ=F",
	"ES": "ES=F",
}

// Client kéo nến; giá trị rỗng dùng được (DefaultURL, http.DefaultClient, giờ thật).
type Client struct {
	URL  string
	HTTP *http.Client
	Now  func() time.Time
}

type chartResponse struct {
	Chart struct {
		Result []struct {
			Timestamp  []int64 `json:"timestamp"`
			Indicators struct {
				Quote []struct {
					// phút không có giao dịch (CME nghỉ 17:00–18:00 New York) là null → json.Number rỗng
					Open   []json.Number `json:"open"`
					High   []json.Number `json:"high"`
					Low    []json.Number `json:"low"`
					Close  []json.Number `json:"close"`
					Volume []json.Number `json:"volume"`
				} `json:"quote"`
			} `json:"indicators"`
		} `json:"result"`
		Error *struct {
			Code        string `json:"code"`
			Description string `json:"description"`
		} `json:"error"`
	} `json:"chart"`
}

// Fetch trả nến 1m của ticker mở từ giây Unix from tới hiện tại, tăng dần, đã bỏ phút null và phút
// đang chạy (chưa đóng). from cũ hơn MaxBack thì bị kẹp lại. Một đoạn hỏng là hỏng cả lần kéo.
func (c Client) Fetch(ctx context.Context, ticker string, from int64) (domain.MinuteBars, error) {
	now := time.Now
	if c.Now != nil {
		now = c.Now
	}
	end := now().Unix()
	from = max(from, end-MaxBack)
	rows := map[int64][5]json.Number{}
	for p1 := from; p1 < end; p1 += MaxChunk {
		if err := c.chunk(ctx, ticker, p1, min(p1+MaxChunk, end), rows); err != nil {
			return domain.MinuteBars{}, err
		}
	}
	openMinute := end / 60 * 60
	keys := make([]int64, 0, len(rows))
	for t := range rows {
		if t < openMinute {
			keys = append(keys, t)
		}
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	var b domain.MinuteBars
	for _, t := range keys {
		v := rows[t]
		b.Append(t, v[0], v[1], v[2], v[3], v[4])
	}
	return b.OrEmpty(), nil
}

// chunk kéo một đoạn [p1, p2) và ghi nến hợp lệ vào rows.
func (c Client) chunk(ctx context.Context, ticker string, p1, p2 int64, rows map[int64][5]json.Number) error {
	base := c.URL
	if base == "" {
		base = DefaultURL
	}
	hc := c.HTTP
	if hc == nil {
		hc = http.DefaultClient
	}
	q := url.Values{"interval": {"1m"}, "period1": {fmt.Sprint(p1)}, "period2": {fmt.Sprint(p2)}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+url.PathEscape(ticker)+"?"+q.Encode(), nil)
	if err != nil {
		return fmt.Errorf("build yahoo request: %w", err)
	}
	// không có User-Agent kiểu trình duyệt thì Yahoo trả 429 ngay
	req.Header.Set("User-Agent", "Mozilla/5.0")
	res, err := hc.Do(req)
	if err != nil {
		return fmt.Errorf("get yahoo chart: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 32<<20))
	if err != nil {
		return fmt.Errorf("read yahoo chart: %w", err)
	}
	var cr chartResponse
	if err := json.Unmarshal(body, &cr); err != nil {
		return fmt.Errorf("yahoo chart HTTP %d: %.200s", res.StatusCode, body)
	}
	if e := cr.Chart.Error; e != nil {
		return fmt.Errorf("yahoo chart %s: %s", e.Code, e.Description)
	}
	if res.StatusCode != http.StatusOK || len(cr.Chart.Result) == 0 {
		return fmt.Errorf("yahoo chart HTTP %d: no result", res.StatusCode)
	}
	r := cr.Chart.Result[0]
	if len(r.Indicators.Quote) == 0 {
		return nil // đoạn không có phiên nào (cuối tuần): Yahoo trả result không có nến
	}
	q0 := r.Indicators.Quote[0]
	for i, t := range r.Timestamp {
		// nến cuối của phiên đang mở mang giờ lẻ (giây của lần khớp cuối), không phải đầu phút
		if t%60 != 0 || i >= len(q0.Open) || i >= len(q0.High) || i >= len(q0.Low) || i >= len(q0.Close) || i >= len(q0.Volume) {
			continue
		}
		o, h, l, cl, v := q0.Open[i], q0.High[i], q0.Low[i], q0.Close[i], q0.Volume[i]
		if o == "" || h == "" || l == "" || cl == "" {
			continue
		}
		if v == "" {
			v = "0"
		}
		rows[t] = [5]json.Number{o, h, l, cl, v}
	}
	return nil
}
