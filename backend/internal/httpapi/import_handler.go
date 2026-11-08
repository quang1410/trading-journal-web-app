package httpapi

import (
	"errors"
	"net/http"

	"journal/internal/apperr"
	"journal/internal/service"
)

type ImportHandler struct{ svc *service.ImportService }

// maxMultipartMem là phần multipart giữ trong RAM; phần dư ra ghi tạm xuống
// đĩa. Trần THẬT của file là service.MaxImportBytes — con số này chỉ quyết
// định ranh giới RAM/đĩa.
const maxMultipartMem = 1 << 20

// multipartOverhead là phần dư cho lớp bọc multipart (boundary, header của
// part, tên file) quanh nội dung file. Trần của FILE là service.MaxImportBytes
// và service đếm đúng nó; ở tầng HTTP chỉ chặn body rõ ràng quá cỡ. Không có
// phần dư này thì file đúng bằng trần bị báo "vượt quá". 64 KiB vẫn giữ cả
// body dưới 4,5 MB của Vercel.
const multipartOverhead = 64 << 10

// Import nhận file CSV qua multipart, field tên "file".
//
// dry_run mặc định TRUE. Đây là quyết định an toàn có chủ ý: thiếu tham số,
// gõ sai tham số, hay client cũ chưa biết gửi tham số — tất cả đều rơi vào
// nhánh KHÔNG ghi. Mặc định ngược lại sẽ biến một lời gọi thăm dò thành một
// lần ghi thật, và chỉ lộ ra khi dữ liệu đã nằm trong DB.
func (h *ImportHandler) Import(w http.ResponseWriter, r *http.Request) {
	// Chặn ngay ở tầng HTTP để một body khổng lồ không kịp ghi ra đĩa tạm.
	// Service vẫn kiểm lần nữa: nó là nơi giữ hằng số, và nó cũng được gọi
	// từ test không đi qua HTTP.
	r.Body = http.MaxBytesReader(w, r.Body, service.MaxImportBytes+multipartOverhead)

	if err := r.ParseMultipartForm(maxMultipartMem); err != nil {
		// MaxBytesReader bật lỗi NGAY TRONG ParseMultipartForm, nên nếu không
		// tách ra thì file quá cỡ bị báo là "multipart hỏng" — người dùng đi
		// sửa cách gửi form trong khi lỗi thật là file to. Đây lại đúng là
		// tình huống hay gặp nhất: nhập cả lịch sử giao dịch từ Excel.
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			FailErr(w, r, apperr.PayloadTooLarge(service.MsgImportTooLarge))
			return
		}
		FailErr(w, r, apperr.Validation("không đọc được file gửi lên (cần multipart, field \"file\")"))
		return
	}
	// Phần vượt maxMultipartMem đã nằm ở file tạm trong os.TempDir(). net/http
	// dọn hộ trong nhiều trường hợp nhưng KHÔNG bảo đảm mọi đường thoát, nên
	// dọn tay: endpoint này không có rate limit, mỗi lần gọi bỏ lại tối đa 3MB.
	defer func() {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
	}()

	f, _, err := r.FormFile("file")
	if err != nil {
		FailErr(w, r, apperr.Validation("thiếu file: hãy gửi field \"file\" chứa nội dung CSV"))
		return
	}
	defer func() { _ = f.Close() }()

	dryRun := r.URL.Query().Get("dry_run") != "false"

	rep, err := h.svc.Import(r.Context(), Account(r.Context()), f, dryRun)
	if err != nil {
		FailErr(w, r, err)
		return
	}
	OK(w, rep)
}
