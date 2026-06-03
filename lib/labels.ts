export function formatRoleLabel(value: string) {
  const map: Record<string, string> = {
    user: "用户",
    admin: "管理员"
  };
  return map[value] ?? value;
}
