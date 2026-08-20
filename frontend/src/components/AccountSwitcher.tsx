import { Label } from "@/components/ui/label";
import { useActiveAccount } from "@/features/accounts/activeAccount";

export function AccountSwitcher() {
  const { account, accounts, choose } = useActiveAccount();
  if (accounts.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 px-2">
      <Label htmlFor="account-switcher" className="text-xs">
        Tài khoản đang xem
      </Label>
      <select
        id="account-switcher"
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        value={account?.id ?? ""}
        onChange={(e) => choose(+e.target.value)}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code}
          </option>
        ))}
      </select>
    </div>
  );
}
