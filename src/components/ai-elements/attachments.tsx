"use client";

import { Box, Card, Flex, IconButton, Text } from "@radix-ui/themes";
import { Cross2Icon, FileIcon } from "@radix-ui/react-icons";

export type Attachment = {
  id: string;
  name: string;
  url?: string;
  type?: string;
  size?: string;
};

type AttachmentsProps = {
  files: Attachment[];
  onRemove?: (id: string) => void;
};

export function Attachments({ files, onRemove }: AttachmentsProps) {
  if (!files.length) return null;

  return (
    <Flex gap="3" wrap="wrap">
      {files.map((file) => (
        <Card key={file.id} className="relative overflow-hidden border border-white/10 bg-white/5 pr-8 transition-colors hover:bg-white/10">
          <Flex align="center" gap="3">
            <Box className="rounded bg-indigo-500/20 p-2 text-indigo-400">
              <FileIcon width={18} height={18} />
            </Box>
            <Box>
              <Text as="div" size="2" weight="medium" className="line-clamp-1 max-w-[150px] text-white">
                {file.name}
              </Text>
              {file.size && (
                <Text as="div" size="1" color="gray">
                  {file.size}
                </Text>
              )}
            </Box>
          </Flex>
          {onRemove && (
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              <IconButton 
                variant="ghost" 
                color="gray" 
                size="1" 
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(file.id);
                }}
                aria-label={`Remove ${file.name}`}
              >
                <Cross2Icon />
              </IconButton>
            </div>
          )}
        </Card>
      ))}
    </Flex>
  );
}
