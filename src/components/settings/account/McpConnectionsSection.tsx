"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Flex, Text } from "@radix-ui/themes";
import {
  mcpConnectionsResponseSchema,
  type McpClientRegistration,
  type McpConnectionsResponse,
} from "@continuum/contracts";
import { http } from "@/lib/api/http";

type LoadState = "loading" | "ready" | "error";

const STATUS_COLOR: Record<McpClientRegistration["status"], "green" | "amber" | "gray"> = {
  connected: "green",
  pending: "amber",
  revoked: "gray",
};

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export function McpConnectionsSection() {
  const [state, setState] = useState<LoadState>("loading");
  const [connections, setConnections] = useState<McpClientRegistration[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const data = await http.request<McpConnectionsResponse>({
        path: "/mcp/connections",
        schema: mcpConnectionsResponseSchema,
      });
      setConnections(data.connections);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (id: string) => {
      setRevokingId(id);
      try {
        await http.request({ path: `/mcp/connections/${id}/revoke`, method: "POST" });
        await load();
      } catch {
        setState("error");
      } finally {
        setRevokingId(null);
      }
    },
    [load]
  );

  if (state === "loading") {
    return <Text color="gray">Loading connected apps…</Text>;
  }

  if (state === "error") {
    return (
      <Flex direction="column" gap="2" align="start">
        <Text color="gray">Could not load connected apps.</Text>
        <Button variant="soft" onClick={() => void load()}>
          Retry
        </Button>
      </Flex>
    );
  }

  if (connections.length === 0) {
    return (
      <Text color="gray">
        No connectors linked yet. Add the Continuum connector in Claude and authorize it to see it
        here.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="2">
      {connections.map((connection) => (
        <Card key={connection.id} variant="surface">
          <Flex align="center" justify="between" gap="3" wrap="wrap">
            <Flex direction="column" gap="1">
              <Flex align="center" gap="2">
                <Text weight="medium">{connection.client_name ?? connection.client_id}</Text>
                <Badge color={STATUS_COLOR[connection.status]}>{connection.status}</Badge>
              </Flex>
              <Text size="1" color="gray">
                Authorized {formatTimestamp(connection.authorized_at)}
                {connection.last_seen_at
                  ? ` · last active ${formatTimestamp(connection.last_seen_at)}`
                  : ""}
              </Text>
            </Flex>
            {connection.status !== "revoked" ? (
              <Button
                color="red"
                variant="soft"
                disabled={revokingId === connection.id}
                onClick={() => void revoke(connection.id)}
              >
                {revokingId === connection.id ? "Revoking…" : "Revoke"}
              </Button>
            ) : null}
          </Flex>
        </Card>
      ))}
    </Flex>
  );
}
