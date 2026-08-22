import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveAccount } from "@/features/accounts/activeAccount";

export function AccountSwitcher() {
  const { account, accounts, choose } = useActiveAccount();
  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      <Label htmlFor="account-switcher" className="text-xs">
        Tài khoản đang xem
      </Label>
      {/* Giá trị của Radix Select là CHUỖI, còn id account là số. Đổi qua lại
          ở đúng ranh giới này, và dùng +v vì chuỗi đó là id chính mình vừa
          phát ra ở thuộc tính value bên dưới, không phải dữ liệu lạ. */}
      <Select value={account ? String(account.id) : ""} onValueChange={(v) => choose(+v)}>
        <SelectTrigger id="account-switcher" className="w-full">
          <SelectValue placeholder="Chọn tài khoản" />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
