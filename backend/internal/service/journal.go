package service

import (
	"context"
	"fmt"

	"journal/internal/aggregate"
	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/metrics"
)

// JournalView là ảnh chụp đã-nạp-và-làm-giàu của một account trong MỘT
// request: nạp một lần, Enrich một lần, rồi phục vụ mọi cách đọc.
//
// Hai tập, không phải một. Spec mẹ §7.1 và quy tắc 8 của CLAUDE.md quy định
// lũy kế, drawdown và streak tính trên TOÀN BỘ lệnh chưa xoá, còn KPI và
// pivot tính trên tập ĐÃ LỌC.
//
// Hai tập đó cố ý KHÔNG lộ ra ngoài dưới dạng slice trần. Trước đây chúng là
// hai trường public cùng kiểu []metrics.Enriched, nên đảo chỗ hai tham số vẫn
// biên dịch, vẫn ra số — chỉ là số sai, im lặng. Đóng gói sau một interface
// gồm những cách đọc CÓ TÊN biến lỗi đó từ "phải nhớ" thành "không gõ ra
// được": ngoài package này không ai cầm được slice để mà truyền nhầm.
//
// Quy tắc 8 vì thế chuyển từ lời văn trong comment thành code bên trong
// module: KPI() tự biết số dư lấy all, phần còn lại lấy filtered.
type JournalView struct {
	all      []metrics.Enriched // toàn bộ lệnh chưa xoá, theo thứ tự stt
	filtered []metrics.Enriched // tập đã áp bộ lọc hiển thị
	account  domain.Account
}

// Load nạp toàn bộ lệnh chưa xoá của account, làm giàu trên TRỌN dãy, rồi mới
// lọc.
//
// Thứ tự này là điều kiện đúng/sai chứ không phải sở thích: Enrich tính
// cum_by_trade, running_peak và drawdown theo thứ tự stt, nên lọc trước khi
// làm giàu sẽ dựng đường equity từ một tập con — một đường không có thật.
//
// Nhận sẵn domain.Account thay vì accountID vì handler đã có account trong
// context từ RequireAccount; nạp lại là một truy vấn thừa mỗi request.
func (s *TradeService) Load(ctx context.Context, acc domain.Account, f Filter) (*JournalView, error) {
	rows, err := s.trades.ListByAccount(ctx, acc.ID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê lệnh: %w", err)
	}
	all, err := metrics.Enrich(rows, acc)
	if err != nil {
		// Enrich chỉ lỗi khi timezone của account không phải tên IANA hợp lệ,
		// hoặc khi lát cắt trộn nhiều account. Cả hai đều hiển thị được cho
		// người dùng và đều là lỗi dữ liệu, không phải lỗi hệ thống.
		return nil, apperr.Validation(err.Error())
	}
	return &JournalView{
		all:      all,
		filtered: f.Normalize().Apply(all),
		account:  acc,
	}, nil
}

// Account trả account của ảnh chụp này.
func (v *JournalView) Account() domain.Account { return v.account }

// Page phân trang tập ĐÃ LỌC, lệnh mới nhất trước.
func (v *JournalView) Page(page, size int) Page {
	return paginate(v.filtered, page, size)
}

// KPI tính chỉ số trên tập ĐÃ LỌC, trừ current_balance.
//
// Truyền CẢ filtered lẫn all xuống ComputeKPI: số dư tài khoản không chịu bộ
// lọc (ngoại lệ của quy tắc 8 — Excel cũng làm vậy, `Dashboard!V3` VLOOKUP
// thẳng vào Settings chứ không đi qua pivot), phần còn lại thì có.
//
// Thứ tự hai tham số ở đây là chỗ DUY NHẤT trong toàn hệ thống còn phải viết
// đúng bằng tay; mọi chỗ gọi khác đã đi qua method này.
func (v *JournalView) KPI(flows []domain.CashFlow) metrics.KPI {
	return metrics.ComputeKPI(v.filtered, v.all, v.account, flows)
}

// Charts dựng cả 12 nhóm biểu đồ.
//
// aggregate.All nhận (all, filtered) đúng thứ tự đó: streak tính trên toàn bộ
// dãy còn pivot tính trên tập đã lọc.
func (v *JournalView) Charts() aggregate.Charts {
	return aggregate.All(v.all, v.filtered, v.account)
}

// CSVRows trả các lệnh để xuất file: tập ĐÃ LỌC, để file xuất ra khớp đúng
// cái người dùng đang nhìn thấy ở /trades.
//
// Trả BẢN SAO, không phải lát cắt gốc. Một JournalView phục vụ nhiều cách
// đọc trong cùng request, nên nếu người gọi sắp xếp hay đảo kết quả này tại
// chỗ thì KPI() hay Charts() gọi sau đó sẽ đọc một dãy đã bị xáo — sai số
// mà không lỗi nào bật ra. Page() đã copy vì đúng lý do này (xem paginate).
func (v *JournalView) CSVRows() []metrics.Enriched {
	out := make([]metrics.Enriched, len(v.filtered))
	copy(out, v.filtered)
	return out
}

// ByID tìm một lệnh KÈM trường suy diễn trong TOÀN BỘ dãy.
//
// Tìm trong all chứ không phải filtered: handler dùng nó để trả về lệnh vừa
// tạo hoặc vừa sửa, và lệnh đó có thể nằm ngoài bộ lọc hiện hành. Tìm trong
// tập đã lọc sẽ khiến tạo lệnh xong lại báo "không tìm thấy".
func (v *JournalView) ByID(id int64) (metrics.Enriched, bool) {
	for _, e := range v.all {
		if e.Trade.ID == id {
			return e, true
		}
	}
	return metrics.Enriched{}, false
}

// All và Filtered lộ hai tập ra CHỈ cho test trong cùng module.
//
// Chúng nằm ở export_test.go chứ không phải file này, nên ngoài package không
// gọi được: hai tập vẫn kín với handler, và cái bẫy truyền nhầm vẫn đóng.
