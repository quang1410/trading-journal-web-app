import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { CheckIcon } from "lucide-react";
import { AccountGate, ErrorBlock } from "@/components/AccountGate";
import { StatGrid, StatTile } from "@/components/StatTile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Account } from "@/features/accounts/types";
import { useI18n } from "@/i18n";
import { FileDropzone } from "./FileDropzone";
import { RowBalanceBar } from "./RowBalanceBar";
import { useImportCommit, useImportPreview } from "./hooks";
import { PreviewDataTable } from "./PreviewDataTable";
import { PreviewTable } from "./PreviewTable";

export function ImportPage() {
  return <AccountGate>{(account) => <ImportForm account={account} />}</AccountGate>;
}

/**
 * Một bước trong ba bước của trang.
 *
 * Đánh số ở đây là CÓ NGHĨA chứ không phải trang trí: chọn → soát → ghi là
 * trình tự thật, không đảo được, và bước sau chỉ mở ra khi bước trước xong.
 * Con số cũng là chỉ báo trạng thái — bước đã qua đổi thành dấu tích, nên
 * người dùng nhìn cột số là biết mình đang đứng đâu.
 */
function Step({
  n,
  title,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`import-step-${n}`}
      className={`flex gap-4 px-4 py-5 ${active || done ? "" : "opacity-55"}`}
    >
      <span
        aria-hidden
        className={[
          "num flex size-6 flex-none items-center justify-center rounded-full",
          "border text-[11px] font-medium",
          done
            ? "border-primary bg-primary text-[var(--color-white)]"
            : active
              ? "border-primary text-primary"
              : "border-[var(--border-default)] text-[var(--text-muted)]",
        ].join(" ")}
      >
        {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : n}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h2 id={`import-step-${n}`} className="eyebrow">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

/**
 * Ba bước, đúng thứ tự: chọn file → xem trước → xác nhận.
 *
 * File được giữ lại trong state sau bước xem trước để bước xác nhận gửi lại
 * CHÍNH file đó. Đọc lại từ input lúc bấm nút thì người dùng có thể đã đổi
 * file trong lúc đọc bảng preview, và cái được ghi sẽ không phải cái vừa xem.
 */
function ImportForm({ account }: { account: Account }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);

  const preview = useImportPreview(account.id);
  const commit = useImportCommit(account.id);

  function onFileChange(f: File | null) {
    setFile(f);
    // Chọn file mới thì kết quả ghi của file cũ không còn nghĩa gì.
    commit.reset();
    preview.reset();
    if (f) preview.mutate(f);
  }

  const report = preview.data;
  // Backend trả `null` khi không có dòng nào đọc được.
  const previewRows = report?.preview ?? [];
  const hasErrors = (report?.errors.length ?? 0) > 0;
  const hasNoRows = report != null && report.valid === 0;
  const isBusy = preview.isPending || commit.isPending;
  // Giữ cả object chứ không chỉ cờ boolean: nhánh "đã xong" cần đọc
  // `committed.valid`, và một cờ rời không hẹp được kiểu của `commit.data`.
  const committed = commit.data?.committed === true ? commit.data : null;
  // Chỉ cho ghi khi đã xem trước xong, file sạch, và có dòng để ghi.
  const canCommit = report != null && !hasErrors && !hasNoRows && !isBusy && file != null;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-0.5">
        <span className="eyebrow">{account.code}</span>
        <h1 className="text-xl font-semibold tracking-tight">{t("import.title")}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t("import.intro")}</p>
      </header>

      {/* Ba bước trong MỘT khối có vạch ngăn, cùng ngữ pháp với StatGrid của
          /trades: `gap-px` trên nền `bg-border`, mỗi bước tự vẽ nền của mình.
          Theme tắt hết shadow nên phân tầng bằng đúng border và bậc surface. */}
      <div className="overflow-hidden rounded-md border border-border bg-border">
        <div className="flex flex-col gap-px">
          <div className="bg-card">
            <Step n={1} title={t("import.step1")} done={file != null} active>
              {/* Nhãn sr-only: tiêu đề bước đã nói "Chọn file", nhưng input
                  vẫn cần nhãn riêng của nó cho trình đọc màn hình và cho
                  getByLabelText của test. */}
              <Label htmlFor="file-csv" className="sr-only">
                {t("import.chooseFile")}
              </Label>
              <FileDropzone
                id="file-csv"
                fileName={file?.name ?? null}
                disabled={isBusy}
                onFile={onFileChange}
              />
              <p className="text-xs text-muted-foreground">{t("import.directionHint")}</p>
            </Step>
          </div>

          <div className="bg-card">
            <Step
              n={2}
              title={t("import.step2")}
              done={report != null && !hasErrors && !hasNoRows}
              active={file != null}
            >
              {preview.isPending && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t("import.checking")}
                </p>
              )}
              {preview.error && <ErrorBlock error={preview.error} />}

              {report == null && !preview.isPending && !preview.error && (
                <p className="text-sm text-muted-foreground">{t("import.stepWaiting")}</p>
              )}

              {report && (
                <div className="flex flex-col gap-4">
                  <RowBalanceBar
                    valid={report.valid}
                    errors={report.errors.length}
                    skipped={report.skipped}
                  />

                  <StatGrid col="grid-cols-3">
                    <StatTile label={t("import.validRows")}>
                      <span className="num text-lg font-medium text-primary">{report.valid}</span>
                    </StatTile>
                    <StatTile label={t("import.errorRows")}>
                      <span
                        className={`num text-lg font-medium ${
                          hasErrors ? "text-[var(--status-error)]" : "text-muted-foreground"
                        }`}
                      >
                        {report.errors.length}
                      </span>
                    </StatTile>
                    <StatTile label={t("import.skippedRows")}>
                      <span className="num text-lg font-medium text-muted-foreground">
                        {report.skipped}
                      </span>
                    </StatTile>
                  </StatGrid>

                  {/*
                    Bảng lỗi đứng TRƯỚC bảng dữ liệu: khi file có lỗi thì việc
                    cần làm là đi sửa file, và thứ trả lời "sửa ở đâu" phải ở
                    gần con số "5 dòng lỗi" mà mắt vừa đọc. Dữ liệu xem trước
                    là bước sau đó — nó trả lời "cái sẽ ghi có đúng không".
                  */}
                  {hasErrors && (
                    <div className="flex flex-col gap-2">
                      <PreviewTable errors={report.errors} />
                      {/* Cảnh báo dính liền bảng lỗi mà nó nói tới. Đẩy xuống
                          dưới bảng dữ liệu thì câu "sửa các dòng trên" trỏ vào
                          một bảng khác hẳn với bảng người dùng vừa đọc. */}
                      <Alert variant="destructive">
                        <AlertDescription>{t("import.blockedByErrors")}</AlertDescription>
                      </Alert>
                    </div>
                  )}

                  {previewRows.length > 0 && (
                    <PreviewDataTable
                      rows={previewRows}
                      totalValid={report.valid}
                      currency={account.currency}
                    />
                  )}
                  {hasNoRows && !hasErrors && (
                    <Alert>
                      <AlertDescription>{t("import.nothingToImport")}</AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </Step>
          </div>

          <div className="bg-card">
            <Step n={3} title={t("import.step3")} done={committed != null} active={canCommit || committed != null}>
              {commit.error && <ErrorBlock error={commit.error} />}

              {committed ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm">
                    {t("import.done")}:{" "}
                    <span className="num font-medium">{committed.valid}</span>{" "}
                    {t("import.doneCount")}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button asChild size="sm">
                      <Link to="/trades">{t("import.viewTrades")}</Link>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onFileChange(null)}
                    >
                      {t("import.importAnother")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-muted-foreground">
                    {canCommit ? t("import.readyToWrite") : t("import.stepWaiting")}
                  </p>
                  <div>
                    {/* Chưa ghi được thì để nút ở dạng viền, không phải nền
                        teal đặc mờ đi. Button chung của app chỉ giảm opacity
                        khi disabled, nên một nút primary mờ vẫn đọc ra là "nút
                        chính, sắp bấm được" — trong khi ý cần nói là "chưa". */}
                    <Button
                      type="button"
                      variant={canCommit ? "default" : "outline"}
                      disabled={!canCommit}
                      onClick={() => file && commit.mutate(file)}
                    >
                      {commit.isPending ? t("import.importing") : t("import.confirm")}
                    </Button>
                  </div>
                </div>
              )}
            </Step>
          </div>
        </div>
      </div>

      <p className="max-w-prose text-xs text-muted-foreground">{t("import.addsOnly")}</p>
    </section>
  );
}
