export type StatusColor = "green" | "amber" | "red" | "gray";

export function resolveStatusColor(status: string | null | undefined): StatusColor {
  if (!status) return "gray";
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "selected") return "green";
  if (normalized === "pending") return "amber";
  if (
    normalized === "error" ||
    normalized === "revoked" ||
    normalized === "disconnected"
  ) {
    return "red";
  }
  return "gray";
}

export function formatConnectionBadge(connectedCount: number): {
  label: string;
  color: "green" | "gray";
} {
  if (connectedCount > 0) {
    const suffix = connectedCount > 1 ? ` • ${connectedCount}` : "";
    return { label: `Connected${suffix}`, color: "green" };
  }
  return { label: "Not connected", color: "gray" };
}
