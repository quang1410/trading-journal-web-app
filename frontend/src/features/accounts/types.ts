// Mọi trường tiền là CHUỖI. Backend marshal decimal ra chuỗi JSON chính vì
// float làm mất chữ số; khai kiểu number ở đây là ném đi điều đó ngay tại
// ranh giới.
export type Account = {
  id: number;
  code: string;
  name: string;
  initial_balance: string;
  risk_per_trade: string; // phân số: "0.01" là 1%
  currency: string;
  timezone: string;
  one_r: string; // suy diễn, backend tính
};

export type AccountCreate = {
  code: string;
  name: string;
  currency: string;
  timezone: string;
  initial_balance: string;
  risk_per_trade: string;
};

export type AccountPatch = Partial<AccountCreate>;
