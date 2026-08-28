import type { UseFormRegisterReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Một ô nhập có nhãn và chỗ báo lỗi.
 *
 * TradeFormDialog và AccountFormDialog từng khai bản riêng gần như y hệt, còn
 * CashFlowPanel vẫn còn nội tuyến cùng khuôn đó (chưa chuyển sang Field).
 * `role="alert"` là hợp đồng trợ năng: lỗi phải được đọc lên khi nó xuất hiện,
 * và để ở đây thì không ô nào quên được.
 */
export function Field({
  name,
  label,
  errorMsg,
  register,
  kind = "text",
}: {
  name: string;
  label: string;
  errorMsg?: string;
  register: UseFormRegisterReturn;
  kind?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={kind} aria-invalid={Boolean(errorMsg)} {...register} />
      {errorMsg && (
        <p role="alert" className="text-sm text-destructive">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
