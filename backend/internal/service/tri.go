package service

import "encoding/json"

// Tri là một trường của PATCH với BA trạng thái, không phải hai:
//
//	Set=false            khoá vắng mặt trong body → giữ nguyên giá trị cũ
//	Set=true, Value=nil  khoá có mặt mang null    → xoá giá trị (về NULL)
//	Set=true, Value≠nil  khoá có mặt mang giá trị → đặt giá trị
//
// Con trỏ thường chỉ diễn đạt được hai trạng thái đầu, nên với bốn cột
// NULLable của bảng trades (entry, exit, volume, profit_theory) nó không đủ:
// "đừng đụng vào" và "xoá đi" sẽ trông y hệt nhau.
//
// encoding/json chỉ gọi UnmarshalJSON cho khoá CÓ MẶT trong body, nên Set
// đúng bằng "khoá có mặt" mà không cần đọc body hai lần.
type Tri[T any] struct {
	Set   bool
	Value *T
}

func (t *Tri[T]) UnmarshalJSON(b []byte) error {
	t.Set = true
	if string(b) == "null" {
		t.Value = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	t.Value = &v
	return nil
}

// Get trả giá trị và cờ "có gửi lên không". Dùng nó thay vì đọc thẳng hai
// trường, để chỗ gọi buộc phải xử lý cả ba trạng thái.
func (t Tri[T]) Get() (*T, bool) {
	return t.Value, t.Set
}
