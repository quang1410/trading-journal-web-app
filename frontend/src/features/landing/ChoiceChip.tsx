import type { ChangeEventHandler, ReactNode } from "react";

type Props = {
  id: string;
  name: string;
  type: "radio" | "checkbox";
  checked: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
  children: ReactNode;
};

/**
 * Một lựa chọn dạng viên thuốc. Input thật nằm phủ lên viên (trong suốt), nên
 * bàn phím, trình đọc màn hình và nhóm radio vẫn chạy như input thường.
 */
export function ChoiceChip({ id, name, type, checked, onChange, children }: Props) {
  return (
    <label htmlFor={id} className="relative cursor-pointer">
      <input
        id={id}
        name={name}
        type={type}
        checked={checked}
        onChange={onChange}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
      />
      <span className="inline-block rounded-full border border-input bg-card px-3 py-1.5 text-sm leading-tight text-foreground hover:border-border-strong peer-checked:border-primary peer-checked:bg-interactive-bg-pressed peer-checked:font-medium peer-checked:text-profit peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
        {children}
      </span>
    </label>
  );
}
