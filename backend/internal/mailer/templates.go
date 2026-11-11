package mailer

import (
	"fmt"
	"html"
)

// Nội dung thư là text hiển thị cho người dùng nên viết song ngữ (CLAUDE.md
// quy tắc 9). Locale lạ rơi về "vi", cùng luật với domain.NormalizeLocale.

type verifyCopy struct {
	subject, greeting, body, button, expiry, ignore string
}

var verifyCopies = map[string]verifyCopy{
	"vi": {
		subject:  "Xác minh email cho Nhật ký giao dịch",
		greeting: "Chào bạn,",
		body:     "Bấm vào liên kết dưới đây để xác minh địa chỉ email của bạn.",
		button:   "Xác minh email",
		expiry:   "Liên kết có hiệu lực trong 24 giờ và chỉ dùng được một lần.",
		ignore:   "Nếu bạn không tạo tài khoản, hãy bỏ qua thư này.",
	},
	"en": {
		subject:  "Verify your email for Trading journal",
		greeting: "Hi,",
		body:     "Click the link below to verify your email address.",
		button:   "Verify email",
		expiry:   "The link is valid for 24 hours and can be used once.",
		ignore:   "If you did not create an account, you can ignore this email.",
	},
}

// VerifyEmail dựng thư xác minh email chứa link.
func VerifyEmail(to, locale, link string) Message {
	c, ok := verifyCopies[locale]
	if !ok {
		c = verifyCopies["vi"]
	}
	text := fmt.Sprintf("%s\n\n%s\n\n%s\n\n%s\n%s\n", c.greeting, c.body, link, c.expiry, c.ignore)
	esc := html.EscapeString(link)
	body := fmt.Sprintf(
		`<p>%s</p><p>%s</p><p><a href="%s">%s</a></p><p>%s</p><p>%s</p><p style="word-break:break-all">%s</p>`,
		html.EscapeString(c.greeting), html.EscapeString(c.body), esc, html.EscapeString(c.button),
		html.EscapeString(c.expiry), html.EscapeString(c.ignore), esc,
	)
	return Message{To: to, Subject: c.subject, Text: text, HTML: body}
}
