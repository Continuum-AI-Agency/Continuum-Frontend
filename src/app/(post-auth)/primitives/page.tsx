import { Box, Flex, Heading, Text } from "@radix-ui/themes";
import { PrimitivesHub } from "@/components/paid-media/PrimitivesHub";

export default function PrimitivesPage() {
  return (
    <Box className="w-full min-h-[calc(100vh-140px)] flex flex-col items-center justify-center px-4">
      <Flex direction="column" gap="1" className="w-full max-w-[1400px] mb-6">
        <Heading size="6" className="text-white">
          Primitives
        </Heading>
        <Text color="gray">
          Building blocks reused across the app (creative, onboarding, paid). Audience Builder is in progress; Brand
          Guidelines and Personas are coming soon.
        </Text>
      </Flex>

      <Box className="w-full max-w-[1400px]">
        <PrimitivesHub />
      </Box>
    </Box>
  );
}
