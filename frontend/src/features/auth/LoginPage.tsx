import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "./AuthProvider";
import { CredentialsForm, type Credentials } from "./CredentialsForm";

export function LoginPage() {
  const { login } = useAuth();
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function gui(v: Credentials) {
    setLoi(null);
    setDangGui(true);
    try {
      await login(v.email, v.password);
      // Không tự điều hướng: status chuyển sang "authed" và OnlyAnon trong
      // router lo việc đó. Một luật, một nơi.
    } catch (e) {
      setLoi(e instanceof ApiError ? e.msg : "không kết nối được máy chủ");
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* h1 thẳng, không bọc CardTitle asChild: CardTitle của shadcn là
              một <div> thường, không dựng trên Slot, nên asChild sẽ hỏng. */}
          <h1 className="text-lg font-semibold">Đăng nhập</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CredentialsForm nhanNut="Đăng nhập" dangGui={dangGui} loi={loi} onSubmit={gui} />
          <p className="text-sm text-muted-foreground">
            Chưa có tài khoản?{" "}
            <Link to="/register" className="text-primary underline">
              Đăng ký
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
