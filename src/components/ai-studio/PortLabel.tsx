"use client";

import { Badge, Text } from "@radix-ui/themes";

import { getPortColor, type PortType } from "@/lib/ai-studio/portTypes";

type PortLabelProps = {
  type: PortType;
  label?: string;
  connected?: boolean;
  required?: boolean;
};

export function PortLabel({ type, label, connected, required }: PortLabelProps) {
  const color = getPortColor(type);
  
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2.5 w-2.5 rounded-full transition-colors"
        style={{ backgroundColor: connected ? color : 'rgba(255,255,255,0.3)' }}
      />
      <Text size="1" color="gray">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </Text>
    </div>
  );
}
