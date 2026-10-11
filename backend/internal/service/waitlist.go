package service

import (
	"context"
	"fmt"
	"strings"

	"journal/internal/apperr"
	"journal/internal/domain"
)

type WaitlistService struct{ store WaitlistStore }

func NewWaitlistService(store WaitlistStore) *WaitlistService {
	return &WaitlistService{store: store}
}

// WaitlistJoin là input của Join. Honeypot là ô ẩn trên form: người thật
// không thấy nên để trống, bot điền mọi ô nên điền vào.
type WaitlistJoin struct {
	Email    string
	Locale   string
	Source   string
	Honeypot string
}

// Join thêm email vào danh sách chờ.
//
// Email mới, email đã có và request của bot đều trả nil: người gọi không phân
// biệt được ba trường hợp, nên không ai dò được email nào đã đăng ký.
func (s *WaitlistService) Join(ctx context.Context, in WaitlistJoin) error {
	if strings.TrimSpace(in.Honeypot) != "" {
		return nil
	}
	email, err := domain.NormalizeEmail(in.Email)
	if err != nil {
		return apperr.Validation(err.Error())
	}
	row := domain.WaitlistSignup{
		Email:  email,
		Locale: domain.NormalizeLocale(in.Locale),
		Source: domain.NormalizeSource(in.Source),
	}
	if err := s.store.Insert(ctx, row); err != nil {
		return fmt.Errorf("insert waitlist signup: %w", err)
	}
	return nil
}

// WaitlistAnswersInput là ba câu trả lời không bắt buộc, gửi sau khi Join.
type WaitlistAnswersInput struct {
	Email   string
	Answers domain.WaitlistAnswerCodes
}

// SaveAnswers ghi câu trả lời một lần cho email đã đăng ký. Email lạ hoặc đã
// trả lời rồi vẫn trả nil, cùng lý do với Join.
func (s *WaitlistService) SaveAnswers(ctx context.Context, in WaitlistAnswersInput) error {
	email, err := domain.NormalizeEmail(in.Email)
	if err != nil {
		return apperr.Validation(err.Error())
	}
	answers, err := domain.ParseAnswers(in.Answers)
	if err != nil {
		return apperr.Validation(err.Error())
	}
	if err := s.store.SaveAnswers(ctx, email, answers); err != nil {
		return fmt.Errorf("save waitlist answers: %w", err)
	}
	return nil
}
