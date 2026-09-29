import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { CashFlowPanel } from "./CashFlowPanel";
import type { Account } from "./types";

/**
 * Nạp/rút của MỘT account, mở từ hàng của nó.
 *
 * Trước đây panel treo dưới bảng và luôn thuộc account đang chọn ở sidebar —
 * muốn nạp cho account khác phải đổi account toàn app trước. Panel bên phải
 * gắn thẳng vào hàng nên không còn bước đó.
 *
 * Chỉ mount CashFlowPanel khi mở: mỗi panel gọi /cash-flows, và một trang
 * mười account không cần mười request cho mười panel đang đóng.
 */
export function CashFlowSheet({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={t("accounts.cashFlowLabel", { code: account.code })}
        onClick={() => setOpen(true)}
      >
        {t("accounts.cashFlow")}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          aria-describedby={undefined}
          className="w-full gap-4 overflow-y-auto bg-surface-modal p-6 sm:max-w-xl"
        >
          <SheetTitle>{t("cashflow.title", { code: account.code })}</SheetTitle>
          {open && <CashFlowPanel account={account} showTitle={false} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
