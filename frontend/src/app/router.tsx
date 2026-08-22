import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./AppShell";
import { OnlyAnon, RequireAuth } from "@/features/auth/RequireAuth";
import { useI18n } from "@/i18n";

// Mỗi trang là một chunk riêng.
//
// Gộp hết vào một bó làm người mới vào /login phải tải cả react-hook-form,
// zod, @hookform/resolvers và dayjs — toàn bộ đồ nghề của form nhập lệnh —
// trước khi thấy được hai ô email/mật khẩu. Chia ở ranh giới route là chỗ
// rẻ nhất: React Router đã tự dựng ranh giới đó rồi.
//
// `.then` để đổi named export thành default: lazy() chỉ nhận default.
const LoginPage = lazy(() =>
  import("@/features/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const RegisterPage = lazy(() =>
  import("@/features/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const AccountsPage = lazy(() =>
  import("@/features/accounts/AccountsPage").then((m) => ({ default: m.AccountsPage })),
);
const TradesPage = lazy(() =>
  import("@/features/trades/TradesPage").then((m) => ({ default: m.TradesPage })),
);
const TrashPage = lazy(() =>
  import("@/features/trades/TrashPage").then((m) => ({ default: m.TrashPage })),
);

export function AppRoutes() {
  const { t } = useI18n();
  return (
    // Một Suspense cho cả cây route. Fallback dùng đúng role="status" và đúng
    // câu chữ như lúc trang đang tải dữ liệu, nên khoảnh khắc "đang lấy
    // chunk" không tự giới thiệu mình là một trạng thái thứ hai.
      <Suspense fallback={<p role="status">{t("common.loading")}</p>}>
      <Routes>
        <Route
          path="/login"
          element={
            <OnlyAnon>
              <LoginPage />
            </OnlyAnon>
          }
        />
        <Route
          path="/register"
          element={
            <OnlyAnon>
              <RegisterPage />
            </OnlyAnon>
          }
        />

        {/* Route layout: guard chạy MỘT lần cho cả nhánh, Phase 3 và 4 chỉ
            cần thêm <Route> con vào đây. */}
        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/trades" element={<TradesPage />} />
          <Route path="/trades/trash" element={<TrashPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/accounts" replace />} />
      </Routes>
    </Suspense>
  );
}
