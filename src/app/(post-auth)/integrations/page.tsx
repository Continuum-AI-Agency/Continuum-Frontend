"use client";

import React, { useState } from "react";
import { Card, Container, Flex, Grid, Heading, Text, Button, Badge, Callout } from "@radix-ui/themes";
import { Link2Icon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { PLATFORMS, PlatformKey } from "@/components/onboarding/platforms";

export default function IntegrationsPage() {
  const [connections, setConnections] = useState<Record<PlatformKey, boolean>>(() => {
    try {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("integrations.state") : null;
      if (stored) return JSON.parse(stored);
    } catch {}
    return {
      youtube: false,
      instagram: false,
      facebook: false,
      tiktok: false,
      linkedin: false,
      googleAds: false,
      amazonAds: false,
      dv360: false,
      threads: false,
    };
  });

  function toggle(key: PlatformKey) {
    setConnections(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem("integrations.state", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  return (
    <Container size="4">
      <Flex direction="column" gap="4">
        <Heading size="6">Integrations</Heading>
        <Text color="gray">Manage connections to social and ads platforms. Connect or disconnect anytime.</Text>
        <Grid columns={{ initial: "1", sm: "2", md: "3" }} gap="3">
          {PLATFORMS.map(({ key, label }) => {
            const isConnected = connections[key];
            return (
              <Card key={key}>
                <Flex direction="column" gap="2" p="3">
                  <Flex align="center" justify="between">
                    <Flex align="center" gap="2">
                      <Link2Icon />
                      <Text weight="medium">{label}</Text>
                    </Flex>
                    <Badge color={isConnected ? "green" : "gray"}>{isConnected ? "Connected" : "Not connected"}</Badge>
                  </Flex>
                  <Button onClick={() => toggle(key)} variant={isConnected ? "soft" : "solid"} color={isConnected ? "gray" : "violet"}>
                    {isConnected ? "Disconnect" : "Connect"}
                  </Button>
                </Flex>
              </Card>
            );
          })}
        </Grid>
        <Callout.Root color="amber">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            This is a UI placeholder. Actual OAuth will be wired via Supabase Auth.
          </Callout.Text>
        </Callout.Root>
      </Flex>
    </Container>
  );
}

