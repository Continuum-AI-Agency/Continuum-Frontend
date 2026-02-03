"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Callout, Flex, Text } from "@radix-ui/themes";
import { ExclamationTriangleIcon } from "@radix-ui/react-icons";

import type { BrandGuidelineDetail, BrandGuidelineSummary } from "@/lib/schemas/brandGuidelines";
import { listBrandGuidelinesAction, fetchBrandGuidelineAction } from "@/lib/actions/brandGuidelines";
import { BrandGuidelinesEditor } from "@/components/paid-media/primitives/Brand-Guidelines/BrandGuidelinesEditor";
import { BrandGuidelinesLibrary } from "@/components/paid-media/primitives/Brand-Guidelines/BrandGuidelinesLibrary";

const EMPTY_LIST: BrandGuidelineSummary[] = [];

type BrandGuidelinesPrimitiveProps = {
  brandId: string;
  initialGuidelines?: BrandGuidelineSummary[];
};

export function BrandGuidelinesPrimitive({ brandId, initialGuidelines }: BrandGuidelinesPrimitiveProps) {
  const [guidelines, setGuidelines] = useState<BrandGuidelineSummary[]>(
    initialGuidelines ?? EMPTY_LIST
  );
  const [activeGuidelineId, setActiveGuidelineId] = useState<string | null>(
    initialGuidelines?.[0]?.id ?? null
  );
  const [activeGuideline, setActiveGuideline] = useState<BrandGuidelineDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInitialGuidelines = useMemo(() => Boolean(initialGuidelines?.length), [initialGuidelines]);

  useEffect(() => {
    if (hasInitialGuidelines) return;

    let mounted = true;
    setError(null);
    setIsLoadingList(true);
    listBrandGuidelinesAction(brandId)
      .then((list) => {
        if (!mounted) return;
        setGuidelines(list);
        if (list.length > 0) {
          setActiveGuidelineId(list[0].id);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load brand guidelines.");
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoadingList(false);
      });

    return () => {
      mounted = false;
    };
  }, [brandId, hasInitialGuidelines]);

  useEffect(() => {
    if (!activeGuidelineId) {
      setActiveGuideline(null);
      return;
    }

    let mounted = true;
    setError(null);
    setIsLoadingDetail(true);
    fetchBrandGuidelineAction(brandId, activeGuidelineId)
      .then((guideline) => {
        if (!mounted) return;
        setActiveGuideline(guideline);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load brand guideline.");
      })
      .finally(() => {
        if (!mounted) return;
        setIsLoadingDetail(false);
      });

    return () => {
      mounted = false;
    };
  }, [brandId, activeGuidelineId]);

  const handleSaved = (guideline: BrandGuidelineDetail) => {
    setActiveGuideline(guideline);
    setActiveGuidelineId(guideline.id);
    setGuidelines((prev) => {
      const next = prev.filter((item) => item.id !== guideline.id);
      return [
        {
          id: guideline.id,
          purpose: guideline.purpose,
          status: guideline.status,
          version: guideline.version,
          updatedAt: guideline.updatedAt,
        },
        ...next,
      ];
    });
  };

  const handleCreateNew = () => {
    setActiveGuideline(null);
    setActiveGuidelineId(null);
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <BrandGuidelinesLibrary
          guidelines={guidelines}
          activeId={activeGuidelineId}
          onSelect={setActiveGuidelineId}
          onCreateNew={handleCreateNew}
          isLoading={isLoadingList}
        />
      </div>
      <div className="lg:col-span-8">
        <Flex direction="column" gap="3">
          {error ? (
            <Callout.Root color="red">
              <Callout.Icon>
                <ExclamationTriangleIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          ) : null}
          {isLoadingDetail && activeGuidelineId ? (
            <Box className="glass-panel p-6">
              <Text size="2" color="gray">
                Loading guideline details...
              </Text>
            </Box>
          ) : (
            <BrandGuidelinesEditor
              brandId={brandId}
              guideline={activeGuideline}
              onSaved={handleSaved}
            />
          )}
        </Flex>
      </div>
    </div>
  );
}
