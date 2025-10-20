import { Box, Container, Flex, Heading } from "@radix-ui/themes";
import { GalaxyBackground } from "@/components/ui/GalaxyBackground";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <Box className="relative min-h-screen">
      <GalaxyBackground intensity={1} speed="glacial" />
      <div className="wave-background">
        <div className="wave-layer layer-1" />
        <div className="wave-layer layer-2" />
        <div className="wave-layer layer-3" />
      </div>
      <Container size="1" className="relative z-10 py-12 px-4 sm:py-20">
        <Flex direction="column" align="center" gap="6">
          <Box className="w-full max-w-md">
            <Box className="text-center mb-8">
              <Heading 
                size="8" 
                className="text-gray-900 dark:text-gray-50 mb-4 font-bold tracking-tight"
              >
                {title}
              </Heading>
              {subtitle && (
                <p className="text-gray-600 dark:text-gray-400 text-base leading-relaxed mt-2">
                  {subtitle}
                </p>
              )}
            </Box>
            <Box className="rounded-2xl bg-white/95 dark:bg-gray-800/95 p-8 shadow-2xl border border-gray-200 dark:border-gray-700 backdrop-blur-md">
              {children}
            </Box>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
}

