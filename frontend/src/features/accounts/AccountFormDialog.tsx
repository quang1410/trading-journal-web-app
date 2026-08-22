import { Alert, AlertDescription } from "@/components/ui/alert";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { compareDecimal, fractionFromPercent, percentFromFraction } from "@/lib/decimal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateAccount, useUpdateAccount } from "./hooks";
import type { Account, AccountCreate, AccountPatch } from "./types";

// Kiểm số dương mà KHÔNG dùng Number: một chuỗi chữ số hợp lệ và có ít nhất
// một chữ số khác 0.
const laSoDuong = (v: string) => /^\d*\.?\d+$/.test(v.trim()) && /[1-9]/.test(v);

// Mọi thông điệp dưới đây khớp ràng buộc thật của backend
// (service/account.go). Chặn ở client là để phản hồi nhanh, không phải thay.
const schema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "mã tài khoản không được để trống")
    .max(32, "mã tài khoản dài quá 32 ký tự"),
  name: z.string().trim(),
  currency: z
    .string()
    .trim()
    .min(1, "đơn vị tiền tệ không được để trống")
    .max(8, "đơn vị tiền tệ dài quá 8 ký tự"),
  timezone: z.string().min(1, "timezone không được để trống"),
  initial_balance: z.string().refine(laSoDuong, "vốn ban đầu phải lớn hơn 0"),
  risk_percent: z
    .string()
    .refine(laSoDuong, "rủi ro mỗi lệnh phải lớn hơn 0")
    .refine((v) => compareDecimal(v, "100") <= 0, "rủi ro mỗi lệnh không được vượt quá 100%"),
});

type Fields = z.infer<typeof schema>;

// Danh sách IANA lấy thẳng từ trình duyệt, không cần thư viện.
const MUI_GIO: string[] =
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["Asia/Ho_Chi_Minh", "UTC"];

const MAC_DINH: Fields = {
  code: "",
  name: "",
  currency: "USD",
  timezone: "Asia/Ho_Chi_Minh",
  initial_balance: "",
  risk_percent: "1",
};

function tuAccount(a: Account): Fields {
  return {
    code: a.code,
    name: a.name,
    currency: a.currency,
    timezone: a.timezone,
    initial_balance: a.initial_balance,
    risk_percent: percentFromFraction(a.risk_per_trade),
  };
}

export function AccountFormDialog({ account }: { account?: Account }) {
  const [mo, setMo] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const taoMoi = useCreateAccount();
  const capNhat = useUpdateAccount();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<Fields>({
    resolver: zodResolver(schema),
    defaultValues: account ? tuAccount(account) : MAC_DINH,
  });

  async function gui(v: Fields) {
    setLoi(null);
    try {
      if (account) {
        // Chỉ gửi field đã đổi: PATCH của backend dùng con trỏ, khoá vắng
        // mặt nghĩa là "không đổi". Gửi cả bảng biến một lần sửa tên thành
        // một lần ghi đè toàn bộ.
        const patch: AccountPatch = {};
        if (dirtyFields.code) patch.code = v.code.trim();
        if (dirtyFields.name) patch.name = v.name.trim();
        if (dirtyFields.currency) patch.currency = v.currency.trim();
        if (dirtyFields.timezone) patch.timezone = v.timezone;
        if (dirtyFields.initial_balance) patch.initial_balance = v.initial_balance.trim();
        if (dirtyFields.risk_percent)
          patch.risk_per_trade = fractionFromPercent(v.risk_percent.trim());
        await capNhat.mutateAsync({ id: account.id, patch });
      } else {
        const body: AccountCreate = {
          code: v.code.trim(),
          name: v.name.trim(),
          currency: v.currency.trim(),
          timezone: v.timezone,
          initial_balance: v.initial_balance.trim(),
          risk_per_trade: fractionFromPercent(v.risk_percent.trim()),
        };
        await taoMoi.mutateAsync(body);
      }
      setMo(false);
      reset(account ? undefined : MAC_DINH);
    } catch (e) {
      setLoi(e instanceof ApiError ? e.msg : "không kết nối được máy chủ");
    }
  }

  return (
    <Dialog open={mo} onOpenChange={setMo}>
      <DialogTrigger asChild>
        <Button variant={account ? "outline" : "default"} size={account ? "sm" : "default"}>
          {account ? `Sửa ${account.code}` : "Thêm tài khoản"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Sửa tài khoản" : "Thêm tài khoản"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(gui)} className="flex flex-col gap-3" noValidate>
          <O ten="code" nhan="Mã tài khoản" loi={errors.code?.message} dangKy={register("code")} />
          <O ten="name" nhan="Tên" loi={errors.name?.message} dangKy={register("name")} />
          <O
            ten="currency"
            nhan="Đơn vị tiền tệ"
            loi={errors.currency?.message}
            dangKy={register("currency")}
          />
          <O
            ten="initial_balance"
            nhan="Vốn ban đầu"
            loi={errors.initial_balance?.message}
            dangKy={register("initial_balance")}
          />
          <O
            ten="risk_percent"
            nhan="Rủi ro mỗi lệnh (%)"
            loi={errors.risk_percent?.message}
            dangKy={register("risk_percent")}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timezone">Múi giờ</Label>
            {/* NGOẠI LỆ CÓ CHỦ Ý: ô này giữ <select> native trong khi hai ô
                chọn khác của dự án đã đổi sang Select của shadcn.
                Intl.supportedValuesOf("timeZone") trả về 417 mục; Radix Select
                dựng cả 417 node vào DOM mỗi lần mở, còn <select> native thì
                trình duyệt lo. Đừng "dọn nốt" chỗ này. */}
            <select
              id="timezone"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("timezone")}
            >
              {MUI_GIO.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Đổi múi giờ sẽ tính lại cách gom nhóm theo ngày, tuần, tháng của toàn bộ lịch sử.
            </p>
          </div>

          {loi && (
            <Alert variant="destructive">
              <AlertDescription>{loi}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit">Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function O({
  ten,
  nhan,
  loi,
  dangKy,
}: {
  ten: string;
  nhan: string;
  loi?: string;
  dangKy: UseFormRegisterReturn;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={ten}>{nhan}</Label>
      <Input id={ten} {...dangKy} />
      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}
    </div>
  );
}
