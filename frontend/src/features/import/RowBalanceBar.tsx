
/**
 * Thanh cân dòng: ba con số của một lần soát file, vẽ thành một dải theo
 * ĐÚNG TỶ LỆ.
 *
 * Vì sao có nó: ba con số rời (đọc được / lỗi / bỏ qua) bắt người ta tự nhẩm
 * "12 lỗi trên 400 dòng là nhiều hay ít". Dải tỷ lệ trả lời câu đó trước khi
 * mắt kịp đọc chữ số — một vạch đỏ mảnh trên nền teal là "gần xong, sửa vài
 * dòng", còn nửa đỏ là "file sai định dạng, đừng sửa từng ô".
 *
 * Dùng đúng ngữ pháp màu của app: teal `--primary` là phần lành, đỏ
 * `--status-error` là phần hỏng — cùng cặp màu mà mọi trang khác dùng cho
 * lãi/lỗ, nên không phải học lại. Dòng bỏ qua lấy màu trung tính vì nó không
 * phải lỗi, chỉ là dòng trống.
 *
 * Không có `aria-*` mô tả tỷ lệ: ba con số đã nằm ngay dưới dưới dạng chữ ở
 * StatGrid, nên dải này là hình minh hoạ cho chúng — đánh dấu `aria-hidden`
 * để trình đọc màn hình không đọc cùng một dữ liệu hai lần.
 */
export function RowBalanceBar({
  valid,
  errors,
  skipped,
}: {
  valid: number;
  errors: number;
  skipped: number;
}) {
  const total = valid + errors + skipped;
  if (total === 0) return null;

  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    // Không có nhãn riêng: thanh nằm ngay trên ba ô chỉ số đã mang đủ nhãn
    // ("Số dòng đọc được" / "Dòng lỗi" / "Dòng bỏ qua"), nên một dòng eyebrow
    // nữa chỉ lặp lại điều mắt vừa đọc.
    <div
      aria-hidden
      className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
    >
      {valid > 0 && <span style={{ width: pct(valid) }} className="bg-primary" />}
      {errors > 0 && <span style={{ width: pct(errors) }} className="bg-[var(--status-error)]" />}
      {skipped > 0 && (
        <span style={{ width: pct(skipped) }} className="bg-[var(--border-default)]" />
      )}
    </div>
  );
}
