import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Ngưỡng lấy từ backend (service/auth.go:25 minPasswordLen = 8). Validate ở
// đây là để phản hồi nhanh, KHÔNG phải để thay backend.
export const credentialsSchema = z.object({
  email: z.string().min(1, "email không được để trống").email("email không hợp lệ"),
  password: z.string().min(8, "mật khẩu phải dài ít nhất 8 ký tự"),
});

export type Credentials = z.infer<typeof credentialsSchema>;

type Props = {
  nhanNut: string;
  dangGui: boolean;
  loi: string | null;
  onSubmit: (v: Credentials) => void;
};

export function CredentialsForm({ nhanNut, dangGui, loi, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    // noValidate: để zod là nơi duy nhất quyết định thông báo lỗi, thay vì
    // trình duyệt chen ngang bằng tooltip tiếng Anh của riêng nó.
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      {loi && (
        <p role="alert" className="text-sm text-destructive">
          {loi}
        </p>
      )}

      <Button type="submit" disabled={dangGui}>
        {dangGui ? "Đang gửi…" : nhanNut}
      </Button>
    </form>
  );
}
