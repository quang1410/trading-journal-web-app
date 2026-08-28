import { useRef, useState } from "react";
import { Link } from "react-router";
import { AccountGate, ErrorBlock } from "@/components/AccountGate";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/features/accounts/types";
import { useI18n } from "@/i18n";
import { useImportCommit, useImportPreview } from "./hooks";
import { PreviewTable } from "./PreviewTable";

export function ImportPage() {
  return <AccountGate>{(account) => <NhapFile account={account} />}</AccountGate>;
}

/**
 * Ba bước, đúng thứ tự: chọn file → xem trước → xác nhận.
 *
 * File được giữ lại trong state sau bước xem trước để bước xác nhận gửi lại
 * CHÍNH file đó. Đọc lại từ input lúc bấm nút thì người dùng có thể đã đổi
 * file trong lúc đọc bảng preview, và cái được ghi sẽ không phải cái vừa xem.
 */
function NhapFile({ account }: { account: Account }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = useImportPreview(account.id);
  const commit = useImportCommit(account.id);

  function chonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    // Chọn file mới thì kết quả ghi của file cũ không còn nghĩa gì.
    commit.reset();
    preview.reset();
    if (f) preview.mutate(f);
  }

  const baoCao = preview.data;
  const coLoi = (baoCao?.errors.length ?? 0) > 0;
  const khongCoDong = baoCao != null && baoCao.valid === 0;
  const dangChay = preview.isPending || commit.isPending;
  // Chỉ cho ghi khi đã xem trước xong, file sạch, và có dòng để ghi.
  const choPhepNhap = baoCao != null && !coLoi && !khongCoDong && !dangChay && file != null;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-0.5">
        <span className="eyebrow">{account.code}</span>
        <h1 className="text-xl font-semibold tracking-tight">{t("import.title")}</h1>
      </header>

      <p className="text-sm text-muted-foreground">{t("import.intro")}</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="file-csv">{t("import.chooseFile")}</Label>
        <Input
          id="file-csv"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={chonFile}
          disabled={dangChay}
        />
        <p className="text-xs text-muted-foreground">{t("import.directionHint")}</p>
      </div>

      {preview.isPending && <p role="status">{t("import.checking")}</p>}
      {preview.error && <ErrorBlock error={preview.error} />}
      {commit.error && <ErrorBlock error={commit.error} />}

      {baoCao && !commit.data && (
        <div className="flex flex-col gap-4">
          <dl className="flex flex-wrap gap-6 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("import.validRows")}</dt>
              <dd className="font-mono text-lg tabular-nums">{baoCao.valid}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("import.errorRows")}</dt>
              <dd
                className={`font-mono text-lg tabular-nums ${
                  coLoi ? "text-[var(--status-error)]" : ""
                }`}
              >
                {baoCao.errors.length}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground">{t("import.skippedRows")}</dt>
              <dd className="font-mono text-lg tabular-nums">{baoCao.skipped}</dd>
            </div>
          </dl>

          {coLoi && <PreviewTable errors={baoCao.errors} />}
          {coLoi && (
            <Alert variant="destructive">
              <AlertDescription>{t("import.blockedByErrors")}</AlertDescription>
            </Alert>
          )}
          {khongCoDong && !coLoi && (
            <Alert>
              <AlertDescription>{t("import.nothingToImport")}</AlertDescription>
            </Alert>
          )}

          <p className="text-xs text-muted-foreground">{t("import.addsOnly")}</p>

          <div>
            <Button
              type="button"
              disabled={!choPhepNhap}
              onClick={() => file && commit.mutate(file)}
            >
              {commit.isPending ? t("import.importing") : t("import.confirm")}
            </Button>
          </div>
        </div>
      )}

      {commit.data?.committed && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              {t("import.done")}: {commit.data.valid} {t("import.doneCount")}
            </span>
            <Link to="/trades" className="text-primary underline underline-offset-4">
              {t("import.viewTrades")}
            </Link>
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}
