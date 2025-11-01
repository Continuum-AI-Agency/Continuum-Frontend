"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Select,
  Tabs,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { CheckCircledIcon, ExclamationTriangleIcon, Link2Icon, ReloadIcon, TrashIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PLATFORMS, PLATFORM_KEYS, type PlatformKey } from "./platforms";
import {
  clearPlatformConnectionAction,
  completeOnboardingAction,
  fetchOnboardingStateAction,
  markPlatformConnectionAction,
  mutateOnboardingStateAction,
  refreshPlatformConnectionAction,
  registerDocumentMetadataAction,
  removeDocumentAction,
} from "@/app/onboarding/actions";
import type { BrandVoiceTag, OnboardingDocument, OnboardingState } from "@/lib/onboarding/state";
import { BRAND_VOICE_TAGS } from "@/lib/onboarding/state";
import { openCenteredPopup, waitForPopupMessage } from "@/lib/popup";
import { useToast } from "@/components/ui/ToastProvider";

const industries = [
  "Advertising",
  "E-commerce",
  "Finance",
  "Health & Wellness",
  "Hospitality",
  "Media & Entertainment",
  "SaaS",
  "Technology",
  "Other",
];

const timezoneOptions =
  typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"];

const brandSchema = z.object({
  name: z.string().min(2, "Brand name is required"),
  industry: z.string().min(1, "Industry is required"),
  brandVoice: z.string().optional(),
  targetAudience: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required"),
});

type BrandForm = z.infer<typeof brandSchema>;

type OnboardingFlowProps = {
  brandId: string;
  initialState: OnboardingState;
};

const CONNECTOR_SOURCES = [
  { key: "canva", label: "Canva" },
  { key: "figma", label: "Figma" },
  { key: "google-drive", label: "Google Drive" },
  { key: "sharepoint", label: "SharePoint" },
] as const;

export default function OnboardingFlow({ brandId, initialState }: OnboardingFlowProps) {
  const router = useRouter();
  const { show } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<OnboardingState>(initialState);
  const [isPending, startTransition] = useTransition();
  const [selectedVoiceTags, setSelectedVoiceTags] = useState<BrandVoiceTag[]>(initialState.brand.brandVoiceTags ?? []);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
    getValues,
    reset,
    setValue,
    watch,
  } = useForm<BrandForm>({
    defaultValues: {
      name: initialState.brand.name,
      industry: initialState.brand.industry || industries[0],
      brandVoice: initialState.brand.brandVoice ?? "",
      targetAudience: initialState.brand.targetAudience ?? "",
      timezone: initialState.brand.timezone || "UTC",
    },
  });

  const connectedKeys = useMemo(
    () => PLATFORM_KEYS.filter(key => state.connections[key]?.connected),
    [state.connections]
  );

  const step = state.step;

  const brandDocuments = state.documents;

  useEffect(() => {
    setSelectedVoiceTags(state.brand.brandVoiceTags ?? []);
    reset({
      name: state.brand.name,
      industry: state.brand.industry || industries[0],
      brandVoice: state.brand.brandVoice ?? "",
      targetAudience: state.brand.targetAudience ?? "",
      timezone: state.brand.timezone || "UTC",
    });
  }, [reset, state.brand]);

  const industryValue = watch("industry");
  const timezoneValue = watch("timezone");

  const refreshState = useCallback(() => {
    startTransition(() => {
      void fetchOnboardingStateAction(brandId)
        .then(next => setState(next))
        .catch(() => {
          show({ title: "Refresh failed", description: "Unable to load the latest onboarding state.", variant: "error" });
        });
    });
  }, [brandId, show]);

  const handleBrandSubmit = useCallback(
    (data: BrandForm) => {
      const payload = {
        name: data.name.trim(),
        industry: data.industry,
        brandVoice: data.brandVoice?.trim() ? data.brandVoice.trim() : null,
        brandVoiceTags: selectedVoiceTags,
        targetAudience: data.targetAudience?.trim() ? data.targetAudience.trim() : null,
        timezone: data.timezone,
      };

      startTransition(() => {
        void mutateOnboardingStateAction(brandId, {
          step: 1,
          brand: payload,
        })
          .then(next => {
            setState(next);
          })
          .catch(() => {
            show({ title: "Save failed", description: "Could not update brand details.", variant: "error" });
          });
      });
    },
    [brandId, selectedVoiceTags, show]
  );

  const handleUploadDocuments = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const toUpload = Array.from(files);

      startTransition(() => {
        Promise.all(
          toUpload.map(async file => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("source", "upload");
            formData.append("brandId", brandId);
            const response = await fetch("/api/onboarding/documents", {
              method: "POST",
              body: formData,
            });
            if (!response.ok) {
              throw new Error("Upload failed");
            }
            const json = await response.json();
            return json.state as OnboardingState;
          })
        )
          .then(results => {
            setState(prev => results.at(-1) ?? prev);
            show({ title: "Documents added", description: "Your files were queued for embedding.", variant: "success" });
          })
          .catch(() => {
            show({ title: "Upload failed", description: "We could not process these files. Try again.", variant: "error" });
          });
      });
    },
    [brandId, show]
  );

  const handleConnectorLaunch = useCallback(
    async (source: (typeof CONNECTOR_SOURCES)[number]["key"]) => {
      const popup = openCenteredPopup(`/documents/mock/${source}`, `Connect ${source}`);
      if (!popup) {
        show({ title: "Popup blocked", description: "Enable popups to connect external libraries.", variant: "error" });
        return;
      }

      try {
        const payload = await waitForPopupMessage<{
          type: string;
          source: string;
          name: string;
          externalUrl?: string;
        }>("documents:linked", {
          predicate: message => message.source === source,
        });

        startTransition(() => {
          void registerDocumentMetadataAction(brandId, {
            name: payload.name,
            source,
            externalUrl: payload.externalUrl,
            status: "ready",
          })
            .then(next => {
              setState(next);
              show({ title: `${source} library linked`, description: payload.name, variant: "success" });
            })
            .catch(() => {
              show({ title: "Integration failed", description: "Unable to capture the selected document.", variant: "error" });
            });
        });
      } catch {
        show({ title: "Integration cancelled", description: `We didn't receive a document from ${source}.`, variant: "error" });
      }
    },
    [brandId, show]
  );

  const removeDocument = useCallback(
    (doc: OnboardingDocument) => {
      startTransition(() => {
        void removeDocumentAction(brandId, doc.id)
          .then(next => {
            setState(next);
            show({ title: "Removed", description: `${doc.name} was removed from the embedder queue.`, variant: "success" });
          })
          .catch(() => {
            show({ title: "Remove failed", description: "We could not remove this document.", variant: "error" });
          });
      });
    },
    [brandId, show]
  );

  const connectPlatform = useCallback(
    async (provider: PlatformKey) => {
      try {
        const popup = openCenteredPopup(
          `/oauth/start?provider=${provider}&context=onboarding`,
          `Connect ${provider}`
        );
        if (!popup) {
          show({ title: "Popup blocked", description: "Allow popups to continue.", variant: "error" });
          return;
        }

        const successPromise = waitForPopupMessage<{
          type: string;
          provider: PlatformKey;
          accountId?: string;
          context?: string;
        }>("oauth:success", {
          predicate: message => message.provider === provider && message.context === "onboarding",
        });

        const errorPromise = waitForPopupMessage<{
          type: string;
          provider?: PlatformKey;
          context?: string;
          message?: string;
        }>("oauth:error", {
          predicate: message => message.provider === provider && message.context === "onboarding",
        }).then(payload => {
          throw new Error(payload.message ?? "Connection cancelled.");
        });

        const result = await Promise.race([successPromise, errorPromise]);
        if (!result.provider || result.provider !== provider) {
          show({ title: "Connection incomplete", description: "We could not verify the provider.", variant: "error" });
          return;
        }

        startTransition(() => {
          void markPlatformConnectionAction({
            brandId,
            key: provider,
            accountId: result.accountId ?? null,
          })
            .then(next => {
              setState(next);
              show({ title: "Connected", description: `Accounts synced for ${provider}.`, variant: "success" });
            })
            .catch(() => {
              show({ title: "Connection failed", description: "Please try again.", variant: "error" });
            });
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Please try again.";
        show({ title: "Connection failed", description: message, variant: "error" });
      }
    },
    [brandId, show]
  );

  const disconnectPlatform = useCallback(
    (provider: PlatformKey) => {
      startTransition(() => {
        void clearPlatformConnectionAction(brandId, provider)
          .then(next => {
            setState(next);
            show({ title: "Disconnected", description: `Removed ${provider} integration.`, variant: "success" });
          })
          .catch(() => {
            show({ title: "Unable to disconnect", description: "Please retry shortly.", variant: "error" });
          });
      });
    },
    [brandId, show]
  );

  const resyncPlatform = useCallback(
    (provider: PlatformKey) => {
      startTransition(() => {
        void refreshPlatformConnectionAction(brandId, provider)
          .then(next => {
            setState(next);
            show({ title: "Synced", description: `Pulled the latest accounts for ${provider}.`, variant: "success" });
          })
          .catch(() => {
            show({ title: "Sync failed", description: "Unable to refresh this integration.", variant: "error" });
          });
      });
    },
    [brandId, show]
  );

  const canContinueFrom = useCallback(
    (stepIndex: number): boolean => {
      if (stepIndex === 0) {
        const parsed = brandSchema.safeParse(getValues());
        return parsed.success && selectedVoiceTags.length <= 8;
      }
      if (stepIndex === 1) {
        return connectedKeys.length > 0;
      }
      return true;
    },
    [connectedKeys.length, getValues, selectedVoiceTags.length]
  );

  const handleNext = useCallback(() => {
    if (step === 0) {
      const parsed = brandSchema.safeParse(getValues());
      if (!parsed.success) {
        parsed.error.issues.forEach(issue => {
          const path = issue.path[0];
          if (typeof path === "string") {
            setError(path as keyof BrandForm, { type: "manual", message: issue.message });
          }
        });
        return;
      }
      handleBrandSubmit(parsed.data);
      return;
    }

    const nextStep = Math.min(step + 1, 2);
    startTransition(() => {
      void mutateOnboardingStateAction(brandId, { step: nextStep })
        .then(next => {
          setState(next);
        })
        .catch(() => {
          show({ title: "Progress blocked", description: "Unable to save your progress.", variant: "error" });
        });
    });
  }, [brandId, getValues, handleBrandSubmit, setError, show, step]);

  const handleBack = useCallback(() => {
    const previousStep = Math.max(step - 1, 0);
    startTransition(() => {
      void mutateOnboardingStateAction(brandId, { step: previousStep })
        .then(next => {
          setState(next);
        })
        .catch(() => {
          show({ title: "Navigation failed", description: "Unable to go back.", variant: "error" });
        });
    });
  }, [brandId, show, step]);

  const completeOnboarding = useCallback(() => {
    startTransition(() => {
      void completeOnboardingAction(brandId)
        .then(next => {
          setState(next);
          show({ title: "Onboarding complete", description: "Redirecting to your dashboard.", variant: "success" });
          router.replace("/dashboard");
        })
        .catch(() => {
          show({ title: "Completion failed", description: "Please try again.", variant: "error" });
        });
    });
  }, [brandId, router, show]);

  const renderBrandTags = () => (
    <Flex wrap="wrap" gap="2">
      {BRAND_VOICE_TAGS.map(tag => {
        const active = selectedVoiceTags.includes(tag);
        return (
          <Button
            key={tag}
            variant={active ? "solid" : "outline"}
            color={active ? "violet" : "gray"}
            size="1"
            onClick={() => {
              setSelectedVoiceTags(prev =>
                prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
              );
            }}
            type="button"
          >
            {tag}
          </Button>
        );
      })}
    </Flex>
  );

  const renderDocumentsList = () => {
    if (brandDocuments.length === 0) {
      return <Text color="gray">No documents added yet. Bring your brand voice and visual libraries to kick-start personalization.</Text>;
    }

    return (
      <Flex direction="column" gap="2">
        {brandDocuments.map(doc => (
          <Card key={doc.id}>
            <Flex align="center" justify="between" p="3" gap="3">
              <Flex direction="column" gap="1">
                <Text weight="medium">{doc.name}</Text>
                <Flex gap="2" align="center">
                  <Badge color="gray">{doc.source}</Badge>
                  <Text size="1" color="gray">
                    {new Date(doc.createdAt).toLocaleString()} · {doc.status === "ready" ? "Ready" : "Processing"}
                  </Text>
                </Flex>
              </Flex>
              <Button
                variant="ghost"
                color="red"
                onClick={() => removeDocument(doc)}
                disabled={isPending}
                size="1"
                aria-label={`Remove ${doc.name}`}
              >
                <TrashIcon />
              </Button>
            </Flex>
          </Card>
        ))}
      </Flex>
    );
  };

  const renderConnections = () => (
    <Grid columns={{ initial: "1", sm: "2" }} gap="3">
      {PLATFORMS.map(({ key, label }) => {
        const connection = state.connections[key];
        const isConnected = Boolean(connection?.connected);
        return (
          <Card key={key}>
            <Flex direction="column" gap="3" p="4">
              <Flex align="center" justify="between">
                <Flex align="center" gap="2">
                  <Link2Icon />
                  <Text weight="medium">{label}</Text>
                </Flex>
                <Badge color={isConnected ? "green" : "gray"}>
                  {isConnected ? "Connected" : "Not connected"}
                </Badge>
              </Flex>
              <Flex gap="2">
                <Button
                  onClick={() => (isConnected ? disconnectPlatform(key) : connectPlatform(key))}
                  variant={isConnected ? "soft" : "solid"}
                  color={isConnected ? "gray" : "violet"}
                  disabled={isPending}
                >
                  {isConnected ? "Disconnect" : "Connect"}
                </Button>
                {isConnected && (
                  <Button
                    variant="outline"
                    color="gray"
                    onClick={() => resyncPlatform(key)}
                    disabled={isPending}
                    aria-label={`Refresh ${label} accounts`}
                  >
                    <ReloadIcon />
                  </Button>
                )}
              </Flex>
              {isConnected && (
                <Flex direction="column" gap="2">
                  <Text size="2" weight="medium">
                    Synced accounts
                  </Text>
                  {connection?.accounts?.length ? (
                    <Flex direction="column" gap="1">
                      {connection.accounts.map(account => (
                        <Card key={account.id} variant="surface">
                          <Flex justify="between" align="center" p="2">
                            <Text size="2">{account.name}</Text>
                            <Badge color={account.status === "active" ? "green" : account.status === "pending" ? "amber" : "red"}>
                              {account.status}
                            </Badge>
                          </Flex>
                        </Card>
                      ))}
                    </Flex>
                  ) : (
                    <Text size="1" color="gray">
                      No accounts returned yet. Try syncing again.
                    </Text>
                  )}
                  <Text size="1" color="gray">
                    Last synced {connection?.lastSyncedAt ? new Date(connection.lastSyncedAt).toLocaleString() : "—"}
                  </Text>
                </Flex>
              )}
            </Flex>
          </Card>
        );
      })}
    </Grid>
  );

  return (
    <Container size="3">
      <Flex direction="column" gap="4">
        <Heading size="6">Welcome to Continuum</Heading>
        <Text color="gray">Set up your workspace so Continuum can produce on-brand creative from day one.</Text>

        <Tabs.Root value={`step-${step}`} onValueChange={() => {}}>
          <Tabs.List>
            <Tabs.Trigger value="step-0">Brand profile</Tabs.Trigger>
            <Tabs.Trigger value="step-1">Integrations</Tabs.Trigger>
            <Tabs.Trigger value="step-2">Review</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="step-0">
            <Card>
              <form
                onSubmit={handleSubmit(data => {
                  handleBrandSubmit(data);
                })}
              >
                <Flex direction="column" gap="4" p="4">
                  <Heading size="4">Tell us about your brand</Heading>
                  <Box>
                    <Text size="2" weight="medium">
                      Brand name
                    </Text>
                    <TextField.Root placeholder="e.g. Continuum Collective" {...register("name")} />
                    {errors.name?.message && <Text color="red" size="1">{errors.name.message}</Text>}
                  </Box>
                  <Box>
                    <Text size="2" weight="medium">
                      Industry
                    </Text>
                    <Select.Root
                      value={industryValue || industries[0]}
                      onValueChange={value => setValue("industry", value, { shouldDirty: true })}
                    >
                      <Select.Trigger placeholder="Select industry" />
                      <Select.Content>
                        {industries.map(industry => (
                          <Select.Item key={industry} value={industry}>
                            {industry}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                    {errors.industry?.message && <Text color="red" size="1">{errors.industry.message}</Text>}
                  </Box>
                  <Flex direction="column" gap="2">
                    <Text size="2" weight="medium">
                      Brand voice (optional)
                    </Text>
                    <TextArea placeholder="Describe your brand tone and style" {...register("brandVoice")} />
                    <Text size="1" color="gray">
                      Use keywords to guide the AI, or choose from our preset tags.
                    </Text>
                    {renderBrandTags()}
                  </Flex>
                  <Box>
                    <Text size="2" weight="medium">
                      Target audience (optional)
                    </Text>
                    <TextArea placeholder="Who are you speaking to?" {...register("targetAudience")} />
                  </Box>
                  <Box>
                    <Text size="2" weight="medium">
                      Timezone
                    </Text>
                    <Select.Root
                      value={timezoneValue || "UTC"}
                      onValueChange={value => setValue("timezone", value, { shouldDirty: true })}
                    >
                      <Select.Trigger placeholder="Select timezone" />
                      <Select.Content>
                        {timezoneOptions.map(zone => (
                          <Select.Item key={zone} value={zone}>
                            {zone}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                    {errors.timezone?.message && <Text color="red" size="1">{errors.timezone.message}</Text>}
                  </Box>
                  <Flex direction="column" gap="3">
                    <Text size="2" weight="medium">
                      Brand documents
                    </Text>
                    <Flex gap="2" wrap="wrap">
                      <Button
                        type="button"
                        variant="solid"
                        color="violet"
                        onClick={() => {
                          fileInputRef.current?.click();
                        }}
                        disabled={isPending}
                      >
                        Upload files
                      </Button>
                      {CONNECTOR_SOURCES.map(source => (
                        <Button
                          key={source.key}
                          type="button"
                          variant="outline"
                          color="gray"
                          onClick={() => handleConnectorLaunch(source.key)}
                          disabled={isPending}
                        >
                          {source.label}
                        </Button>
                      ))}
                    </Flex>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      hidden
                      onChange={event => {
                        void handleUploadDocuments(event.target.files);
                        if (event.target) {
                          event.target.value = "";
                        }
                      }}
                    />
                    {renderDocumentsList()}
                  </Flex>
                  <Flex justify="end" gap="3">
                    <Button type="button" variant="soft" disabled>
                      Back
                    </Button>
                    <Button type="submit" disabled={!canContinueFrom(0) || isPending}>
                      Continue
                    </Button>
                  </Flex>
                </Flex>
              </form>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-1">
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Flex align="center" justify="between">
                  <Heading size="4">Connect your channels</Heading>
                  <Button variant="ghost" size="1" onClick={refreshState} disabled={isPending}>
                    Refresh
                  </Button>
                </Flex>
                <Text color="gray">
                  Secure popups handle authentication for each network. We’ll show live account data as soon as the provider confirms access.
                </Text>
                {renderConnections()}
                <Callout.Root color="amber">
                  <Callout.Icon>
                    <ExclamationTriangleIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    OAuth flows are mocked in development. Production will call Supabase Auth and provider APIs before syncing accounts.
                  </Callout.Text>
                </Callout.Root>
                <Flex justify="between">
                  <Button variant="soft" onClick={handleBack} disabled={isPending}>
                    Back
                  </Button>
                  <Button onClick={handleNext} disabled={!canContinueFrom(1) || isPending}>
                    Continue
                  </Button>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>

          <Tabs.Content value="step-2">
            <Card>
              <Flex direction="column" gap="4" p="4">
                <Heading size="4">Review</Heading>
                <Card variant="surface">
                  <Flex direction="column" gap="2" p="3">
                    <Text size="2" weight="medium">Brand profile</Text>
                    <Text>{state.brand.name}</Text>
                    <Flex gap="2">
                      <Badge color="violet">{state.brand.industry || "Industry not set"}</Badge>
                      <Badge color="gray">{state.brand.timezone}</Badge>
                    </Flex>
                    {state.brand.brandVoice && (
                      <Text color="gray" size="2">Voice: {state.brand.brandVoice}</Text>
                    )}
                    {state.brand.brandVoiceTags.length > 0 && (
                      <Flex gap="1" wrap="wrap">
                        {state.brand.brandVoiceTags.map(tag => (
                          <Badge key={tag} color="green">{tag}</Badge>
                        ))}
                      </Flex>
                    )}
                    {state.brand.targetAudience && (
                      <Text color="gray" size="2">Target audience: {state.brand.targetAudience}</Text>
                    )}
                  </Flex>
                </Card>

                <Card variant="surface">
                  <Flex direction="column" gap="2" p="3">
                    <Text size="2" weight="medium">Brand documents</Text>
                    {brandDocuments.length ? (
                      <Flex direction="column" gap="1">
                        {brandDocuments.map(doc => (
                          <Flex key={doc.id} align="center" justify="between">
                            <Text size="2">{doc.name}</Text>
                            <Badge color="gray">{doc.source}</Badge>
                          </Flex>
                        ))}
                      </Flex>
                    ) : (
                      <Text color="gray" size="2">No documents uploaded.</Text>
                    )}
                  </Flex>
                </Card>

                <Card variant="surface">
                  <Flex direction="column" gap="2" p="3">
                    <Text size="2" weight="medium">Connected platforms</Text>
                    {connectedKeys.length ? (
                      <Flex direction="column" gap="2">
                        {connectedKeys.map(provider => {
                          const connection = state.connections[provider];
                          const label = PLATFORMS.find(p => p.key === provider)?.label ?? provider;
                          return (
                            <Card key={provider} variant="ghost">
                              <Flex direction="column" gap="1" p="2">
                                <Flex justify="between">
                                  <Text>{label}</Text>
                                  <Badge color="green">Connected</Badge>
                                </Flex>
                                {connection?.accounts?.length ? (
                                  <Flex wrap="wrap" gap="2">
                                    {connection.accounts.map(account => (
                                      <Badge key={account.id} color="violet">
                                        {account.name}
                                      </Badge>
                                    ))}
                                  </Flex>
                                ) : (
                                  <Text color="gray" size="1">No accounts synced yet.</Text>
                                )}
                              </Flex>
                            </Card>
                          );
                        })}
                      </Flex>
                    ) : (
                      <Text color="gray" size="2">No integrations connected.</Text>
                    )}
                  </Flex>
                </Card>

                <Callout.Root color="green">
                  <Callout.Icon>
                    <CheckCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>
                    You can manage integrations and brand assets anytime from Settings.
                  </Callout.Text>
                </Callout.Root>
                <Flex justify="between">
                  <Button variant="soft" onClick={handleBack} disabled={isPending}>
                    Back
                  </Button>
                  <Button onClick={completeOnboarding} disabled={isPending}>
                    Complete setup
                  </Button>
                </Flex>
              </Flex>
            </Card>
          </Tabs.Content>
        </Tabs.Root>

        <Flex justify="center">
          <Text color="gray" size="1">
            Need to pause? Your progress saves automatically.
          </Text>
        </Flex>
      </Flex>
    </Container>
  );
}
