package service

import (
	"context"
	"errors"
	"fmt"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
)

type NoteTemplateService struct{ store NoteTemplateStore }

func NewNoteTemplateService(store NoteTemplateStore) *NoteTemplateService {
	return &NoteTemplateService{store: store}
}

type NoteTemplateCreate struct {
	Name     string
	BodyHTML string
}

// NoteTemplatePatch dùng Tristate như TradePatch: khoá vắng mặt nghĩa là
// "không đổi", khác hẳn với "đổi thành chuỗi rỗng".
//
// Khác TradePatch ở MỘT điểm: trạng thái thứ ba của Tristate — có gửi lên,
// mang null — ở đây là input SAI, không phải lệnh xoá giá trị. Bốn cột NULLable
// của trades hiểu null là "về NULL", còn name và body_html đều NOT NULL nên
// null không mang nghĩa nào cả. Xem checkNotNull.
type NoteTemplatePatch struct {
	Name     Tristate[string]
	BodyHTML Tristate[string]
}

func (s *NoteTemplateService) List(ctx context.Context, userID int64) ([]domain.NoteTemplate, error) {
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("liệt kê note template: %w", err)
	}
	return rows, nil
}

func (s *NoteTemplateService) Create(
	ctx context.Context, userID int64, in NoteTemplateCreate,
) (domain.NoteTemplate, error) {
	t := domain.NoteTemplate{UserID: userID, Name: in.Name, BodyHTML: in.BodyHTML}
	// domain trả lỗi THƯỜNG (package thuần, quy tắc 3); bọc thành *apperr.Error
	// ở đây để httpapi dịch ra 400 — cùng khuôn tradeFromInput.
	if err := domain.ValidateNoteTemplate(&t); err != nil {
		return domain.NoteTemplate{}, apperr.Validation(err.Error())
	}
	created, err := s.store.Create(ctx, t)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.NoteTemplate{}, apperr.Conflict(fmt.Sprintf("mẫu ghi chú %q đã tồn tại", t.Name))
		}
		return domain.NoteTemplate{}, fmt.Errorf("tạo note template: %w", err)
	}
	return created, nil
}

// Update chỉ ghi những trường CÓ trong patch.
//
// Validate chạy trên bản đã GỘP (giá trị cũ + patch), không phải trên riêng
// patch: chỉ sửa tên thì thân cũ vẫn phải hợp lệ, và ngược lại. Validate riêng
// patch sẽ để một patch rỗng lọt qua mọi luật.
func (s *NoteTemplateService) Update(
	ctx context.Context, userID, id int64, p NoteTemplatePatch,
) (domain.NoteTemplate, error) {
	current, err := s.byID(ctx, userID, id)
	if err != nil {
		return domain.NoteTemplate{}, err
	}

	name, setName, err := checkNotNull(p.Name, "name")
	if err != nil {
		return domain.NoteTemplate{}, err
	}
	body, setBody, err := checkNotNull(p.BodyHTML, "body_html")
	if err != nil {
		return domain.NoteTemplate{}, err
	}

	merged := current
	if setName {
		merged.Name = name
	}
	if setBody {
		merged.BodyHTML = body
	}
	if err := domain.ValidateNoteTemplate(&merged); err != nil {
		return domain.NoteTemplate{}, apperr.Validation(err.Error())
	}

	// Lấy giá trị ĐÃ TRIM từ merged, không lấy thô từ patch.
	fields := map[string]any{}
	if setName {
		fields["name"] = merged.Name
	}
	if setBody {
		fields["body_html"] = merged.BodyHTML
	}
	if len(fields) == 0 {
		return current, nil
	}

	if err := s.store.UpdateOwned(ctx, id, userID, fields); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return domain.NoteTemplate{}, apperr.NotFound("không tìm thấy mẫu ghi chú")
		}
		if errors.Is(err, repository.ErrDuplicate) {
			return domain.NoteTemplate{}, apperr.Conflict(fmt.Sprintf("mẫu ghi chú %q đã tồn tại", merged.Name))
		}
		return domain.NoteTemplate{}, fmt.Errorf("sửa note template: %w", err)
	}
	return s.byID(ctx, userID, id)
}

func (s *NoteTemplateService) Delete(ctx context.Context, userID, id int64) error {
	if err := s.store.DeleteOwned(ctx, id, userID); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy mẫu ghi chú")
		}
		return fmt.Errorf("xoá note template: %w", err)
	}
	return nil
}

// Reorder đòi ids là ĐÚNG tập id của user — không thiếu, không thừa, không
// trùng. Kiểm ở đây chứ không ở repo: một mảng cắt cụt mà cứ thế chạy sẽ dồn
// các mẫu không được nhắc tới về position sai, và không có gì báo cho ai biết.
// Reorder ghi lại position theo đúng thứ tự `ids`.
//
// `ids` phải là ĐÚNG TẬP id của user — thiếu, thừa hay trùng đều là 400. Kiểm ở
// đây (không phải trong repo) để lỗi của người gọi ra 400 kèm tên id sai, thay
// vì một 404 chung chung từ tầng dưới.
//
// Đã biết và cố ý chấp nhận: giữa `ListByUser` và `ReorderOwned` không có
// transaction chung, nên nếu user xoá một mẫu ở thiết bị khác đúng vào khe đó
// thì `ReorderOwned` trả ErrNotFound và request này thành 404 dù `ids` hợp lệ
// lúc gửi. KHÔNG hỏng dữ liệu: `ReorderOwned` là tất-cả-hoặc-không (xem
// repository/notetemplate.go), nên kết quả xấu nhất là một 404 mà tải lại
// trang là hết. Đóng hẳn khe này phải đưa phép kiểm tập id vào trong
// transaction của repo, tức là nới rộng seam interface mà thiết kế cố ý giữ
// hẹp — không đáng cho một lỗi tự khỏi khi refresh.
func (s *NoteTemplateService) Reorder(ctx context.Context, userID int64, ids []int64) error {
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return fmt.Errorf("liệt kê note template: %w", err)
	}
	if len(ids) != len(rows) {
		return apperr.Validation(fmt.Sprintf("cần đúng %d id, nhận %d", len(rows), len(ids)))
	}
	owned := make(map[int64]bool, len(rows))
	for _, r := range rows {
		owned[r.ID] = true
	}
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if !owned[id] {
			return apperr.Validation(fmt.Sprintf("id %d không thuộc danh sách mẫu", id))
		}
		if seen[id] {
			return apperr.Validation(fmt.Sprintf("id %d xuất hiện hai lần", id))
		}
		seen[id] = true
	}

	if err := s.store.ReorderOwned(ctx, userID, ids); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("không tìm thấy mẫu ghi chú")
		}
		return fmt.Errorf("đổi thứ tự note template: %w", err)
	}
	return nil
}

// checkNotNull bóc một Tristate của cột NOT NULL.
//
// Trả (giá trị, có gửi lên, lỗi). Gửi null lên một cột NOT NULL là 400: nếu
// lặng lẽ đổi thành chuỗi rỗng thì validate sẽ báo "không được để trống", một
// thông điệp nói sai chỗ hỏng — người gửi đã nói null, không nói rỗng.
func checkNotNull(t Tristate[string], field string) (string, bool, error) {
	v, ok := t.Get()
	if !ok {
		return "", false, nil
	}
	if v == nil {
		return "", false, apperr.Validation(fmt.Sprintf("%s không được là null", field))
	}
	return *v, true, nil
}

// byID không có trong seam: đọc một mẫu là lọc từ ListByUser.
//
// Thêm một method ByID vào interface chỉ để phục vụ Update sẽ bắt CẢ HAI
// adapter cài thêm, mà store.go đã nói rõ interface rộng đúng bằng cái service
// gọi. Số mẫu của một người là hàng chục, không phải hàng nghìn.
func (s *NoteTemplateService) byID(ctx context.Context, userID, id int64) (domain.NoteTemplate, error) {
	rows, err := s.store.ListByUser(ctx, userID)
	if err != nil {
		return domain.NoteTemplate{}, fmt.Errorf("liệt kê note template: %w", err)
	}
	for _, r := range rows {
		if r.ID == id {
			return r, nil
		}
	}
	return domain.NoteTemplate{}, apperr.NotFound("không tìm thấy mẫu ghi chú")
}
