"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  Checkbox,
  Container,
  Flex,
  Grid,
  Heading,
  Tabs,
  Text,
  TextArea,
  TextField,
  Badge,
  Callout,
} from "@radix-ui/themes";
import { Link2Icon, CheckCircledIcon, ExclamationTriangleIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PLATFORMS, PlatformKey } from "./platforms";
import { getLocalStorageJSON, setLocalStorageJSON, makeScopedKey } from "@/lib/storage";
import { usePersistentState } from "@/lib/usePersistentState";
import { openCenteredPopup, waitForPopupMessage } from "@/lib/popup";
import { useToast } from "@/components/ui/ToastProvider";

const brandSchema = z.object({
  name: z.string().min(2, "Brand name is required"),
  description: z.string().min(10, "Description must be at least 10 characters"),
});

type BrandForm = z.infer<typeof brandSchema>;

const STORAGE_SCOPE = "onboarding";

export default function OnboardingFlow() {
  const router = useRouter();
  const { show } = useToast();
  const [step, setStep] = usePersistentState<number>(makeScopedKey(STORAGE_SCOPE, "step"), 0);
  const [connections, setConnections] = usePersistentState<Record<PlatformKey, boolean>>(
    makeScopedKey(STORAGE_SCOPE, "connections"),
    {
      youtube: false,
      instagram: false,
      tiktok: false,
      linkedin: false,
      googleAds: false,
      amazonAds: false,
      dv360: false,
      threads: false,
    }
  );

  const connectedKeys = useMemo(() => PLATFORMS.filter(p => connections[p.key]).map(p => p.key), [connections]);
  const [associations, setAssociations] = usePersistentState<PlatformKey[]>(makeScopedKey(STORAGE_SCOPE, "associations"), []);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
    getValues,
  } = useForm<BrandForm>({
    defaultValues: getLocalStorageJSON<BrandForm>(makeScopedKey(STORAGE_SCOPE, "brand"), { name: "", description: "" }),
  });

  // Live-persist brand form via watch
  useEffect(() => {
    const subscription = (async () => {
      const { unsubscribe } = (await import("react-hook-form")).watch?.call({ getValues }, (value: BrandForm) => {
        setLocalStorageJSON(makeScopedKey(STORAGE_SCOPE, "brand"), value);
      });
      return unsubscribe;
    })();
    return () => {
      // subscription may be a Promise if watch not available in this context; ignore safely
    };
  }, [getValues]);

  // Persist step changes
  useEffect(() => {
    setLocalStorageJSON(makeScopedKey(STORAGE_SCOPE, "step"), step);
  }, [step]);

  // Persist connections
  useEffect(() => {
    setLocalStorageJSON(makeScopedKey(STORAGE_SCOPE, "connections"), connections);
  }, [connections]);

  // Persist associations
  useEffect(() => {
    setLocalStorageJSON(makeScopedKey(STORAGE_SCOPE, "associations"), associations);
  }, [associations]);

  function toggleConnection(key: PlatformKey) {
    setConnections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function connectViaPopup(provider: PlatformKey) {
    try {
      const popup = openCenteredPopup(`/oauth/${provider}`, `Connect ${provider}`);
      if (!popup) {
        show({ title: "Popup blocked", description: "Allow popups to continue.", variant: "error" });
        return;
      }
      const result = await waitForPopupMessage<{ type: string; provider: string; accountId: string }>("oauth:success");
      setConnections(prev => ({ ...prev, [provider]: true }));
      show({ title: `Connected ${provider}`, description: `Account ${result.accountId} linked.`, variant: "success" });
    } catch (e) {
      show({ title: "Connection failed", description: "Please try again.", variant: "error" });
    }
  }

  function canContinueFrom(stepIndex: number): boolean {
    if (stepIndex === 0) return connectedKeys.length > 0;
    if (stepIndex === 1) {
      const parsed = brandSchema.safeParse(getValues());
      return parsed.success;
    }
    if (stepIndex === 2) return associations.length > 0;
    return true;
  }

  function handleNext() {
    if (step === 1) {
      const parsed = brandSchema.safeParse(getValues());
      if (!parsed.success) {
        const issues = parsed.error.issues;
        for (const issue of issues) {
          const path = issue.path[0];
          if (path === "name" || path === "description") {
            setError(path, { type: "manual", message: issue.message });
          }
        }
        return;
      }
      setLocalStorageJSON(makeScopedKey(STORAGE_SCOPE, "brand"), getValues());
    }
    setStep(s => Math.min(s + 1, 3));
  }

  function handleBack() {
    setStep(s => Math.max(s - 1, 0));
  }

  function completeOnboarding() {
    try {
      const brand = getValues();
      setLocalStorageJSON(makeScopedKey(STORAGE_SCOPE, "brand"), brand);
      setLocalStorageJSON(makeScopedKey(STORAGE_SCOPE, "associations"), associations);
      window.localStorage.setItem("onboarding.complete", "true");
    } catch {}
    router.replace("/dashboard");
  }

  return (
    <Container size="3">
      <Flex direction="column" gap="4">
        <Heading size="6">Welcome to Continuum</Heading>
        <Text color="gray">Let’s connect your accounts and set up your first Brand Profile.</Text>

        <Tabs.Root value={`step-${step}`} onValueChange={() => {}}>
          <Tabs.List>
            <Tabs.Trigger value="step-0">Connect</Tabs.Trigger>
            <Tabs.Trigger value="step-1">Brand</Tabs.Trigger>
            <Tabs.Trigger value="step-2">Associate</Tabs.Trigger>
            <Tabs.Trigger value="step-3">Review</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="step-0">
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="4">Connect your platforms</Heading>
                <Text color="gray">Secure OAuth via Supabase Auth. You can manage these later in Integrations.</Text>
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
                          <Button onClick={() => (isConnected ? toggleConnection(key) : connectViaPopup(key))} variant={isConnected ? "soft" : "solid"} color={isConnected ? "gray" : "violet"}>
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
                    OAuth flows are mocked here. Actual connections will be handled via Supabase Auth.
                  </Callout.Text>
                </Callout.Root>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-1">
            <Card>
              <form
                onSubmit={handleSubmit(() => {
                  handleNext();
                })}
              >
                <Flex direction="column" gap="4" p="4">
                  <Heading size="4">Create your Brand Profile</Heading>
                  <Box>
                    <Text size="2" weight="medium">Brand name</Text>
                    <TextField.Root placeholder="e.g. Mary's Candle Shop" {...register("name")} />
                    {errors.name?.message && (
                      <Text color="red" size="1">{errors.name.message}</Text>
                    )}
                  </Box>
                  <Box>
                    <Text size="2" weight="medium">Description</Text>
                    <TextArea placeholder="Describe your brand voice and target audience" {...register("description")} />
                    {errors.description?.message && (
                      <Text color="red" size="1">{errors.description.message}</Text>
                    )}
                  </Box>
                  <Flex justify="between">
                    <Button type="button" variant="soft" onClick={handleBack} disabled={step === 0}>Back</Button>
                    <Button type="submit" disabled={!canContinueFrom(1)}>Continue</Button>
                  </Flex>
                </Flex>
              </form>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-2">
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="4">Associate accounts to this brand</Heading>
                {connectedKeys.length === 0 ? (
                  <Text color="gray">No connected accounts yet. Go back and connect at least one.</Text>
                ) : (
                  <Flex direction="column" gap="3">
                    {PLATFORMS.filter(p => connections[p.key]).map(({ key, label }) => {
                      const checked = associations.includes(key);
                      return (
                        <Flex key={key} align="center" gap="2">
                          <Checkbox checked={checked} onCheckedChange={(v) => {
                            setAssociations(prev => {
                              const next = new Set(prev);
                              if (v) next.add(key); else next.delete(key);
                              return Array.from(next);
                            });
                          }} />
                          <Text>{label}</Text>
                        </Flex>
                      );
                    })}
                  </Flex>
                )}
                <Flex justify="between">
                  <Button variant="soft" onClick={handleBack}>Back</Button>
                  <Button onClick={handleNext} disabled={!canContinueFrom(2)}>Continue</Button>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-3">
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="4">Review</Heading>
                <Flex direction="column" gap="2">
                  <Text size="2" weight="medium">Connected platforms</Text>
                  <Flex gap="2" wrap="wrap">
                    {connectedKeys.map(k => {
                      const label = PLATFORMS.find(p => p.key === k)?.label ?? k;
                      return <Badge key={k} color="green">{label}</Badge>;
                    })}
                  </Flex>
                </Flex>
                <Flex direction="column" gap="2">
                  <Text size="2" weight="medium">Associated to brand</Text>
                  <Flex gap="2" wrap="wrap">
                    {associations.map(k => {
                      const label = PLATFORMS.find(p => p.key === k)?.label ?? k;
                      return <Badge key={k} color="violet">{label}</Badge>;
                    })}
                  </Flex>
                </Flex>
                <Callout.Root color="green">
                  <Callout.Icon>
                    <CheckCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    You can manage connections anytime in Integrations and edit brands later.
                  </Callout.Text>
                </Callout.Root>
                <Flex justify="between">
                  <Button variant="soft" onClick={handleBack}>Back</Button>
                  <Button onClick={completeOnboarding}>Complete setup</Button>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>
        </Tabs.Root>

        <Flex justify="center">
          <Text color="gray" size="1">Need to skip? You can finish setup later in Integrations.</Text>
        </Flex>
      </Flex>
    </Container>
  );
}


