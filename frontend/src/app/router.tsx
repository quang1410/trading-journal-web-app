import { Navigate, Route, Routes } from "react-router";
import { AppShell } from "./AppShell";
import { OnlyAnon, RequireAuth } from "@/features/auth/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { AccountsPage } from "@/features/accounts/AccountsPage";

export function AppRoutes() {
  return (
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
      </Route>

      <Route path="*" element={<Navigate to="/accounts" replace />} />
    </Routes>
  );
}
