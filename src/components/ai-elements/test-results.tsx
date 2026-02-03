"use client";

import { Badge, Box, Card, Flex, Text } from "@radix-ui/themes";
import { CheckCircledIcon, CrossCircledIcon, CircleIcon } from "@radix-ui/react-icons";
import { Spinner } from "@/components/ui/Loading";

export type TestResult = {
  id: string;
  name: string;
  status: "pass" | "fail" | "running" | "pending";
  duration?: string;
  error?: string;
};

type TestResultsProps = {
  results: TestResult[];
  title?: string;
};

export function TestResults({ results, title = "Test Results" }: TestResultsProps) {
  const passing = results.filter((r) => r.status === "pass").length;
  const failing = results.filter((r) => r.status === "fail").length;
  const total = results.length;

  return (
    <Card className="w-full border border-white/10 bg-white/5 p-0 overflow-hidden">
      <Box className="border-b border-white/10 bg-white/5 px-4 py-3">
        <Flex align="center" justify="between">
          <Text size="2" weight="medium" className="text-secondary">
            {title}
          </Text>
          <Flex gap="2">
            {passing > 0 && (
              <Badge color="green" variant="soft" size="1">
                {passing} passed
              </Badge>
            )}
            {failing > 0 && (
              <Badge color="red" variant="soft" size="1">
                {failing} failed
              </Badge>
            )}
            <Badge color="gray" variant="surface" size="1">
              {total} total
            </Badge>
          </Flex>
        </Flex>
      </Box>
      <div className="divide-y divide-white/5">
        {results.map((result) => (
          <Flex key={result.id} align="center" justify="between" className="px-4 py-3 hover:bg-white/5 transition-colors">
            <Flex align="center" gap="3">
              <StatusIcon status={result.status} />
              <Box>
                <Text as="div" size="2" className={result.status === "fail" ? "text-red-400" : "text-white"}>
                  {result.name}
                </Text>
                {result.error && (
                  <Text as="div" size="1" color="red" className="mt-0.5">
                    {result.error}
                  </Text>
                )}
              </Box>
            </Flex>
            {result.duration && (
              <Text size="1" color="gray">
                {result.duration}
              </Text>
            )}
          </Flex>
        ))}
      </div>
    </Card>
  );
}

function StatusIcon({ status }: { status: TestResult["status"] }) {
  switch (status) {
    case "pass":
      return <CheckCircledIcon className="text-green-400 h-4 w-4" />;
    case "fail":
      return <CrossCircledIcon className="text-red-400 h-4 w-4" />;
    case "running":
      return <Spinner size={16} />;
    default:
      return <CircleIcon className="text-gray-600 h-4 w-4" />;
  }
}
