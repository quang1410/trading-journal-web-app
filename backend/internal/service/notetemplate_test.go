package service_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"journal/internal/apperr"
	"journal/internal/service"
)

func newTplSvc() *service.NoteTemplateService {
	return service.NewNoteTemplateService(newMemNoteTemplateStore())
}

// setTri dựng một Tristate "có gửi lên, mang giá trị". Tristate là struct với
// trường xuất khẩu chứ không có hàm khởi tạo, nên test tự gói cho gọn.
func setTri(v string) service.Tristate[string] {
	return service.Tristate[string]{Set: true, Value: &v}
}

// nullTri dựng một Tristate "có gửi lên, mang null" — trạng thái thứ ba mà
// con trỏ thường không diễn đạt được.
func nullTri() service.Tristate[string] {
	return service.Tristate[string]{Set: true, Value: nil}
}

func TestNoteTemplateServiceCreateThenList(t *testing.T) {
	svc := newTplSvc()

	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{
		Name: "Setup A", BodyHTML: "<p>x</p>",
	})
	require.NoError(t, err)
	require.Equal(t, 1, created.Position)

	rows, err := svc.List(newCtx(), 1)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.Equal(t, "Setup A", rows[0].Name)
}

// Validate của domain phải chạy TRƯỚC khi xuống store: tên rỗng là 400, không
// phải một hàng rác trong DB.
func TestNoteTemplateCreateEmptyNameIsValidationError(t *testing.T) {
	svc := newTplSvc()

	_, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "  ", BodyHTML: "<p>x</p>"})

	require.Error(t, err)
	require.Equal(t, 400, apperr.As(err).Status)
}

func TestNoteTemplateCreateDuplicateNameIsConflict(t *testing.T) {
	svc := newTplSvc()
	_, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "Setup A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	_, err = svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "setup a", BodyHTML: "<p>y</p>"})

	require.Error(t, err)
	require.Equal(t, 409, apperr.As(err).Status)
}

func TestNoteTemplateUpdateChangesSingleField(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	updated, err := svc.Update(newCtx(), 1, created.ID, service.NoteTemplatePatch{
		Name: setTri("A mới"),
	})

	require.NoError(t, err)
	require.Equal(t, "A mới", updated.Name)
	require.Equal(t, "<p>x</p>", updated.BodyHTML, "thân không gửi lên thì không được đổi")
}

// Patch rỗng là hợp lệ và không đổi gì — nó KHÔNG được lọt qua validate rồi
// ghi một map rỗng xuống DB.
func TestNoteTemplateUpdateEmptyPatchChangesNothing(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	updated, err := svc.Update(newCtx(), 1, created.ID, service.NoteTemplatePatch{})

	require.NoError(t, err)
	require.Equal(t, "A", updated.Name)
	require.Equal(t, "<p>x</p>", updated.BodyHTML)
}

// Cột name và body_html đều NOT NULL, nên trạng thái thứ ba của Tristate —
// "có gửi lên, mang null" — là input SAI, phải ra 400 chứ không được ghi chuỗi
// rỗng xuống DB. Với bốn cột NULLable của trades thì null có nghĩa "xoá",
// nhưng ở đây không có nghĩa nào cả.
func TestNoteTemplateUpdateExplicitNullIsValidationError(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	t.Run("name null", func(t *testing.T) {
		_, err := svc.Update(newCtx(), 1, created.ID, service.NoteTemplatePatch{Name: nullTri()})
		require.Error(t, err)
		require.Equal(t, 400, apperr.As(err).Status)
	})
	t.Run("body_html null", func(t *testing.T) {
		_, err := svc.Update(newCtx(), 1, created.ID, service.NoteTemplatePatch{BodyHTML: nullTri()})
		require.Error(t, err)
		require.Equal(t, 400, apperr.As(err).Status)
	})

	// Và mẫu vẫn còn nguyên sau hai lượt trên.
	rows, err := svc.List(newCtx(), 1)
	require.NoError(t, err)
	require.Equal(t, "A", rows[0].Name)
	require.Equal(t, "<p>x</p>", rows[0].BodyHTML)
}

func TestNoteTemplateUpdateOtherUsersTemplateIsNotFound(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	_, err = svc.Update(newCtx(), 2, created.ID, service.NoteTemplatePatch{Name: setTri("cướp")})

	require.Error(t, err)
	require.Equal(t, 404, apperr.As(err).Status, "phải là 404, không phải 403: không tiết lộ mẫu có tồn tại")
}

func TestNoteTemplateUpdateEmptyNameIsValidationError(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)

	_, err = svc.Update(newCtx(), 1, created.ID, service.NoteTemplatePatch{Name: setTri("   ")})

	require.Error(t, err)
	require.Equal(t, 400, apperr.As(err).Status)
}

func TestNoteTemplateUpdateDuplicateNameIsConflict(t *testing.T) {
	svc := newTplSvc()
	_, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>a</p>"})
	require.NoError(t, err)
	b, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "B", BodyHTML: "<p>b</p>"})
	require.NoError(t, err)

	_, err = svc.Update(newCtx(), 1, b.ID, service.NoteTemplatePatch{Name: setTri("a")})

	require.Error(t, err)
	require.Equal(t, 409, apperr.As(err).Status)
}

func TestNoteTemplateDeleteTwiceIsNotFound(t *testing.T) {
	svc := newTplSvc()
	created, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>x</p>"})
	require.NoError(t, err)
	require.NoError(t, svc.Delete(newCtx(), 1, created.ID))

	err = svc.Delete(newCtx(), 1, created.ID)

	require.Error(t, err)
	require.Equal(t, 404, apperr.As(err).Status)
}

// Reorder nhận ĐÚNG tập id của user. Mảng cắt cụt mà cứ thế chạy sẽ dồn các
// mẫu còn lại về position sai, âm thầm.
func TestNoteTemplateReorderIDSetMismatchIsValidationError(t *testing.T) {
	svc := newTplSvc()
	a, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>a</p>"})
	require.NoError(t, err)
	_, err = svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "B", BodyHTML: "<p>b</p>"})
	require.NoError(t, err)

	cases := map[string][]int64{
		"thiếu id":  {a.ID},
		"id trùng":  {a.ID, a.ID},
		"id lạ":     {a.ID, 9999},
		"mảng rỗng": {},
	}
	for name, ids := range cases {
		t.Run(name, func(t *testing.T) {
			err := svc.Reorder(newCtx(), 1, ids)
			require.Error(t, err)
			require.Equal(t, 400, apperr.As(err).Status)
		})
	}
}

func TestNoteTemplateReorderActuallyChangesOrder(t *testing.T) {
	svc := newTplSvc()
	a, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "A", BodyHTML: "<p>a</p>"})
	require.NoError(t, err)
	b, err := svc.Create(newCtx(), 1, service.NoteTemplateCreate{Name: "B", BodyHTML: "<p>b</p>"})
	require.NoError(t, err)

	require.NoError(t, svc.Reorder(newCtx(), 1, []int64{b.ID, a.ID}))

	rows, err := svc.List(newCtx(), 1)
	require.NoError(t, err)
	require.Equal(t, []string{"B", "A"}, []string{rows[0].Name, rows[1].Name})
}
