package service

import (
	"context"
	"errors"
	"fmt"

	"journal/internal/apperr"
	"journal/internal/domain"
	"journal/internal/repository"
)

type JournalNoteService struct{ store JournalNoteStore }

func NewJournalNoteService(store JournalNoteStore) *JournalNoteService {
	return &JournalNoteService{store: store}
}

// List trả mọi ghi chú của một kỳ.
//
// Ghi chú KHÔNG chịu bộ lọc lệnh: nó gắn với khoá kỳ, nên thẻ nào hiện ra thì
// ghi chú của kỳ đó đi kèm, bất kể bộ lọc nào đã tạo ra danh sách thẻ.
func (s *JournalNoteService) List(
	ctx context.Context, accountID int64, period string,
) ([]domain.JournalNote, error) {
	p, err := parsePeriod(period)
	if err != nil {
		return nil, err
	}
	rows, err := s.store.ListByAccount(ctx, accountID, p)
	if err != nil {
		return nil, fmt.Errorf("list period notes: %w", err)
	}
	return rows, nil
}

// Save ghi nội dung cho một kỳ. Trả thêm cờ `deleted` khi body rỗng.
//
// Body rỗng xử như XOÁ: người dùng xoá sạch chữ rồi lưu thì kỳ vọng ghi chú
// biến mất, không phải một bản ghi rỗng làm thẻ hiện một mục trống. "Rỗng"
// gồm cả HTML rỗng của Quill ("<p><br></p>") — xem domain.IsBlankNoteHTML.
// Xoá một ghi chú chưa từng tồn tại KHÔNG phải lỗi — kết quả mong muốn đã
// đúng sẵn.
func (s *JournalNoteService) Save(
	ctx context.Context, accountID int64, period, key, bodyHTML string,
) (domain.JournalNote, bool, error) {
	ref, err := parsePeriodRef(period, key)
	if err != nil {
		return domain.JournalNote{}, false, err
	}

	if domain.IsBlankNoteHTML(bodyHTML) {
		err := s.store.DeleteOwned(ctx, accountID, ref)
		if err != nil && !errors.Is(err, repository.ErrNotFound) {
			return domain.JournalNote{}, false, fmt.Errorf("delete period note: %w", err)
		}
		return domain.JournalNote{}, true, nil
	}

	saved, err := s.store.Upsert(ctx, domain.JournalNote{
		AccountID: accountID,
		Period:    ref.Period,
		PeriodKey: ref.Key,
		BodyHTML:  bodyHTML,
	})
	if err != nil {
		return domain.JournalNote{}, false, fmt.Errorf("save period note: %w", err)
	}
	return saved, false, nil
}

// Delete xoá hẳn ghi chú của một kỳ.
//
// Khác Save với body rỗng ở đúng một chỗ: ở đây "không có gì để xoá" LÀ lỗi
// 404, vì người dùng chủ động bấm xoá một thứ họ tin là đang tồn tại.
func (s *JournalNoteService) Delete(
	ctx context.Context, accountID int64, period, key string,
) error {
	ref, err := parsePeriodRef(period, key)
	if err != nil {
		return err
	}
	if err := s.store.DeleteOwned(ctx, accountID, ref); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return apperr.NotFound("period note not found")
		}
		return fmt.Errorf("delete period note: %w", err)
	}
	return nil
}

// parsePeriod và parsePeriodRef là ranh giới chuỗi→Period của tầng service,
// dùng chung cho JournalNoteService và TradeService.Periods.
//
// domain trả lỗi THƯỜNG (package thuần, quy tắc 3); bọc thành *apperr.Error ở
// đây để httpapi dịch ra 400 — cùng khuôn NoteTemplateService.Create.
func parsePeriod(s string) (domain.Period, error) {
	p, err := domain.ParsePeriod(s)
	if err != nil {
		return "", apperr.Validation(err.Error())
	}
	return p, nil
}

func parsePeriodRef(period, key string) (domain.PeriodRef, error) {
	ref, err := domain.ParsePeriodRef(period, key)
	if err != nil {
		return domain.PeriodRef{}, apperr.Validation(err.Error())
	}
	return ref, nil
}
