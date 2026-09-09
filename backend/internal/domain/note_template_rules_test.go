package domain_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/domain"
)

func TestValidateNoteTemplate(t *testing.T) {
	cases := []struct {
		name    string
		in      domain.NoteTemplate
		wantErr bool
	}{
		{
			name: "hợp lệ",
			in:   domain.NoteTemplate{Name: "Setup A", BodyHTML: "<p>x</p>"},
		},
		{
			name:    "tên rỗng",
			in:      domain.NoteTemplate{Name: "", BodyHTML: "<p>x</p>"},
			wantErr: true,
		},
		{
			name:    "tên toàn khoảng trắng",
			in:      domain.NoteTemplate{Name: "   \t ", BodyHTML: "<p>x</p>"},
			wantErr: true,
		},
		{
			name:    "tên quá dài",
			in:      domain.NoteTemplate{Name: strings.Repeat("a", domain.MaxTemplateNameLen+1), BodyHTML: "<p>x</p>"},
			wantErr: true,
		},
		{
			name: "tên dài đúng bằng giới hạn thì được",
			in:   domain.NoteTemplate{Name: strings.Repeat("a", domain.MaxTemplateNameLen), BodyHTML: "<p>x</p>"},
		},
		{
			name:    "thân rỗng",
			in:      domain.NoteTemplate{Name: "Setup A", BodyHTML: ""},
			wantErr: true,
		},
		{
			name:    "thân chỉ có khoảng trắng",
			in:      domain.NoteTemplate{Name: "Setup A", BodyHTML: "   "},
			wantErr: true,
		},
		{
			name:    "thân quá dài",
			in:      domain.NoteTemplate{Name: "Setup A", BodyHTML: strings.Repeat("x", domain.MaxTemplateBodyLen+1)},
			wantErr: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			in := tc.in
			err := domain.ValidateNoteTemplate(&in)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
		})
	}
}

// Trim phải GHI LẠI vào con trỏ, không chỉ dùng để kiểm: nếu chỉ kiểm thì
// khoảng trắng đầu/cuối vẫn xuống DB, và "Setup A " với "Setup A" thành hai
// mẫu khác nhau dù UNIQUE index dùng lower() vẫn coi chúng là hai.
func TestValidateNoteTemplateWritesBackTrimmedValues(t *testing.T) {
	in := domain.NoteTemplate{Name: "  Setup A  ", BodyHTML: "  <p>x</p>  "}

	require.NoError(t, domain.ValidateNoteTemplate(&in))

	require.Equal(t, "Setup A", in.Name)
	require.Equal(t, "<p>x</p>", in.BodyHTML)
}

// Lỗi của hai trường bắt buộc là biến gói, để service và test đối chiếu được
// bằng errors.Is thay vì so chuỗi.
func TestValidateNoteTemplateReturnsSentinelErrors(t *testing.T) {
	noName := domain.NoteTemplate{Name: " ", BodyHTML: "<p>x</p>"}
	require.ErrorIs(t, domain.ValidateNoteTemplate(&noName), domain.ErrTemplateNameEmpty)

	noBody := domain.NoteTemplate{Name: "Setup A", BodyHTML: " "}
	require.ErrorIs(t, domain.ValidateNoteTemplate(&noBody), domain.ErrTemplateBodyEmpty)
}
