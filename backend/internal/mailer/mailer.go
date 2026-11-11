// Package mailer mô tả một lá thư và nội dung các thư hệ thống gửi đi.
//
// Package này thuần: không import net/http. Việc chuyển thư qua mạng nằm ở
// package con (mailer/resend), để service phụ thuộc vào HÀNH VI gửi thư chứ
// không vào nhà cung cấp, và test chạy không cần mạng.
package mailer

import (
	"context"
	"log"
	"sync"
)

// Message là một lá thư. Luôn có cả bản chữ thường lẫn HTML: trình đọc thư
// chặn HTML vẫn đọc được link.
type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Mailer gửi một lá thư. Lỗi trả về là lỗi hạ tầng; tầng service quyết định
// có báo cho người dùng hay không.
type Mailer interface {
	Send(ctx context.Context, m Message) error
}

// LogMailer không gửi gì: in thư ra log và giữ lại để test đọc. Dùng ở dev khi
// chưa có RESEND_API_KEY — link xác minh nằm ngay trong log của API.
type LogMailer struct {
	mu   sync.Mutex
	sent []Message
}

func (l *LogMailer) Send(_ context.Context, m Message) error {
	l.mu.Lock()
	l.sent = append(l.sent, m)
	l.mu.Unlock()
	log.Printf("mail (not sent, LogMailer) to=%s subject=%q\n%s", m.To, m.Subject, m.Text)
	return nil
}

// Sent trả bản sao các thư đã "gửi", theo thứ tự.
func (l *LogMailer) Sent() []Message {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]Message(nil), l.sent...)
}
