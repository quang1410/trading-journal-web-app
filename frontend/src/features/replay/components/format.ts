/**
 * Số của replay là số thực của mô phỏng (xem engine/types.ts), không phải tiền của sổ nhật ký,
 * nên định dạng thẳng bằng Intl thay vì đi qua lib/decimal.
 */
const USD = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const formatUsd = (v: number): string => `${v < 0 ? "-$" : "$"}${USD.format(Math.abs(v))}`;
export const formatPrice = (p: number | null | undefined): string => (p == null ? "—" : p.toFixed(2));
export const formatCount = (n: number): string => n.toLocaleString("en-US");
