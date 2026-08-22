import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, readStoredTheme, storeTheme, type Theme } from "@/lib/theme";
import { useI18n } from "@/i18n";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const { t } = useI18n();

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const sangTiepTheo = theme === "dark";
  const nhan = sangTiepTheo ? t("nav.themeLight") : t("nav.themeDark");

  return (
    // Biểu tượng thay cho chữ, nhưng tên khả truy cập giữ nguyên câu chữ đầy
    // đủ: nút này ngồi ở chân sidebar rộng 240px cùng nút Đăng xuất, và hai
    // nút có chữ thì cái thứ hai bị đẩy tràn ra ngoài mép.
    <Button
      variant="ghost"
      size="icon"
      className="size-8 text-muted-foreground"
      aria-label={nhan}
      title={nhan}
      onClick={() => setTheme(sangTiepTheo ? "light" : "dark")}
    >
      {sangTiepTheo ? (
        <SunIcon aria-hidden className="size-4" />
      ) : (
        <MoonIcon aria-hidden className="size-4" />
      )}
    </Button>
  );
}
