/**
 * Chiếu các field ĐÃ ĐỔI của form thành body cho PATCH.
 *
 * PATCH của backend dùng con trỏ: khoá vắng mặt nghĩa là "không đổi". Gửi cả
 * bảng biến một lần sửa tên thành một lần ghi đè toàn bộ.
 *
 * Trước đây mỗi form tự viết một dãy `if (dirtyFields.X) patch.X = ...` —
 * AccountFormDialog 6 dòng, TradeFormDialog 16 dòng. Đó là chỗ nguy hiểm nhất
 * của cả form: quên MỘT dòng thì field đó lặng lẽ không bao giờ lưu, không có
 * lỗi nào bật ra. Gom vào một hàm THUẦN thì nó test được mà không cần dựng
 * dialog, gõ phím, rồi submit.
 *
 * `bien` cho phép đổi hình field trước khi gửi (trim, phần trăm -> phân số) và
 * cả đổi TÊN khoá — risk_percent của form là risk_per_trade của API.
 */
export type Transforms<F, P> = {
  [K in keyof F]?: (v: F[K]) => { key: keyof P; value: P[keyof P] };
};

export function patchFromDirty<F extends object, P extends object>(
  dirtyFields: Partial<Record<keyof F, unknown>>,
  values: F,
  transforms: Transforms<F, P>,
): P {
  const patch = {} as P;

  for (const key of Object.keys(transforms) as (keyof F)[]) {
    // dirtyFields của react-hook-form chỉ có mặt khoá khi field đã đổi, và
    // giá trị là `true` (hoặc cây con với field lồng nhau). Ép về boolean chứ
    // không so với true: cây con là object, vẫn nghĩa là "đã đổi".
    if (!dirtyFields[key]) continue;
    const f = transforms[key];
    if (!f) continue;
    const { key: outKey, value } = f(values[key]);
    patch[outKey] = value;
  }

  return patch;
}
