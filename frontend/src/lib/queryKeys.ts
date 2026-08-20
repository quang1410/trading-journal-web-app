// Query key tập trung một chỗ. Phase 3 và 4 sẽ thêm key của trades, stats,
// charts vào đây — để không ai tự chế key lệch nhau rồi invalidate hụt.
export const qk = {
  accounts: ["accounts"] as const,
  cashFlows: (accountId: number) => ["accounts", accountId, "cash-flows"] as const,
  metaEnums: ["meta", "enums"] as const,
};
