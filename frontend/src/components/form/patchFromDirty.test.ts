import { describe, expect, it } from "vitest";
import { patchFromDirty } from "./patchFromDirty";

type Fields = { code: string; name: string; risk_percent: string };
type Patch = { code?: string; name?: string; risk_per_trade?: string };

const transforms = {
  code: (v: string) => ({ key: "code" as const, value: v.trim() }),
  name: (v: string) => ({ key: "name" as const, value: v.trim() }),
  // Đổi cả TÊN khoá: form hỏi phần trăm, API nhận phân số.
  risk_percent: (v: string) => ({ key: "risk_per_trade" as const, value: String(Number(v) / 100) }),
};

const values: Fields = { code: "  FTMO  ", name: " Quỹ ", risk_percent: "1" };

describe("patchFromDirty", () => {
  it("chỉ gửi field đã đổi", () => {
    const patch = patchFromDirty<Fields, Patch>({ name: true }, values, transforms);
    expect(patch).toEqual({ name: "Quỹ" });
  });

  it("không đổi gì thì patch rỗng — PATCH rỗng là không ghi đè gì cả", () => {
    expect(patchFromDirty<Fields, Patch>({}, values, transforms)).toEqual({});
  });

  it("áp đúng phép biến đổi, kể cả khi khoá đổi tên", () => {
    const patch = patchFromDirty<Fields, Patch>({ risk_percent: true }, values, transforms);
    expect(patch).toEqual({ risk_per_trade: "0.01" });
  });

  // Đây là con bọ mà dãy `if` chép tay hay mắc: sửa nhiều field cùng lúc mà
  // chỉ một field đi tới API.
  it("gửi ĐỦ mọi field đã đổi, không rơi field nào", () => {
    const patch = patchFromDirty<Fields, Patch>(
      { code: true, name: true, risk_percent: true },
      values,
      transforms,
    );
    expect(patch).toEqual({ code: "FTMO", name: "Quỹ", risk_per_trade: "0.01" });
  });

  it("giá trị rỗng vẫn được gửi khi field đã đổi — xoá là một thay đổi thật", () => {
    const patch = patchFromDirty<Fields, Patch>({ name: true }, { ...values, name: "" }, transforms);
    expect(patch).toEqual({ name: "" });
  });
});
