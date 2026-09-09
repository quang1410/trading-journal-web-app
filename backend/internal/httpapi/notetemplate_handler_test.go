package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

const tplPath = "/api/note-templates"

type tplRow struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	BodyHTML string `json:"body_html"`
	Position int    `json:"position"`
}

func createTpl(t *testing.T, srvURL, token, name, body string) tplRow {
	t.Helper()
	resp, env := do(t, http.MethodPost, srvURL+tplPath, token,
		`{"name":"`+name+`","body_html":"`+body+`"}`)
	require.Equal(t, http.StatusOK, resp.StatusCode, "body: %s", env.Data)
	var row tplRow
	require.NoError(t, json.Unmarshal(env.Data, &row))
	require.NotZero(t, row.ID)
	return row
}

func TestNoteTemplateHandlerCreateThenList(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	created := createTpl(t, srv.URL, tokenA, "Setup A", "<p>x</p>")
	require.Equal(t, 1, created.Position)

	resp, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)
	var list []tplRow
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "Setup A", list[0].Name)
	require.Equal(t, "<p>x</p>", list[0].BodyHTML)
}

// Rỗng phải serialize thành [] chứ không phải null: null.map(...) là crash ở
// frontend. Đây là trạng thái của MỌI user vừa đăng ký.
func TestNoteTemplateEmptyListIsEmptyArray(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")

	require.Equal(t, http.StatusOK, resp.StatusCode)
	require.JSONEq(t, `[]`, string(env.Data),
		"danh sách rỗng phải là [] chứ không phải null, thực tế: %s", env.Data)
}

func TestNoteTemplateRequiresAuth(t *testing.T) {
	srv, _, _ := twoUserServer(t)

	resp, _ := do(t, http.MethodGet, srv.URL+tplPath, "", "")

	require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
}

func TestNoteTemplateBadInputReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	cases := map[string]string{
		"tên rỗng":           `{"name":"","body_html":"<p>x</p>"}`,
		"tên toàn trắng":     `{"name":"   ","body_html":"<p>x</p>"}`,
		"thân rỗng":          `{"name":"A","body_html":""}`,
		"JSON sai định dạng": `{"name":`,
		"khoá lạ":            `{"name":"A","body_html":"<p>x</p>","position":5}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			resp, _ := do(t, http.MethodPost, srv.URL+tplPath, tokenA, body)
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		})
	}
}

func TestNoteTemplateDuplicateNameReturns409(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	createTpl(t, srv.URL, tokenA, "Setup A", "<p>x</p>")

	resp, _ := do(t, http.MethodPost, srv.URL+tplPath, tokenA,
		`{"name":"setup a","body_html":"<p>y</p>"}`)

	require.Equal(t, http.StatusConflict, resp.StatusCode)
}

func TestNoteTemplatePatchUpdatesOneField(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	created := createTpl(t, srv.URL, tokenA, "A", "<p>x</p>")

	resp, env := do(t, http.MethodPatch,
		srv.URL+tplPath+"/"+itoa(created.ID), tokenA, `{"name":"A mới"}`)

	require.Equal(t, http.StatusOK, resp.StatusCode)
	var row tplRow
	require.NoError(t, json.Unmarshal(env.Data, &row))
	require.Equal(t, "A mới", row.Name)
	require.Equal(t, "<p>x</p>", row.BodyHTML, "thân không gửi lên thì không được đổi")
}

// Cả hai cột đều NOT NULL, nên gửi null lên là 400 — không phải lặng lẽ ghi
// chuỗi rỗng. Tristate phân biệt được "vắng mặt" với "null", và đây là chỗ sự
// phân biệt đó có ích.
func TestNoteTemplatePatchNullReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	created := createTpl(t, srv.URL, tokenA, "A", "<p>x</p>")
	path := srv.URL + tplPath + "/" + itoa(created.ID)

	for name, body := range map[string]string{
		"name null":      `{"name":null}`,
		"body_html null": `{"body_html":null}`,
	} {
		t.Run(name, func(t *testing.T) {
			resp, _ := do(t, http.MethodPatch, path, tokenA, body)
			require.Equal(t, http.StatusBadRequest, resp.StatusCode)
		})
	}
}

func TestNoteTemplateBadIDReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	resp, _ := do(t, http.MethodPatch, srv.URL+tplPath+"/khong-phai-so", tokenA, `{"name":"x"}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestNoteTemplateDelete(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	created := createTpl(t, srv.URL, tokenA, "A", "<p>x</p>")

	resp, _ := do(t, http.MethodDelete, srv.URL+tplPath+"/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusOK, resp.StatusCode)

	again, _ := do(t, http.MethodDelete, srv.URL+tplPath+"/"+itoa(created.ID), tokenA, "")
	require.Equal(t, http.StatusNotFound, again.StatusCode)
}

func TestNoteTemplateReorder(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	a := createTpl(t, srv.URL, tokenA, "A", "<p>a</p>")
	b := createTpl(t, srv.URL, tokenA, "B", "<p>b</p>")

	resp, _ := do(t, http.MethodPut, srv.URL+tplPath+"/order", tokenA,
		`{"ids":[`+itoa(b.ID)+`,`+itoa(a.ID)+`]}`)
	require.Equal(t, http.StatusOK, resp.StatusCode)

	_, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")
	var list []tplRow
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Equal(t, []string{"B", "A"}, []string{list[0].Name, list[1].Name})
}

func TestNoteTemplateHandlerReorderIDSetMismatchReturns400(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)
	a := createTpl(t, srv.URL, tokenA, "A", "<p>a</p>")
	createTpl(t, srv.URL, tokenA, "B", "<p>b</p>")

	resp, _ := do(t, http.MethodPut, srv.URL+tplPath+"/order", tokenA,
		`{"ids":[`+itoa(a.ID)+`]}`)

	require.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

// Cốt lõi của mô hình quyền: mượn id của người khác trả 404, KHÔNG phải 403.
// 403 tự nó xác nhận "mẫu này có tồn tại", tức là một kênh rò rỉ.
func TestNoteTemplateOtherUsersTemplateReturns404(t *testing.T) {
	srv, tokenA, tokenB := twoUserServer(t)
	created := createTpl(t, srv.URL, tokenA, "A", "<p>x</p>")
	path := srv.URL + tplPath + "/" + itoa(created.ID)

	t.Run("PATCH", func(t *testing.T) {
		resp, _ := do(t, http.MethodPatch, path, tokenB, `{"name":"cướp"}`)
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
	t.Run("DELETE", func(t *testing.T) {
		resp, _ := do(t, http.MethodDelete, path, tokenB, "")
		require.Equal(t, http.StatusNotFound, resp.StatusCode)
	})
	t.Run("GET danh sách của B không thấy mẫu của A", func(t *testing.T) {
		_, env := do(t, http.MethodGet, srv.URL+tplPath, tokenB, "")
		require.JSONEq(t, `[]`, string(env.Data))
	})

	// Và mẫu của A vẫn còn nguyên sau mọi lượt tấn công ở trên.
	_, env := do(t, http.MethodGet, srv.URL+tplPath, tokenA, "")
	var list []tplRow
	require.NoError(t, json.Unmarshal(env.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, "A", list[0].Name)
}

// Checklist THẬT của chủ sản phẩm (spec §1/§8.4) đi trọn vòng qua HTTP +
// Postgres thật. Đây là phần quan trọng nhất của Task 5: nếu data-list hay ký
// tự ≥ bị biến dạng ở bất kỳ tầng nào, mẫu chèn ra sẽ không tick được.
func TestNoteTemplateRealChecklistRoundTrip(t *testing.T) {
	srv, tokenA, _ := twoUserServer(t)

	body := `<p><strong>HTF PDA - FVG - H1</strong></p>` +
		`<ol>` +
		`<li data-list="unchecked">Asia/London BSL/SSL liquidity - M15 Minor BSL</li>` +
		`<li data-list="unchecked">Liquidity sweep</li>` +
		`<li data-list="unchecked">DOL rõ</li>` +
		`<li data-list="unchecked">NQ/ES SMT</li>` +
		`<li data-list="unchecked">Reclaim</li>` +
		`<li data-list="unchecked">Displacement</li>` +
		`<li data-list="unchecked">Venom</li>` +
		`<li data-list="unchecked">Entry model</li>` +
		`<li data-list="unchecked">≥2R</li>` +
		`</ol>` +
		`<p>Link trade:</p><p>H1: </p><p>M15: </p><p>M1: </p>`

	payload, err := json.Marshal(map[string]string{
		"name": "HTF PDA - FVG - H1", "body_html": body,
	})
	require.NoError(t, err)

	resp, env := do(t, http.MethodPost, srv.URL+"/api/note-templates", tokenA, string(payload))
	require.Equal(t, http.StatusOK, resp.StatusCode, "body: %s", env.Data)

	var created struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		BodyHTML string `json:"body_html"`
		Position int    `json:"position"`
	}
	require.NoError(t, json.Unmarshal(env.Data, &created))
	require.Equal(t, 1, created.Position)
	require.Equal(t, body, created.BodyHTML, "body_html phải về NGUYÊN VẸN")

	// Và đọc lại từ DB cũng phải nguyên vẹn, không chỉ echo của lượt ghi.
	_, listEnv := do(t, http.MethodGet, srv.URL+"/api/note-templates", tokenA, "")
	var list []struct {
		Name     string `json:"name"`
		BodyHTML string `json:"body_html"`
	}
	require.NoError(t, json.Unmarshal(listEnv.Data, &list))
	require.Len(t, list, 1)
	require.Equal(t, body, list[0].BodyHTML)
	require.Contains(t, list[0].BodyHTML, `data-list="unchecked"`)
	require.Contains(t, list[0].BodyHTML, "≥2R")
	require.Contains(t, list[0].BodyHTML, "DOL rõ")
	require.Equal(t, "HTF PDA - FVG - H1", list[0].Name)
}
