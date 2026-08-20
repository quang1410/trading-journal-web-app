import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "./AuthProvider";
import { CredentialsForm, type Credentials } from "./CredentialsForm";

export function RegisterPage() {
  const { register } = useAuth();
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  async function gui(v: Credentials) {
    setLoi(null);
    setDangGui(true);
    try {
      await register(v.email, v.password);
    } catch (e) {
      // 1403 "đã có tài khoản, đăng ký đã đóng" là đường đi BÌNH THƯỜNG ở
      // đây, không phải sự cố: đăng ký chỉ mở cho user đầu tiên.
      setLoi(e instanceof ApiError ? e.msg : "không kết nối được máy chủ");
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-lg font-semibold">Đăng ký</h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CredentialsForm nhanNut="Đăng ký" dangGui={dangGui} loi={loi} onSubmit={gui} />
          <p className="text-sm text-muted-foreground">
            Đã có tài khoản?{" "}
            <Link to="/login" className="text-primary underline">
              Đăng nhập
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
