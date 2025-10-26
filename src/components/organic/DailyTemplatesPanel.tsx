"use client";

import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  Separator,
  Switch,
  Text,
  TextField,
} from "@radix-ui/themes";
import { ClipboardCopyIcon } from "@radix-ui/react-icons";

import { PlatformPreview } from "./PlatformPreview";
import type { CreativeAssetDragPayload } from "@/lib/creative-assets/drag";
import type { DetailedPostTemplate } from "@/lib/organic/types";
import type { PostingState } from "./types";

type DailyTemplatesPanelProps = {
  templates: DetailedPostTemplate[];
  postingState: PostingState;
  language: string;
  onCopyCaption: (caption: string) => void;
  onToggleReady: (dayPlatform: string, ready: boolean) => void;
  onScheduleChange: (dayPlatform: string, scheduledAt: string) => void;
  onAssetDrop: (payload: CreativeAssetDragPayload, template: DetailedPostTemplate) => void;
};

export function DailyTemplatesPanel({
  templates,
  postingState,
  language,
  onCopyCaption,
  onToggleReady,
  onScheduleChange,
  onAssetDrop,
}: DailyTemplatesPanelProps) {
  return (
    <Card>
      <Box p="4">
        <Heading size="4" mb="4">
          Daily Posting Flow ({language})
        </Heading>
        <Flex direction="column" gap="4">
          {templates.map((template) => {
            const state = postingState[template.day_platform] ?? {
              ready: false,
              scheduledAt: "",
            };

            const handleDrop = (payload: CreativeAssetDragPayload) => {
              onAssetDrop(payload, template);
            };

            return (
              <Card key={template.day_platform}>
                <Box p="4">
                  <Flex
                    direction={{ initial: "column", lg: "row" }}
                    gap="4"
                    align="stretch"
                  >
                    <Box className="flex-1 space-y-4">
                      <Flex justify="between" align="center">
                        <Flex direction="column" gap="1">
                          <Text weight="medium">{template.day_platform}</Text>
                          <Text size="1" color="gray">
                            {template.type} • {template.format}
                          </Text>
                        </Flex>
                        <Flex align="center" gap="2">
                          <Switch
                            checked={state.ready}
                            onCheckedChange={(checked) =>
                              onToggleReady(template.day_platform, Boolean(checked))
                            }
                          />
                          <Text size="1" color="gray">
                            Ready to publish
                          </Text>
                        </Flex>
                      </Flex>

                      <Grid columns={{ initial: "1", md: "3" }} gap="4">
                        <Box>
                          <Text size="2" weight="medium">
                            Creative Idea
                          </Text>
                          <Text size="2">{template.creative_idea}</Text>
                        </Box>
                        <Box>
                          <Text size="2" weight="medium">
                            Caption
                          </Text>
                          <Text size="2" mb="2">
                            {template.caption_copy}
                          </Text>
                          <Button
                            size="1"
                            variant="soft"
                            type="button"
                            onClick={() => onCopyCaption(template.caption_copy)}
                          >
                            <ClipboardCopyIcon />
                            Copy Caption
                          </Button>
                        </Box>
                        <Box>
                          <Text size="2" weight="medium">
                            Schedule
                          </Text>
                          <TextField.Root
                            type="datetime-local"
                            value={state.scheduledAt}
                            onChange={(event) =>
                              onScheduleChange(template.day_platform, event.target.value)
                            }
                          />
                        </Box>
                      </Grid>

                      <Separator my="4" />

                      <Grid columns={{ initial: "1", md: "3" }} gap="3">
                        <NarrativeBlock
                          title="Narrative Script"
                          entries={template.narrative_script}
                        />
                        <NarrativeBlock
                          title="Technical Notes"
                          entries={template.technical_script as Record<string, unknown>}
                        />
                        <HashtagBlock hashtags={template.hashtags} />
                      </Grid>
                    </Box>
                    <Box className="w-full max-w-md">
                      <PlatformPreview
                        template={template}
                        onAssetDrop={handleDrop}
                      />
                    </Box>
                  </Flex>
                </Box>
              </Card>
            );
          })}
        </Flex>
      </Box>
    </Card>
  );
}

function NarrativeBlock({
  title,
  entries,
}: {
  title: string;
  entries: Record<string, unknown>;
}) {
  const items = Object.entries(entries ?? {}).filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return String(value).trim().length > 0;
  });

  if (items.length === 0) return null;

  return (
    <Box>
      <Text size="2" weight="medium">
        {title}
      </Text>
      <Flex direction="column" gap="2" mt="2">
        {items.map(([key, value]) => (
          <Box key={key}>
            <Text size="1" color="gray">
              {formatKey(key)}
            </Text>
            {Array.isArray(value) ? (
              <Flex direction="column" gap="1">
                {value.map((item, index) => (
                  <Text key={`${key}-${index}`} size="2">
                    {item}
                  </Text>
                ))}
              </Flex>
            ) : (
              <Text size="2">{String(value)}</Text>
            )}
          </Box>
        ))}
      </Flex>
    </Box>
  );
}

function HashtagBlock({
  hashtags,
}: {
  hashtags: DetailedPostTemplate["hashtags"];
}) {
  const groups: Array<{ label: string; items: string[] }> = [
    { label: "High competition", items: hashtags.high_competition ?? [] },
    { label: "Medium competition", items: hashtags.medium_competition ?? [] },
    { label: "Low competition", items: hashtags.low_competition ?? [] },
  ];

  return (
    <Box>
      <Text size="2" weight="medium">
        Hashtags
      </Text>
      <Flex direction="column" gap="2" mt="2">
        {groups.map((group) => (
          <Box key={group.label}>
            <Text size="1" color="gray">
              {group.label}
            </Text>
            <Flex gap="2" wrap="wrap">
              {group.items.length === 0 ? (
                <Text size="2" color="gray">
                  None
                </Text>
              ) : (
                group.items.map((tag) => (
                  <Badge key={tag} size="1" color="violet">
                    #{tag.replace(/^#/, "")}
                  </Badge>
                ))
              )}
            </Flex>
          </Box>
        ))}
      </Flex>
    </Box>
  );
}

function formatKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
