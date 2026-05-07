const dataUrlPattern = /^data:[^;]+;base64,/i;
const base64LikePattern = /^[a-z0-9+/=]+$/i;
const minBase64Length = 256;

function isEncodedPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (dataUrlPattern.test(trimmed)) return true;
  if (trimmed.length < minBase64Length) return false;
  return base64LikePattern.test(trimmed);
}

export type SanitizeWarning = {
  nodeId?: string;
  path: string;
  bytes: number;
  preview: string;
};

export type SanitizeResult = {
  nodes: unknown[];
  warnings: SanitizeWarning[];
};

function stripValue(
  value: unknown,
  path: string,
  warnings: SanitizeWarning[],
  nodeId?: string,
): unknown {
  if (typeof value === "string") {
    if (isEncodedPayload(value)) {
      warnings.push({
        nodeId,
        path,
        bytes: value.length,
        preview: value.slice(0, 48),
      });
      return undefined;
    }
    return value;
  }

  if (Array.isArray(value)) {
    const next: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const item = stripValue(value[i], `${path}[${i}]`, warnings, nodeId);
      if (item !== undefined) next.push(item);
    }
    return next;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      const stripped = stripValue(record[key], `${path}.${key}`, warnings, nodeId);
      if (stripped !== undefined) next[key] = stripped;
    }
    return next;
  }

  return value;
}

function sanitizeNode(node: unknown, warnings: SanitizeWarning[]): unknown {
  if (!node || typeof node !== "object") return node;
  const record = node as Record<string, unknown>;
  const nodeId = typeof record.id === "string" ? record.id : undefined;
  if (!record.data || typeof record.data !== "object") return node;
  const sanitizedData = stripValue(record.data, "data", warnings, nodeId);
  return { ...record, data: sanitizedData ?? {} };
}

export function sanitizeWorkflowNodes(nodes: unknown[]): SanitizeResult {
  const warnings: SanitizeWarning[] = [];
  const sanitized = nodes.map((node) => sanitizeNode(node, warnings));
  return { nodes: sanitized, warnings };
}
