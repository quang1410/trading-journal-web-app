import { Navigate, Route, Routes } from "react-router";
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
      <Route
        path="/accounts"
        element={
          <RequireAuth>
            <AccountsPage />
          </RequireAuth>
        }
      />
      {/* 2b chưa có dashboard, nên gốc đi thẳng vào accounts. */}
      <Route path="*" element={<Navigate to="/accounts" replace />} />
    </Routes>
  );
}
