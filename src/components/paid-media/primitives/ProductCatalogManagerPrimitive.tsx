"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Callout, Flex, Heading, Text } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useForm } from "react-hook-form";
import { AlertTriangle, Check, ChevronsUpDown, Database, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createProductCatalog,
  deleteProductCatalog,
  listProductCatalogs,
  updateProductCatalog,
} from "@/lib/api/productCatalogs.client";
import {
  listProductCatalogLinks,
  removeCatalogProduct,
  renameCatalogProduct,
  upsertProductCatalogLink,
} from "@/lib/api/productCatalogLinks.client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EMPTY_PRODUCT_CATALOG_FORM,
  PRODUCT_CATALOG_SYNC_STATUS_LABELS,
  PRODUCT_CATALOG_VERTICAL_LABELS,
  formatLinkedAdObjectIds,
  parseLinkedAdObjectIds,
  productCatalogFormSchema,
  type ProductCatalogFormValues,
  type ProductCatalogRecord,
} from "@/lib/schemas/productCatalogs";
import {
  type ProductCatalogLinkRecord,
  type UpsertProductCatalogLinkInput,
} from "@/lib/schemas/productCatalogLinks";
import { useSelectableAssets } from "@/lib/api/integrations";
import { getSelectableAssetLabel, getSelectableAssetsFlatListForProvider } from "@/lib/integrations/selectableAssets";
import { cn } from "@/lib/utils";

const SYNC_STATUS_BADGE_COLOR = {
  active: "green",
  stale: "amber",
  error: "red",
  draft: "gray",
} as const;

const MOTION_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
const AD_OBJECT_SELECT_CUSTOM = "__ad-object-custom__";
const PRODUCT_SELECT_CUSTOM = "__product-custom__";

type ProductCatalogManagerPrimitiveProps = {
  brandId: string;
};

type LinkDraftInput = Omit<UpsertProductCatalogLinkInput, "brandId">;
type ProductCatalogFormInput = z.input<typeof productCatalogFormSchema>;

type KnownAdObjectOption = {
  id: string;
  level: ProductCatalogFormValues["linkedAdObjectLevel"];
  name: string | null;
  status: string | null;
};

type CatalogProductSummary = {
  externalProductId: string;
  title: string | null;
  availability: LinkDraftInput["product"]["availability"];
  activeLinks: number;
  totalLinks: number;
  lastSeenAt: string | null;
};

type MetaPageOption = {
  id: string;
  name: string;
};

type MetaBusinessOption = {
  id: string;
  name: string;
  metaAccountIds: string[];
};

const EMPTY_LINK_DRAFT: LinkDraftInput = {
  product: {
    externalProductId: "",
    title: "",
    availability: "unknown",
    imageUrl: "",
    productUrl: "",
    currency: "",
  },
  adObject: {
    platform: "meta",
    objectType: "adset",
    externalObjectId: "",
    name: "",
    status: "",
  },
  activity: {
    isActive: true,
    source: "manual",
  },
};


function mapCatalogToFormValues(catalog: ProductCatalogRecord): ProductCatalogFormValues {
  return {
    name: catalog.name,
    externalCatalogId: catalog.externalCatalogId ?? "",
    businessId: catalog.businessId ?? "",
    catalogStoreId: catalog.catalogStoreId ?? "",
    vertical: catalog.vertical,
    feedUrl: catalog.feedUrl ?? "",
    defaultImageUrl: catalog.defaultImageUrl ?? "",
    fallbackImageUrl: catalog.fallbackImageUrl ?? "",
    linkedAdObjectLevel: catalog.linkedAdObjectLevel,
    linkedAdObjectIdsText: formatLinkedAdObjectIds(catalog.linkedAdObjectIds),
    notes: catalog.notes ?? "",
  };
}

function catalogLinkToUpsertInput(
  brandId: string,
  link: ProductCatalogLinkRecord,
  isActive: boolean
): UpsertProductCatalogLinkInput {
  return {
    brandId,
    product: {
      externalProductId: link.product.externalProductId,
      title: link.product.title ?? "",
      availability: link.product.availability,
      imageUrl: link.product.imageUrl ?? "",
      productUrl: link.product.productUrl ?? "",
      currency: link.product.currency ?? "",
    },
    adObject: {
      platform: link.adObject.platform,
      objectType: link.adObject.objectType,
      externalObjectId: link.adObject.externalObjectId,
      name: link.adObject.name ?? "",
      status: link.adObject.status ?? "",
    },
    activity: {
      isActive,
      source: "manual",
    },
  };
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="shrink-0 text-2xs font-semibold uppercase tracking-widest text-white/30">{label}</span>
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
}

export function ProductCatalogManagerPrimitive({ brandId }: ProductCatalogManagerPrimitiveProps) {
  const shouldReduceMotion = useReducedMotion();
  const latestCatalogLinkRequestRef = useRef<string | null>(null);
  const [catalogs, setCatalogs] = useState<ProductCatalogRecord[]>([]);
  const [activeCatalogId, setActiveCatalogId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [catalogLinks, setCatalogLinks] = useState<ProductCatalogLinkRecord[]>([]);
  const [catalogLinksError, setCatalogLinksError] = useState<string | null>(null);
  const [isCatalogLinksLoading, setIsCatalogLinksLoading] = useState(false);
  const [isCatalogLinkSaving, setIsCatalogLinkSaving] = useState(false);
  const [activeCatalogLinkId, setActiveCatalogLinkId] = useState<string | null>(null);
  const [isCatalogProductSaving, setIsCatalogProductSaving] = useState(false);
  const [activeCatalogProductId, setActiveCatalogProductId] = useState<string | null>(null);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [catalogStoreOpen, setCatalogStoreOpen] = useState(false);
  const [productRenameDrafts, setProductRenameDrafts] = useState<Record<string, string>>({});
  const [linkDraft, setLinkDraft] = useState<LinkDraftInput>(EMPTY_LINK_DRAFT);
  const [customLinkedAdObjectId, setCustomLinkedAdObjectId] = useState("");
  const [customActivityProductId, setCustomActivityProductId] = useState("");
  const [customActivityAdObjectId, setCustomActivityAdObjectId] = useState("");

  const form = useForm<ProductCatalogFormInput, unknown, ProductCatalogFormValues>({
    resolver: zodResolver(productCatalogFormSchema),
    defaultValues: EMPTY_PRODUCT_CATALOG_FORM,
    mode: "onBlur",
  });
  const selectableAssetsQuery = useSelectableAssets(undefined, { enabled: true });

  const activeCatalog = useMemo(
    () => catalogs.find((catalog) => catalog.id === activeCatalogId) ?? null,
    [catalogs, activeCatalogId]
  );
  const isCreateMode = activeCatalog === null;
  const watchedBusinessId = form.watch("businessId");
  const watchedCatalogStoreId = form.watch("catalogStoreId");
  const watchedLinkedAdObjectLevel = form.watch("linkedAdObjectLevel");
  const watchedLinkedAdObjectIdsText = form.watch("linkedAdObjectIdsText");
  const selectedLinkedAdObjectIds = useMemo(
    () => parseLinkedAdObjectIds(watchedLinkedAdObjectIdsText ?? ""),
    [watchedLinkedAdObjectIdsText]
  );
  const metaBusinessOptions = useMemo<MetaBusinessOption[]>(() => {
    const data = selectableAssetsQuery.data;
    if (!data) return [];
    const byId = new Map<string, MetaBusinessOption>();

    const provider = data.providers?.meta;
    const hierarchy = provider?.hierarchy as
      | {
          meta?: { integrations?: Array<{ businesses?: Array<{ business_id?: string | null; business_name?: string | null; ad_accounts?: Array<{ ad_account_id?: string | null }> }> }> };
          integrations?: Array<{ businesses?: Array<{ business_id?: string | null; business_name?: string | null; ad_accounts?: Array<{ ad_account_id?: string | null }> }> }>;
        }
      | undefined;

    const integrations = hierarchy?.meta?.integrations ?? hierarchy?.integrations ?? [];
    for (const integration of integrations) {
      for (const business of integration.businesses ?? []) {
        const businessId = (business.business_id ?? "").trim();
        if (!businessId) continue;
        const metaAccountIds = Array.from(
          new Set(
            (business.ad_accounts ?? [])
              .map((account) => (account.ad_account_id ?? "").trim())
              .filter((value) => value.length > 0)
          )
        );
        const existing = byId.get(businessId);
        if (!existing) {
          byId.set(businessId, {
            id: businessId,
            name: (business.business_name ?? "").trim() || `Business ${businessId}`,
            metaAccountIds,
          });
          continue;
        }
        if (existing.name.startsWith("Business ") && business.business_name?.trim()) {
          existing.name = business.business_name.trim();
        }
        existing.metaAccountIds = Array.from(new Set([...existing.metaAccountIds, ...metaAccountIds]));
      }
    }

    const metaAssets = getSelectableAssetsFlatListForProvider(data, "meta");
    for (const asset of metaAssets) {
      const businessId = asset.business_id?.trim();
      if (!businessId) continue;
      const existing = byId.get(businessId);
      if (!existing) {
        byId.set(businessId, {
          id: businessId,
          name: `Business ${businessId}`,
          metaAccountIds: asset.ad_account_id?.trim() ? [asset.ad_account_id.trim()] : [],
        });
        continue;
      }
      if (asset.ad_account_id?.trim()) {
        existing.metaAccountIds = Array.from(
          new Set([...existing.metaAccountIds, asset.ad_account_id.trim()])
        );
      }
    }

    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [selectableAssetsQuery.data]);

  const metaPageOptions = useMemo<MetaPageOption[]>(() => {
    const data = selectableAssetsQuery.data;
    if (!data) return [];
    const selectedBusinessId = (watchedBusinessId ?? "").trim();
    const metaAssets = getSelectableAssetsFlatListForProvider(data, "meta");
    const byId = new Map<string, MetaPageOption>();
    for (const asset of metaAssets) {
      if (asset.type !== "meta_page") continue;
      if (selectedBusinessId && asset.business_id?.trim() !== selectedBusinessId) continue;
      const id = asset.external_id?.trim();
      if (!id) continue;
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        name: getSelectableAssetLabel(asset),
      });
    }
    return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name));
  }, [selectableAssetsQuery.data, watchedBusinessId]);

  const selectedBusinessOption = useMemo(
    () => metaBusinessOptions.find((option) => option.id === (watchedBusinessId ?? "").trim()) ?? null,
    [metaBusinessOptions, watchedBusinessId]
  );

  const selectedMetaAccountId = useMemo(
    () => selectedBusinessOption?.metaAccountIds[0] ?? "",
    [selectedBusinessOption]
  );

  const selectedCatalogStoreOption = useMemo(
    () => metaPageOptions.find((option) => option.id === (watchedCatalogStoreId ?? "").trim()) ?? null,
    [metaPageOptions, watchedCatalogStoreId]
  );

  const knownAdObjectOptions = useMemo(() => {
    const byKey = new Map<string, KnownAdObjectOption>();
    const ensureOption = (value: KnownAdObjectOption) => {
      const key = `${value.level}:${value.id}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, value);
        return;
      }
      if (!existing.name && value.name) {
        existing.name = value.name;
      }
      if (!existing.status && value.status) {
        existing.status = value.status;
      }
    };

    for (const catalog of catalogs) {
      for (const linkedId of catalog.linkedAdObjectIds) {
        const normalizedId = linkedId.trim();
        if (!normalizedId) continue;
        ensureOption({
          id: normalizedId,
          level: catalog.linkedAdObjectLevel,
          name: null,
          status: null,
        });
      }
    }

    for (const link of catalogLinks) {
      const normalizedId = link.adObject.externalObjectId.trim();
      if (!normalizedId) continue;
      ensureOption({
        id: normalizedId,
        level: link.adObject.objectType,
        name: link.adObject.name ?? null,
        status: link.adObject.status ?? null,
      });
    }

    return Array.from(byKey.values()).sort((left, right) => left.id.localeCompare(right.id));
  }, [catalogLinks, catalogs]);

  const knownAdObjectOptionsForSelectedLevel = useMemo(() => {
    const levelOptions = knownAdObjectOptions.filter(
      (option) => option.level === watchedLinkedAdObjectLevel
    );
    const knownIds = new Set(levelOptions.map((option) => option.id));
    for (const selectedId of selectedLinkedAdObjectIds) {
      if (knownIds.has(selectedId)) continue;
      levelOptions.push({
        id: selectedId,
        level: watchedLinkedAdObjectLevel,
        name: null,
        status: null,
      });
    }
    return levelOptions.sort((left, right) => left.id.localeCompare(right.id));
  }, [knownAdObjectOptions, selectedLinkedAdObjectIds, watchedLinkedAdObjectLevel]);

  const knownActivityProducts = useMemo(() => {
    const byId = new Map<string, { id: string; title: string | null }>();
    for (const link of catalogLinks) {
      const normalizedId = link.product.externalProductId.trim();
      if (!normalizedId) continue;
      const existing = byId.get(normalizedId);
      if (!existing) {
        byId.set(normalizedId, { id: normalizedId, title: link.product.title ?? null });
        continue;
      }
      if (!existing.title && link.product.title) {
        existing.title = link.product.title;
      }
    }
    return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
  }, [catalogLinks]);

  const knownActivityStatuses = useMemo(() => {
    const defaults = ["ACTIVE", "PAUSED", "ARCHIVED"];
    const values = new Set(defaults);
    for (const link of catalogLinks) {
      const status = (link.adObject.status ?? "").trim();
      if (status) values.add(status);
    }
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [catalogLinks]);

  const knownActivitySources = useMemo(() => {
    const defaults = ["manual", "sync", "backfill", "reconcile"];
    const values = new Set(defaults);
    for (const link of catalogLinks) {
      const source = (link.activity.source ?? "").trim();
      if (source) values.add(source);
    }
    return Array.from(values).sort((left, right) => left.localeCompare(right));
  }, [catalogLinks]);

  const knownActivityAdObjectOptions = useMemo(
    () =>
      knownAdObjectOptions.filter(
        (option) => option.level === linkDraft.adObject.objectType
      ),
    [knownAdObjectOptions, linkDraft.adObject.objectType]
  );

  const activityProductSelectValue = useMemo(() => {
    const selectedId = linkDraft.product.externalProductId.trim();
    if (!selectedId) return PRODUCT_SELECT_CUSTOM;
    return knownActivityProducts.some((product) => product.id === selectedId)
      ? selectedId
      : PRODUCT_SELECT_CUSTOM;
  }, [knownActivityProducts, linkDraft.product.externalProductId]);

  const activityAdObjectSelectValue = useMemo(() => {
    const selectedId = linkDraft.adObject.externalObjectId.trim();
    if (!selectedId) return AD_OBJECT_SELECT_CUSTOM;
    return knownActivityAdObjectOptions.some((option) => option.id === selectedId)
      ? selectedId
      : AD_OBJECT_SELECT_CUSTOM;
  }, [knownActivityAdObjectOptions, linkDraft.adObject.externalObjectId]);

  const filteredCatalogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return catalogs;

    return catalogs.filter((catalog) => {
      const haystack = [
        catalog.name,
        catalog.externalCatalogId,
        catalog.businessId ?? "",
        catalog.catalogStoreId ?? "",
        PRODUCT_CATALOG_VERTICAL_LABELS[catalog.vertical],
        PRODUCT_CATALOG_SYNC_STATUS_LABELS[catalog.syncStatus],
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [catalogs, searchQuery]);

  const catalogLinkSummary = useMemo(
    () => ({
      total: catalogLinks.length,
      active: catalogLinks.filter((link) => link.activity.isActive).length,
      inactive: catalogLinks.filter((link) => !link.activity.isActive).length,
    }),
    [catalogLinks]
  );

  const catalogProducts = useMemo<CatalogProductSummary[]>(() => {
    const productsById = new Map<string, CatalogProductSummary>();
    for (const link of catalogLinks) {
      const key = link.product.externalProductId;
      const existing = productsById.get(key);
      if (!existing) {
        productsById.set(key, {
          externalProductId: key,
          title: link.product.title ?? null,
          availability: link.product.availability,
          activeLinks: link.activity.isActive ? 1 : 0,
          totalLinks: 1,
          lastSeenAt: link.activity.lastSeenAt,
        });
        continue;
      }
      existing.totalLinks += 1;
      if (link.activity.isActive) {
        existing.activeLinks += 1;
      }
      if (!existing.title && link.product.title) {
        existing.title = link.product.title;
      }
      if (new Date(link.activity.lastSeenAt).getTime() > new Date(existing.lastSeenAt ?? 0).getTime()) {
        existing.lastSeenAt = link.activity.lastSeenAt;
      }
    }
    return Array.from(productsById.values()).sort((left, right) =>
      left.externalProductId.localeCompare(right.externalProductId)
    );
  }, [catalogLinks]);

  const derivedCatalogItemCount = catalogProducts.length;

  const loadCatalogLinks = useCallback(
    async (catalogId: string, options?: { silent?: boolean }) => {
      latestCatalogLinkRequestRef.current = catalogId;
      if (!options?.silent) {
        setIsCatalogLinksLoading(true);
      }
      setCatalogLinksError(null);
      try {
        const links = await listProductCatalogLinks(catalogId, brandId, { activeOnly: false });
        if (latestCatalogLinkRequestRef.current !== catalogId) return;
        setCatalogLinks(links);
      } catch (loadError) {
        if (latestCatalogLinkRequestRef.current !== catalogId) return;
        setCatalogLinksError(loadError instanceof Error ? loadError.message : "Unable to load catalog product activity.");
      } finally {
        if (latestCatalogLinkRequestRef.current !== catalogId) return;
        setIsCatalogLinksLoading(false);
      }
    },
    [brandId]
  );

  useEffect(() => {
    if (activeCatalog) {
      form.reset(mapCatalogToFormValues(activeCatalog));
    } else {
      form.reset(EMPTY_PRODUCT_CATALOG_FORM);
    }
    setDeleteArmed(false);
  }, [activeCatalog, form]);

  useEffect(() => {
    setLinkDraft(EMPTY_LINK_DRAFT);
    setActiveCatalogLinkId(null);
    setActiveCatalogProductId(null);
    setProductRenameDrafts({});
    setCustomLinkedAdObjectId("");
    setCustomActivityProductId("");
    setCustomActivityAdObjectId("");
    if (!activeCatalogId) {
      latestCatalogLinkRequestRef.current = null;
      setCatalogLinks([]);
      setCatalogLinksError(null);
      setIsCatalogLinksLoading(false);
      return;
    }

    void loadCatalogLinks(activeCatalogId);
  }, [activeCatalogId, loadCatalogLinks]);

  useEffect(() => {
    if (!deleteArmed) return;
    const timeout = setTimeout(() => {
      setDeleteArmed(false);
    }, 5000);
    return () => clearTimeout(timeout);
  }, [deleteArmed]);

  useEffect(() => {
    const currentCatalogStoreId = (form.getValues("catalogStoreId") ?? "").trim();
    if (!currentCatalogStoreId) return;
    if (metaPageOptions.some((option) => option.id === currentCatalogStoreId)) return;
    form.setValue("catalogStoreId", "", {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  }, [form, metaPageOptions]);

  useEffect(() => {
    if (!isCreateMode) return;
    const currentBusinessId = (form.getValues("businessId") ?? "").trim();
    if (currentBusinessId || metaBusinessOptions.length === 0) return;
    form.setValue("businessId", metaBusinessOptions[0].id, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [form, isCreateMode, metaBusinessOptions]);

  useEffect(() => {
    if (!isCreateMode) return;
    const currentCatalogStoreId = (form.getValues("catalogStoreId") ?? "").trim();
    if (currentCatalogStoreId || metaPageOptions.length === 0) return;
    form.setValue("catalogStoreId", metaPageOptions[0].id, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [form, isCreateMode, metaPageOptions]);

  useEffect(() => {
    setProductRenameDrafts((current) => {
      const next: Record<string, string> = {};
      for (const product of catalogProducts) {
        next[product.externalProductId] = current[product.externalProductId] ?? product.title ?? "";
      }
      return next;
    });
  }, [catalogProducts]);

  useEffect(() => {
    let mounted = true;

    const loadCatalogs = async () => {
      setError(null);
      setIsLoading(true);
      try {
        const nextCatalogs = await listProductCatalogs(brandId);
        if (!mounted) return;

        setCatalogs(nextCatalogs);
        setActiveCatalogId((current) => {
          if (current && nextCatalogs.some((catalog) => catalog.id === current)) {
            return current;
          }
          return nextCatalogs[0]?.id ?? null;
        });
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load product catalogs.");
      } finally {
        if (!mounted) return;
        setIsLoading(false);
      }
    };

    void loadCatalogs();

    return () => {
      mounted = false;
    };
  }, [brandId]);

  const refreshCatalogs = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      const nextCatalogs = await listProductCatalogs(brandId);
      setCatalogs(nextCatalogs);
      const nextActiveCatalogId =
        (activeCatalogId && nextCatalogs.some((catalog) => catalog.id === activeCatalogId)
          ? activeCatalogId
          : nextCatalogs[0]?.id) ?? null;
      setActiveCatalogId(nextActiveCatalogId);
      if (nextActiveCatalogId) {
        await loadCatalogLinks(nextActiveCatalogId, { silent: true });
      } else {
        setCatalogLinks([]);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh product catalogs.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreateNew = () => {
    setActiveCatalogId(null);
    setDeleteArmed(false);
    setError(null);
    latestCatalogLinkRequestRef.current = null;
    setCatalogLinks([]);
    setCatalogLinksError(null);
    form.reset(EMPTY_PRODUCT_CATALOG_FORM);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    setIsSaving(true);

    try {
      if (activeCatalogId) {
        const updated = await updateProductCatalog(activeCatalogId, {
          name: values.name.trim(),
          businessId: values.businessId?.trim() ?? "",
          catalogStoreId: values.catalogStoreId?.trim() ?? "",
          vertical: values.vertical,
          feedUrl: values.feedUrl?.trim() ?? "",
          defaultImageUrl: values.defaultImageUrl?.trim() ?? "",
          fallbackImageUrl: values.fallbackImageUrl?.trim() ?? "",
          linkedAdObjectLevel: values.linkedAdObjectLevel,
          linkedAdObjectIds: parseLinkedAdObjectIds(values.linkedAdObjectIdsText ?? ""),
          dataFeedEnabled: activeCatalog?.dataFeedEnabled ?? true,
          productTaggingEnabled: activeCatalog?.productTaggingEnabled ?? true,
          syncStatus: activeCatalog?.syncStatus ?? "draft",
          productCount: activeCatalog?.productCount ?? derivedCatalogItemCount,
          feedCount: activeCatalog?.feedCount ?? 0,
          productSetCount: activeCatalog?.productSetCount ?? 0,
          lastSyncedAt: activeCatalog?.lastSyncedAt ?? null,
          notes: values.notes?.trim() ?? "",
        });
        setCatalogs((current) => [updated, ...current.filter((catalog) => catalog.id !== updated.id)]);
        setActiveCatalogId(updated.id);
        await loadCatalogLinks(updated.id, { silent: true });
      } else {
        if (!selectedMetaAccountId) {
          throw new Error("Selected Meta business has no connected ad account for API authorization.");
        }

        const created = await createProductCatalog({
          brandId,
          name: values.name.trim(),
          businessId: values.businessId.trim(),
          catalogStoreId: values.catalogStoreId.trim(),
          metaAccountId: selectedMetaAccountId,
          vertical: "commerce",
          linkedAdObjectLevel: values.linkedAdObjectLevel,
        });
        setCatalogs((current) => [created, ...current]);
        setActiveCatalogId(created.id);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save product catalog.");
    } finally {
      setIsSaving(false);
    }
  });

  const handleDelete = async () => {
    if (!activeCatalogId) return;

    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await deleteProductCatalog(activeCatalogId, {
        brandId,
        metaAccountId: selectedMetaAccountId || undefined,
      });
      setCatalogs((current) => {
        const nextCatalogs = current.filter((catalog) => catalog.id !== activeCatalogId);
        const nextActiveCatalogId = nextCatalogs[0]?.id ?? null;
        setActiveCatalogId(nextActiveCatalogId);
        if (nextCatalogs.length === 0) {
          form.reset(EMPTY_PRODUCT_CATALOG_FORM);
          setCatalogLinks([]);
        }
        return nextCatalogs;
      });
      setDeleteArmed(false);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete product catalog.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateCatalogLink = async () => {
    if (!activeCatalogId) return;

    setCatalogLinksError(null);
    setIsCatalogLinkSaving(true);
    setActiveCatalogLinkId(null);

    try {
      const savedLink = await upsertProductCatalogLink(activeCatalogId, {
        brandId,
        product: {
          externalProductId: linkDraft.product.externalProductId.trim(),
          title: linkDraft.product.title?.trim() ?? "",
          availability: linkDraft.product.availability,
          imageUrl: linkDraft.product.imageUrl?.trim() ?? "",
          productUrl: linkDraft.product.productUrl?.trim() ?? "",
          currency: linkDraft.product.currency?.trim() ?? "",
        },
        adObject: {
          platform: "meta",
          objectType: linkDraft.adObject.objectType,
          externalObjectId: linkDraft.adObject.externalObjectId.trim(),
          name: linkDraft.adObject.name?.trim() ?? "",
          status: linkDraft.adObject.status?.trim() ?? "",
        },
        activity: {
          isActive: linkDraft.activity.isActive,
          source: linkDraft.activity.source?.trim() || "manual",
        },
      });

      setCatalogLinks((current) => [
        savedLink,
        ...current.filter((entry) => entry.activity.id !== savedLink.activity.id),
      ]);
      setLinkDraft(EMPTY_LINK_DRAFT);
    } catch (saveError) {
      setCatalogLinksError(saveError instanceof Error ? saveError.message : "Unable to save product activity link.");
    } finally {
      setIsCatalogLinkSaving(false);
    }
  };

  const handleToggleCatalogLink = async (link: ProductCatalogLinkRecord, nextIsActive: boolean) => {
    if (!activeCatalogId) return;

    setCatalogLinksError(null);
    setIsCatalogLinkSaving(true);
    setActiveCatalogLinkId(link.activity.id);

    try {
      const updatedLink = await upsertProductCatalogLink(
        activeCatalogId,
        catalogLinkToUpsertInput(brandId, link, nextIsActive)
      );
      setCatalogLinks((current) => [
        updatedLink,
        ...current.filter((entry) => entry.activity.id !== updatedLink.activity.id),
      ]);
    } catch (saveError) {
      setCatalogLinksError(saveError instanceof Error ? saveError.message : "Unable to update product activity status.");
    } finally {
      setActiveCatalogLinkId(null);
      setIsCatalogLinkSaving(false);
    }
  };

  const handleRenameCatalogProduct = async (externalProductId: string) => {
    if (!activeCatalogId) return;
    setCatalogLinksError(null);
    setIsCatalogProductSaving(true);
    setActiveCatalogProductId(externalProductId);
    try {
      await renameCatalogProduct(activeCatalogId, {
        brandId,
        externalProductId,
        title: (productRenameDrafts[externalProductId] ?? "").trim(),
      });
      await loadCatalogLinks(activeCatalogId, { silent: true });
    } catch (saveError) {
      setCatalogLinksError(saveError instanceof Error ? saveError.message : "Unable to rename catalog product.");
    } finally {
      setActiveCatalogProductId(null);
      setIsCatalogProductSaving(false);
    }
  };

  const handleRemoveCatalogProduct = async (externalProductId: string) => {
    if (!activeCatalogId) return;
    setCatalogLinksError(null);
    setIsCatalogProductSaving(true);
    setActiveCatalogProductId(externalProductId);
    try {
      await removeCatalogProduct(activeCatalogId, {
        brandId,
        externalProductId,
      });
      await loadCatalogLinks(activeCatalogId, { silent: true });
    } catch (deleteError) {
      setCatalogLinksError(deleteError instanceof Error ? deleteError.message : "Unable to remove catalog product.");
    } finally {
      setActiveCatalogProductId(null);
      setIsCatalogProductSaving(false);
    }
  };

  const setLinkedAdObjectIds = (nextIds: string[]) => {
    form.setValue("linkedAdObjectIdsText", formatLinkedAdObjectIds(Array.from(new Set(nextIds))), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const handleLinkedAdObjectSelection = (adObjectId: string, checked: boolean) => {
    if (checked) {
      setLinkedAdObjectIds([...selectedLinkedAdObjectIds, adObjectId]);
      return;
    }
    setLinkedAdObjectIds(selectedLinkedAdObjectIds.filter((value) => value !== adObjectId));
  };

  const handleAddCustomLinkedAdObjectId = () => {
    const normalized = customLinkedAdObjectId.trim();
    if (!normalized) return;
    if (!selectedLinkedAdObjectIds.includes(normalized)) {
      setLinkedAdObjectIds([...selectedLinkedAdObjectIds, normalized]);
    }
    setCustomLinkedAdObjectId("");
  };

  const handleActivityProductSelection = (value: string) => {
    if (value === PRODUCT_SELECT_CUSTOM) {
      setLinkDraft((current) => ({
        ...current,
        product: { ...current.product, externalProductId: customActivityProductId.trim() },
      }));
      return;
    }
    const matched = knownActivityProducts.find((product) => product.id === value);
    setLinkDraft((current) => ({
      ...current,
      product: {
        ...current.product,
        externalProductId: value,
        title: current.product.title?.trim() ? current.product.title : matched?.title ?? "",
      },
    }));
  };

  const handleActivityAdObjectSelection = (value: string) => {
    if (value === AD_OBJECT_SELECT_CUSTOM) {
      setLinkDraft((current) => ({
        ...current,
        adObject: { ...current.adObject, externalObjectId: customActivityAdObjectId.trim() },
      }));
      return;
    }
    const matched = knownActivityAdObjectOptions.find((option) => option.id === value);
    setLinkDraft((current) => ({
      ...current,
      adObject: {
        ...current.adObject,
        externalObjectId: value,
        name: current.adObject.name?.trim() ? current.adObject.name : matched?.name ?? "",
        status: current.adObject.status?.trim() ? current.adObject.status : matched?.status ?? "",
      },
    }));
  };


  return (
    <motion.div
      className="flex flex-col gap-4"
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: MOTION_EASE }}
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_1fr]">
        {/* Catalog list */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <Heading size="3" className="text-white">Catalogs</Heading>
              <Text size="1" color="gray">{catalogs.length} configured</Text>
            </div>
            <Flex align="center" gap="2">
              <button
                type="button"
                onClick={() => void refreshCatalogs()}
                disabled={isRefreshing || isLoading}
                aria-label="Refresh catalogs"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-white/10 text-muted-foreground transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              </button>
              <Button type="button" size="sm" className="h-8 cursor-pointer gap-1.5" onClick={handleCreateNew}>
                <Plus className="h-3.5 w-3.5" />
                New
              </Button>
            </Flex>
          </div>

          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search catalogs…"
            inputSize="sm"
            aria-label="Search product catalogs"
          />

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[52px] animate-pulse rounded-lg border border-white/[0.04] bg-white/[0.03]" />
              ))}
            </div>
          ) : filteredCatalogs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 py-10 text-center">
              <Database className="h-7 w-7 text-white/20" aria-hidden />
              <div className="space-y-1">
                <Text size="2" className="font-medium text-white/70">No catalogs</Text>
                <Text size="1" color="gray" className="mx-auto block max-w-[180px] leading-relaxed">
                  {searchQuery
                    ? "No catalogs match your search."
                    : "Create a catalog to link Meta product feeds to your campaigns."}
                </Text>
              </div>
              {!searchQuery ? (
                <Button type="button" size="sm" onClick={handleCreateNew} className="mt-1 cursor-pointer gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Create First Catalog
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="flex max-h-[36rem] flex-col gap-1 overflow-y-auto pr-0.5">
              <AnimatePresence initial={false}>
                {filteredCatalogs.map((catalog) => {
                  const selected = catalog.id === activeCatalogId;
                  const statusDot =
                    catalog.syncStatus === "active" ? "bg-green-400"
                    : catalog.syncStatus === "stale" ? "bg-amber-400"
                    : catalog.syncStatus === "error" ? "bg-red-400"
                    : "bg-white/20";
                  return (
                    <motion.button
                      key={catalog.id}
                      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
                      transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: MOTION_EASE }}
                      type="button"
                      onClick={() => setActiveCatalogId(catalog.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActiveCatalogId(catalog.id);
                        }
                      }}
                      className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                        selected
                          ? "border-primary/40 bg-primary/[0.12]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium leading-snug text-white">{catalog.name}</div>
                          <div className="mt-0.5 truncate font-mono text-xs leading-tight text-white/40">
                            {catalog.externalCatalogId || "—"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs font-semibold text-white/80">{catalog.productCount.toLocaleString()}</div>
                          <div className="text-2xs text-white/30">{catalog.linkedAdObjectIds.length} linked</div>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Detail / form panel */}
        <div className="glass-panel rounded-xl p-5">
          <Flex direction="column" gap="4">
            <Flex align="start" justify="between" gap="3" wrap="wrap">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeCatalog?.id ?? "new"}
                  initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: MOTION_EASE }}
                >
                  <Heading size="4" className="text-white">
                    {activeCatalog ? activeCatalog.name : "New Product Catalog"}
                  </Heading>
                  <Text size="1" color="gray">
                    {activeCatalog
                      ? "Edit catalog settings, feed config, and ad object mapping."
                      : "Register a Meta-backed product catalog for DCO feed delivery."}
                  </Text>
                </motion.div>
              </AnimatePresence>
              {activeCatalog ? (
                <Badge color={SYNC_STATUS_BADGE_COLOR[activeCatalog.syncStatus]} radius="full" variant="soft">
                  {PRODUCT_CATALOG_SYNC_STATUS_LABELS[activeCatalog.syncStatus]}
                </Badge>
              ) : null}
            </Flex>

            <AnimatePresence initial={false}>
              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: MOTION_EASE }}
                >
                  <Callout.Root color="red" variant="surface">
                    <Callout.Icon><AlertTriangle className="h-4 w-4" /></Callout.Icon>
                    <Callout.Text>{error}</Callout.Text>
                  </Callout.Root>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {!isCreateMode && activeCatalog ? (
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.06] sm:grid-cols-6">
                {[
                  { label: "Products", value: activeCatalog.productCount.toLocaleString() },
                  { label: "Feeds", value: String(activeCatalog.feedCount) },
                  { label: "Product Sets", value: String(activeCatalog.productSetCount) },
                  { label: "Vertical", value: PRODUCT_CATALOG_VERTICAL_LABELS[activeCatalog.vertical] },
                  { label: "Status", value: PRODUCT_CATALOG_SYNC_STATUS_LABELS[activeCatalog.syncStatus] },
                  {
                    label: "Last Synced",
                    value: activeCatalog.lastSyncedAt
                      ? new Date(activeCatalog.lastSyncedAt).toLocaleDateString()
                      : "Never",
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-background/60 px-3 py-2.5">
                    <div className="text-2xs font-semibold uppercase tracking-widest text-white/30">{label}</div>
                    <div className="mt-0.5 truncate text-xs text-white/75">{value}</div>
                  </div>
                ))}
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={(event) => void onSubmit(event)}>
              {/* Identity */}
              <div className="space-y-4">
                <SectionDivider label="Identity" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="catalog-name">Catalog Name</Label>
                    <Input id="catalog-name" placeholder="Spring Prospecting 2026" {...form.register("name")} />
                    {form.formState.errors.name ? <Text size="1" color="red">{form.formState.errors.name.message}</Text> : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Meta Business</Label>
                    <Popover open={businessOpen} onOpenChange={setBusinessOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button" variant="outline" role="combobox"
                          aria-expanded={businessOpen}
                          className="h-10 w-full cursor-pointer justify-between text-left font-normal"
                          disabled={selectableAssetsQuery.isLoading}
                        >
                          <span className="truncate">
                            {selectedBusinessOption
                              ? `${selectedBusinessOption.name} (${selectedBusinessOption.id})`
                              : watchedBusinessId?.trim() ? watchedBusinessId.trim()
                              : selectableAssetsQuery.isLoading ? "Loading…"
                              : "Select business"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search by name or ID…" className="h-9" />
                          <CommandList>
                            <CommandEmpty>No businesses found.</CommandEmpty>
                            <CommandGroup heading="Businesses">
                              {metaBusinessOptions.map((business) => (
                                <CommandItem
                                  key={business.id}
                                  value={`${business.name} ${business.id}`}
                                  keywords={[business.id]}
                                  onSelect={() => {
                                    form.setValue("businessId", business.id, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                    setBusinessOpen(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check className={cn("mr-2 h-4 w-4", watchedBusinessId?.trim() === business.id ? "opacity-100" : "opacity-0")} />
                                  <span className="truncate">{business.name}</span>
                                  <span className="ml-auto truncate pl-2 font-mono text-xs text-muted-foreground">{business.id}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {form.formState.errors.businessId ? <Text size="1" color="red">{form.formState.errors.businessId.message}</Text> : null}
                    {watchedBusinessId?.trim() ? (
                      <button
                        type="button"
                        onClick={() => form.setValue("businessId", "", { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
                        className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-white"
                      >
                        Clear selection
                      </button>
                    ) : null}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>
                      Catalog Store{" "}
                      <Text size="1" color="gray" className="font-normal">(Page ID Connector)</Text>
                    </Label>
                    <Popover open={catalogStoreOpen} onOpenChange={setCatalogStoreOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button" variant="outline" role="combobox"
                          aria-expanded={catalogStoreOpen}
                          className="h-10 w-full cursor-pointer justify-between text-left font-normal"
                          disabled={selectableAssetsQuery.isLoading || !watchedBusinessId?.trim()}
                        >
                          <span className="truncate">
                            {selectedCatalogStoreOption
                              ? `${selectedCatalogStoreOption.name} (${selectedCatalogStoreOption.id})`
                              : watchedCatalogStoreId?.trim() ? watchedCatalogStoreId.trim()
                              : !watchedBusinessId?.trim() ? "Select a business first"
                              : selectableAssetsQuery.isLoading ? "Loading pages…"
                              : "Select page"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search pages…" className="h-9" />
                          <CommandList>
                            <CommandEmpty>No pages found.</CommandEmpty>
                            <CommandGroup heading="Pages">
                              {metaPageOptions.map((page) => (
                                <CommandItem
                                  key={page.id}
                                  value={`${page.name} ${page.id}`}
                                  keywords={[page.id]}
                                  onSelect={() => {
                                    form.setValue("catalogStoreId", page.id, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                                    setCatalogStoreOpen(false);
                                  }}
                                  className="cursor-pointer"
                                >
                                  <Check className={cn("mr-2 h-4 w-4", watchedCatalogStoreId?.trim() === page.id ? "opacity-100" : "opacity-0")} />
                                  <span className="truncate">{page.name}</span>
                                  <span className="ml-auto truncate pl-2 font-mono text-xs text-muted-foreground">{page.id}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {form.formState.errors.catalogStoreId ? <Text size="1" color="red">{form.formState.errors.catalogStoreId.message}</Text> : null}
                  </div>
                </div>

                {isCreateMode ? (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <Text size="1" color="gray">
                      Meta assigns catalog ID and statistics after creation. Only name, business, and store page are required.
                    </Text>
                    {!selectedMetaAccountId && watchedBusinessId?.trim() ? (
                      <Text size="1" color="red" className="mt-1 block">
                        No connected Meta ad account found for this business.
                      </Text>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Feed config — edit only */}
              {!isCreateMode ? (
                <div className="space-y-4">
                  <SectionDivider label="Feed Configuration" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-feed-url">Feed URL</Label>
                      <Input id="catalog-feed-url" placeholder="https://example.com/feed.xml" {...form.register("feedUrl")} />
                      {form.formState.errors.feedUrl ? <Text size="1" color="red">{form.formState.errors.feedUrl.message}</Text> : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-default-image">Default Image</Label>
                      <Input id="catalog-default-image" placeholder="https://cdn.example.com/default.jpg" {...form.register("defaultImageUrl")} />
                      {form.formState.errors.defaultImageUrl ? <Text size="1" color="red">{form.formState.errors.defaultImageUrl.message}</Text> : null}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-fallback-image">Fallback Image</Label>
                      <Input id="catalog-fallback-image" placeholder="https://cdn.example.com/fallback.jpg" {...form.register("fallbackImageUrl")} />
                      {form.formState.errors.fallbackImageUrl ? <Text size="1" color="red">{form.formState.errors.fallbackImageUrl.message}</Text> : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Ad object mapping — edit only */}
              {!isCreateMode ? (
                <div className="space-y-4">
                  <SectionDivider label="Ad Object Mapping" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="catalog-linked-level">Link Level</Label>
                      <Select
                        value={watchedLinkedAdObjectLevel}
                        onValueChange={(value) => {
                          form.setValue("linkedAdObjectLevel", value as ProductCatalogFormValues["linkedAdObjectLevel"], { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                          setLinkedAdObjectIds([]);
                          setCustomLinkedAdObjectId("");
                        }}
                      >
                        <SelectTrigger id="catalog-linked-level" className="w-full">
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="campaign">Campaign</SelectItem>
                          <SelectItem value="adset">Ad Set</SelectItem>
                          <SelectItem value="ad">Ad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Linked Ad Object IDs</Label>
                      <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-md border border-white/[0.08] bg-background/30 p-2.5">
                        {knownAdObjectOptionsForSelectedLevel.length === 0 ? (
                          <Text size="1" color="gray">No {watchedLinkedAdObjectLevel} IDs found. Add a custom ID below.</Text>
                        ) : (
                          knownAdObjectOptionsForSelectedLevel.map((option) => (
                            <div key={`${option.level}:${option.id}`} className="flex items-center gap-2">
                              <Checkbox
                                id={`catalog-linked-id-${option.level}-${option.id}`}
                                checked={selectedLinkedAdObjectIds.includes(option.id)}
                                onCheckedChange={(checked) => handleLinkedAdObjectSelection(option.id, checked === true)}
                              />
                              <Label htmlFor={`catalog-linked-id-${option.level}-${option.id}`} className="cursor-pointer font-mono text-xs font-normal">
                                {option.id}{option.name ? ` · ${option.name}` : ""}
                              </Label>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder={`Add custom ${watchedLinkedAdObjectLevel} ID`}
                          value={customLinkedAdObjectId}
                          onChange={(event) => setCustomLinkedAdObjectId(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") { event.preventDefault(); handleAddCustomLinkedAdObjectId(); }
                          }}
                          inputSize="sm"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={handleAddCustomLinkedAdObjectId} className="cursor-pointer shrink-0">
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Notes — edit only */}
              {!isCreateMode ? (
                <div className="space-y-1.5">
                  <Label htmlFor="catalog-notes">Notes</Label>
                  <Textarea id="catalog-notes" rows={2} placeholder="Feed caveats, validation notes, product set details…" {...form.register("notes")} />
                </div>
              ) : null}

              {/* Destructive delete confirmation */}
              <AnimatePresence initial={false}>
                {deleteArmed && activeCatalog ? (
                  <motion.div
                    initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: MOTION_EASE }}
                  >
                    <Callout.Root color="red" variant="surface" size="1">
                      <Callout.Icon><AlertTriangle className="h-3.5 w-3.5" /></Callout.Icon>
                      <Callout.Text>
                        <strong>{activeCatalog.name}</strong> will be permanently removed from Continuum and Meta. This cannot be undone.
                      </Callout.Text>
                    </Callout.Root>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {/* Form actions */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  {activeCatalog ? (
                    <Text size="1" color="gray">Updated {new Date(activeCatalog.updatedAt).toLocaleString()}</Text>
                  ) : null}
                  {form.formState.isDirty ? <Text size="1" color="amber">Unsaved changes</Text> : null}
                </div>
                <Flex align="center" gap="2">
                  {activeCatalog ? (
                    <Button
                      type="button"
                      variant={deleteArmed ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => void handleDelete()}
                      disabled={isDeleting || isSaving}
                      className="cursor-pointer gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isDeleting ? "Deleting…" : deleteArmed ? "Confirm" : "Delete"}
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSaving || isDeleting || (isCreateMode && !selectedMetaAccountId)}
                    className="cursor-pointer"
                  >
                    {isSaving ? "Saving…" : activeCatalog ? "Update Catalog" : "Create Catalog"}
                  </Button>
                </Flex>
              </div>
            </form>
          </Flex>
        </div>
      </div>

      {/* Product activity — only when a catalog is selected */}
      {activeCatalog ? (
        <motion.div
          className="glass-panel rounded-xl p-5"
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: MOTION_EASE, delay: shouldReduceMotion ? 0 : 0.12 }}
        >
          <Flex direction="column" gap="4">
            <Flex align="center" justify="between" wrap="wrap" gap="2">
              <div>
                <Heading size="3" className="text-white">Product Activity Mapping</Heading>
                <Text size="1" color="gray">Link products to campaign objects for DCO attribution and feed diagnostics.</Text>
              </div>
              <Flex align="center" gap="2">
                <Badge color="gray" radius="full" variant="soft">{catalogLinkSummary.total} tracked</Badge>
                <Badge color="green" radius="full" variant="soft">{catalogLinkSummary.active} active</Badge>
                {catalogLinkSummary.inactive > 0 ? (
                  <Badge color="amber" radius="full" variant="soft">{catalogLinkSummary.inactive} inactive</Badge>
                ) : null}
              </Flex>
            </Flex>

            <AnimatePresence initial={false}>
              {catalogLinksError ? (
                <motion.div
                  initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -4 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: MOTION_EASE }}
                >
                  <Callout.Root color="red" variant="surface">
                    <Callout.Icon><AlertTriangle className="h-4 w-4" /></Callout.Icon>
                    <Callout.Text>{catalogLinksError}</Callout.Text>
                  </Callout.Root>
                </motion.div>
              ) : null}
            </AnimatePresence>

            {/* Products list */}
            <div className="space-y-3">
              <SectionDivider label={`Catalog Products (${catalogProducts.length})`} />
              {isCatalogLinksLoading ? (
                <div className="space-y-2">
                  {[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded-md bg-white/[0.03]" />)}
                </div>
              ) : catalogProducts.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.08] py-6 text-center">
                  <Text size="1" color="gray">No products yet. Add one using the activity form below.</Text>
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-white/[0.08]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Availability</TableHead>
                        <TableHead>Links</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalogProducts.map((product) => (
                        <TableRow key={product.externalProductId}>
                          <TableCell>
                            <div className="font-mono text-xs font-medium text-white">{product.externalProductId}</div>
                            <div className="text-xs text-muted-foreground">
                              {product.title?.trim() || "Untitled"}{product.lastSeenAt ? ` · ${new Date(product.lastSeenAt).toLocaleDateString()}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{product.availability}</TableCell>
                          <TableCell className="text-xs">
                            <span className="text-green-400">{product.activeLinks}</span>
                            <span className="text-muted-foreground">/{product.totalLinks}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Input
                                value={productRenameDrafts[product.externalProductId] ?? ""}
                                onChange={(e) => setProductRenameDrafts((current) => ({ ...current, [product.externalProductId]: e.target.value }))}
                                placeholder="Rename product"
                                inputSize="sm"
                                className="w-36"
                              />
                              <Button type="button" size="sm" variant="outline" disabled={isCatalogProductSaving} onClick={() => void handleRenameCatalogProduct(product.externalProductId)} className="cursor-pointer shrink-0">
                                {isCatalogProductSaving && activeCatalogProductId === product.externalProductId ? "…" : "Rename"}
                              </Button>
                              <Button type="button" size="sm" variant="destructive" disabled={isCatalogProductSaving} onClick={() => void handleRemoveCatalogProduct(product.externalProductId)} className="cursor-pointer shrink-0">
                                {isCatalogProductSaving && activeCatalogProductId === product.externalProductId ? "…" : "Remove"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Add activity link form */}
            <div className="space-y-4">
              <SectionDivider label="Add Product Activity Link" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="activity-product-id-select">Product ID</Label>
                  <Select value={activityProductSelectValue} onValueChange={handleActivityProductSelection}>
                    <SelectTrigger id="activity-product-id-select" className="w-full"><SelectValue placeholder="Choose or add product" /></SelectTrigger>
                    <SelectContent>
                      {knownActivityProducts.map((product) => (
                        <SelectItem key={product.id} value={product.id}>{product.id}{product.title ? ` · ${product.title}` : ""}</SelectItem>
                      ))}
                      <SelectItem value={PRODUCT_SELECT_CUSTOM}>Custom Product ID…</SelectItem>
                    </SelectContent>
                  </Select>
                  {activityProductSelectValue === PRODUCT_SELECT_CUSTOM ? (
                    <Input
                      placeholder="sku_12345"
                      value={linkDraft.product.externalProductId}
                      onChange={(e) => {
                        setCustomActivityProductId(e.target.value);
                        setLinkDraft((current) => ({ ...current, product: { ...current.product, externalProductId: e.target.value } }));
                      }}
                      inputSize="sm"
                    />
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-product-title">Product Title</Label>
                  <Input
                    id="activity-product-title"
                    placeholder="Weekend Hoodie"
                    value={linkDraft.product.title ?? ""}
                    onChange={(e) => setLinkDraft((current) => ({ ...current, product: { ...current.product, title: e.target.value } }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="activity-availability">Availability</Label>
                  <Select value={linkDraft.product.availability} onValueChange={(value) => setLinkDraft((current) => ({ ...current, product: { ...current.product, availability: value as LinkDraftInput["product"]["availability"] } }))}>
                    <SelectTrigger id="activity-availability" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">Unknown</SelectItem>
                      <SelectItem value="in_stock">In Stock</SelectItem>
                      <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                      <SelectItem value="preorder">Preorder</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-object-type">Ad Object Type</Label>
                  <Select value={linkDraft.adObject.objectType} onValueChange={(value) => setLinkDraft((current) => ({ ...current, adObject: { ...current.adObject, objectType: value as LinkDraftInput["adObject"]["objectType"], externalObjectId: "" } }))}>
                    <SelectTrigger id="activity-object-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="campaign">Campaign</SelectItem>
                      <SelectItem value="adset">Ad Set</SelectItem>
                      <SelectItem value="ad">Ad</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-object-id-select">Ad Object ID</Label>
                  <Select value={activityAdObjectSelectValue} onValueChange={handleActivityAdObjectSelection}>
                    <SelectTrigger id="activity-object-id-select" className="w-full"><SelectValue placeholder="Choose ID" /></SelectTrigger>
                    <SelectContent>
                      {knownActivityAdObjectOptions.map((option) => (
                        <SelectItem key={`${option.level}:${option.id}`} value={option.id}>{option.id}{option.name ? ` · ${option.name}` : ""}</SelectItem>
                      ))}
                      <SelectItem value={AD_OBJECT_SELECT_CUSTOM}>Custom Ad Object ID…</SelectItem>
                    </SelectContent>
                  </Select>
                  {activityAdObjectSelectValue === AD_OBJECT_SELECT_CUSTOM ? (
                    <Input
                      placeholder="adset_9876"
                      value={linkDraft.adObject.externalObjectId}
                      onChange={(e) => {
                        setCustomActivityAdObjectId(e.target.value);
                        setLinkDraft((current) => ({ ...current, adObject: { ...current.adObject, externalObjectId: e.target.value } }));
                      }}
                      inputSize="sm"
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="activity-object-name">Ad Object Name</Label>
                  <Input id="activity-object-name" placeholder="Prospecting · Broad 18-34" value={linkDraft.adObject.name ?? ""} onChange={(e) => setLinkDraft((current) => ({ ...current, adObject: { ...current.adObject, name: e.target.value } }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-object-status">Delivery Status</Label>
                  <Select value={(linkDraft.adObject.status ?? "").trim() || "ACTIVE"} onValueChange={(value) => setLinkDraft((current) => ({ ...current, adObject: { ...current.adObject, status: value } }))}>
                    <SelectTrigger id="activity-object-status" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {knownActivityStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activity-source">Source</Label>
                  <Select value={(linkDraft.activity.source ?? "").trim() || "manual"} onValueChange={(value) => setLinkDraft((current) => ({ ...current, activity: { ...current.activity, source: value } }))}>
                    <SelectTrigger id="activity-source" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {knownActivitySources.map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Flex align="center" justify="between" wrap="wrap" gap="3">
                <label htmlFor="activity-is-active" className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 transition-colors hover:bg-white/[0.04]">
                  <Checkbox
                    id="activity-is-active"
                    checked={linkDraft.activity.isActive}
                    onCheckedChange={(checked) => setLinkDraft((current) => ({ ...current, activity: { ...current.activity, isActive: checked === true } }))}
                  />
                  <Text size="2" className="text-white/80">Mark as active in delivery</Text>
                </label>
                <Button type="button" size="sm" disabled={isCatalogLinkSaving || isCatalogLinksLoading} onClick={() => void handleCreateCatalogLink()} className="cursor-pointer">
                  {isCatalogLinkSaving && !activeCatalogLinkId ? "Saving…" : "Save Product Activity"}
                </Button>
              </Flex>
            </div>

            {/* Activity links table */}
            {isCatalogLinksLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-md bg-white/[0.03]" />)}
              </div>
            ) : catalogLinks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/[0.08] py-6 text-center">
                <Text size="1" color="gray">No product-to-ad activity links recorded for this catalog yet.</Text>
              </div>
            ) : (
              <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-white/[0.08]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Ad Object</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Seen</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {catalogLinks.map((link) => (
                      <TableRow key={link.activity.id}>
                        <TableCell>
                          <div className="font-mono text-xs font-medium text-white">{link.product.externalProductId}</div>
                          <div className="text-xs text-muted-foreground">{link.product.title ?? "Untitled"} · {link.product.availability}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-white">{link.adObject.objectType.toUpperCase()} · {link.adObject.externalObjectId}</div>
                          <div className="text-xs text-muted-foreground">{link.adObject.name ?? "Unnamed"}{link.adObject.status ? ` (${link.adObject.status})` : ""}</div>
                        </TableCell>
                        <TableCell>
                          <Badge color={link.activity.isActive ? "green" : "gray"} radius="full" variant="soft">
                            {link.activity.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(link.activity.lastSeenAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={isCatalogLinkSaving}
                            onClick={() => void handleToggleCatalogLink(link, !link.activity.isActive)}
                            className="cursor-pointer"
                          >
                            {isCatalogLinkSaving && activeCatalogLinkId === link.activity.id
                              ? "…"
                              : link.activity.isActive ? "Deactivate" : "Activate"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Flex>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
