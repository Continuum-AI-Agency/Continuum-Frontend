"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Callout, Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useForm } from "react-hook-form";
import { AlertTriangle, Check, ChevronsUpDown, Database, Link2, Plus, RefreshCw, Trash2 } from "lucide-react";
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

function toLocalDateTimeInput(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoDateTime(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function mapCatalogToFormValues(catalog: ProductCatalogRecord): ProductCatalogFormValues {
  return {
    name: catalog.name,
    externalCatalogId: catalog.externalCatalogId,
    businessId: catalog.businessId ?? "",
    catalogStoreId: catalog.catalogStoreId ?? "",
    vertical: catalog.vertical,
    feedUrl: catalog.feedUrl ?? "",
    defaultImageUrl: catalog.defaultImageUrl ?? "",
    fallbackImageUrl: catalog.fallbackImageUrl ?? "",
    linkedAdObjectLevel: catalog.linkedAdObjectLevel,
    linkedAdObjectIdsText: formatLinkedAdObjectIds(catalog.linkedAdObjectIds),
    dataFeedEnabled: catalog.dataFeedEnabled,
    productTaggingEnabled: catalog.productTaggingEnabled,
    syncStatus: catalog.syncStatus,
    productCount: catalog.productCount,
    feedCount: catalog.feedCount,
    productSetCount: catalog.productSetCount,
    lastSyncedAtLocal: toLocalDateTimeInput(catalog.lastSyncedAt),
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
          dataFeedEnabled: values.dataFeedEnabled,
          productTaggingEnabled: values.productTaggingEnabled,
          syncStatus: values.syncStatus,
          productCount: activeCatalog?.productCount ?? derivedCatalogItemCount,
          feedCount: values.feedCount,
          productSetCount: values.productSetCount,
          lastSyncedAt: toIsoDateTime(values.lastSyncedAtLocal ?? ""),
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
      await deleteProductCatalog(activeCatalogId);
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
      className="space-y-4"
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.28, ease: MOTION_EASE }}
    >
      <motion.div
        className="grid grid-cols-1 gap-4 xl:grid-cols-12"
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.24, ease: MOTION_EASE, delay: shouldReduceMotion ? 0 : 0.08 }}
      >
        <Card className="glass-panel p-4 xl:col-span-4">
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between" gap="2">
              <Heading size="4" className="text-white">Catalogs</Heading>
              <Flex align="center" gap="2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void refreshCatalogs()}
                  disabled={isRefreshing || isLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button type="button" size="sm" className="h-8" onClick={handleCreateNew}>
                  <Plus className="h-3.5 w-3.5" />
                  New
                </Button>
              </Flex>
            </Flex>

            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, id, vertical..."
              inputSize="sm"
              aria-label="Search product catalogs"
            />

            <Separator size="4" />

            {isLoading ? (
              <Card variant="surface" className="border border-[var(--glass-border)] p-4 text-center">
                <Text size="2" color="gray">Loading catalogs…</Text>
              </Card>
            ) : filteredCatalogs.length === 0 ? (
              <Card variant="surface" className="border border-dashed border-[var(--glass-border)] p-4 text-center">
                <Flex direction="column" align="center" gap="2">
                  <Database className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  <Text size="2" color="gray">No catalogs yet.</Text>
                  <Text size="1" color="gray">
                    Create a catalog to manage feeds and product tagging for DCO ad delivery.
                  </Text>
                </Flex>
              </Card>
            ) : (
              <div className="max-h-[32rem] overflow-y-auto pr-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence initial={false}>
                      {filteredCatalogs.map((catalog) => {
                        const selected = catalog.id === activeCatalogId;
                        return (
                          <motion.tr
                            key={catalog.id}
                            initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }}
                            transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: MOTION_EASE }}
                            onClick={() => setActiveCatalogId(catalog.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setActiveCatalogId(catalog.id);
                              }
                            }}
                            tabIndex={0}
                            className={`cursor-pointer border-b transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
                              selected ? "bg-primary/10" : "hover:bg-background/35"
                            }`}
                          >
                            <TableCell className="max-w-[11rem]">
                              <div className="truncate text-sm font-medium text-white">{catalog.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {catalog.externalCatalogId}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge color={SYNC_STATUS_BADGE_COLOR[catalog.syncStatus]} radius="full" variant="surface">
                                {PRODUCT_CATALOG_SYNC_STATUS_LABELS[catalog.syncStatus]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="text-sm text-white">{catalog.productCount}</div>
                              <div className="text-xs text-muted-foreground">
                                {catalog.linkedAdObjectIds.length} linked
                              </div>
                            </TableCell>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            )}
          </Flex>
        </Card>

        <Card className="glass-panel p-4 xl:col-span-8">
          <Flex direction="column" gap="4">
            <Flex align="center" justify="between" gap="3" wrap="wrap">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={activeCatalog?.id ?? "new"}
                  initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -8 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: MOTION_EASE }}
                >
                  <Heading size="4" className="text-white">
                    {activeCatalog ? `Edit ${activeCatalog.name}` : "Create Product Catalog"}
                  </Heading>
                  <Text size="2" color="gray">
                    Manage Meta-aligned catalog identity, feed links, and ad-object mapping for DCO measurement.
                  </Text>
                </motion.div>
              </AnimatePresence>
              {activeCatalog ? (
                <Badge color={SYNC_STATUS_BADGE_COLOR[activeCatalog.syncStatus]} radius="full" variant="surface">
                  {PRODUCT_CATALOG_SYNC_STATUS_LABELS[activeCatalog.syncStatus]}
                </Badge>
              ) : null}
            </Flex>

            <AnimatePresence initial={false}>
              {error ? (
                <motion.div
                  initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }}
                  transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: MOTION_EASE }}
                >
                  <Callout.Root color="red" variant="surface">
                    <Callout.Icon>
                      <AlertTriangle className="h-4 w-4" />
                    </Callout.Icon>
                    <Callout.Text>{error}</Callout.Text>
                  </Callout.Root>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="catalog-name">Catalog Name</Label>
                  <Input id="catalog-name" placeholder="Spring Prospecting Catalog" {...form.register("name")} />
                  {form.formState.errors.name ? (
                    <Text size="1" color="red">{form.formState.errors.name.message}</Text>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Meta Business</Label>
                  <Popover open={businessOpen} onOpenChange={setBusinessOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={businessOpen}
                        className="h-10 w-full justify-between text-left font-normal"
                        disabled={selectableAssetsQuery.isLoading}
                      >
                        <span className="truncate">
                          {selectedBusinessOption
                            ? `${selectedBusinessOption.name} (${selectedBusinessOption.id})`
                            : watchedBusinessId?.trim()
                              ? watchedBusinessId.trim()
                              : selectableAssetsQuery.isLoading
                                ? "Loading businesses…"
                                : "Select Meta business"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search businesses by name or id..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No businesses found.</CommandEmpty>
                          <CommandGroup heading="Businesses">
                            {metaBusinessOptions.map((business) => (
                              <CommandItem
                                key={business.id}
                                value={`${business.name} ${business.id}`}
                                keywords={[business.id]}
                                onSelect={() => {
                                  form.setValue("businessId", business.id, {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: true,
                                  });
                                  setBusinessOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    watchedBusinessId?.trim() === business.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="truncate">{business.name}</span>
                                <span className="ml-auto truncate text-xs text-muted-foreground">{business.id}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {form.formState.errors.businessId ? (
                    <Text size="1" color="red">{form.formState.errors.businessId.message}</Text>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <Text size="1" color="gray">
                      Select the owning Meta business used for catalog creation.
                    </Text>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        form.setValue("businessId", "", {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Catalog Store (Page ID Connector)</Label>
                  <Popover open={catalogStoreOpen} onOpenChange={setCatalogStoreOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={catalogStoreOpen}
                        className="h-10 w-full justify-between text-left font-normal"
                        disabled={selectableAssetsQuery.isLoading || !watchedBusinessId?.trim()}
                      >
                        <span className="truncate">
                          {selectedCatalogStoreOption
                            ? `${selectedCatalogStoreOption.name} (${selectedCatalogStoreOption.id})`
                            : watchedCatalogStoreId?.trim()
                              ? watchedCatalogStoreId.trim()
                            : !watchedBusinessId?.trim()
                              ? "Select business first"
                            : selectableAssetsQuery.isLoading
                              ? "Loading pages…"
                              : "Select page"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[420px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search pages by name or id..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>No pages found.</CommandEmpty>
                          <CommandGroup heading="Pages">
                            {metaPageOptions.map((page) => (
                              <CommandItem
                                key={page.id}
                                value={`${page.name} ${page.id}`}
                                keywords={[page.id]}
                                onSelect={() => {
                                  form.setValue("catalogStoreId", page.id, {
                                    shouldDirty: true,
                                    shouldTouch: true,
                                    shouldValidate: true,
                                  });
                                  setCatalogStoreOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    watchedCatalogStoreId?.trim() === page.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="truncate">{page.name}</span>
                                <span className="ml-auto truncate text-xs text-muted-foreground">{page.id}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {form.formState.errors.catalogStoreId ? (
                    <Text size="1" color="red">{form.formState.errors.catalogStoreId.message}</Text>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <Text size="1" color="gray">
                      Meta page connector for `store_catalog_settings`.
                    </Text>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        form.setValue("catalogStoreId", "", {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        })
                      }
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>

              {isCreateMode ? (
                <Flex direction="column" gap="1">
                  <Text size="1" color="gray">
                    Creation is intentionally minimal. Meta assigns catalog id and count fields after create.
                  </Text>
                  {!selectedMetaAccountId ? (
                    <Text size="1" color="red">
                      No connected Meta ad account found for this business. Connect one before creating.
                    </Text>
                  ) : null}
                </Flex>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="catalog-external-id">Catalog ID</Label>
                    <Input
                      id="catalog-external-id"
                      value={form.watch("externalCatalogId") ?? ""}
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-meta-product-count">Product Count</Label>
                    <Input
                      id="catalog-meta-product-count"
                      value={String(activeCatalog?.productCount ?? 0)}
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-meta-feed-count">Feed Count</Label>
                    <Input
                      id="catalog-meta-feed-count"
                      value={String(activeCatalog?.feedCount ?? 0)}
                      readOnly
                      disabled
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="catalog-meta-vertical">Vertical</Label>
                    <Input
                      id="catalog-meta-vertical"
                      value={activeCatalog ? PRODUCT_CATALOG_VERTICAL_LABELS[activeCatalog.vertical] : ""}
                      readOnly
                      disabled
                    />
                  </div>
                </div>
              )}

              {!isCreateMode ? (
                <>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="space-y-2 lg:col-span-1">
                      <Label htmlFor="catalog-feed-url">Feed URL</Label>
                      <Input id="catalog-feed-url" placeholder="https://example.com/feed.xml" {...form.register("feedUrl")} />
                      {form.formState.errors.feedUrl ? (
                        <Text size="1" color="red">{form.formState.errors.feedUrl.message}</Text>
                      ) : null}
                    </div>

                    <div className="space-y-2 lg:col-span-1">
                      <Label htmlFor="catalog-default-image">Default Image URL</Label>
                      <Input id="catalog-default-image" placeholder="https://cdn.example.com/default.jpg" {...form.register("defaultImageUrl")} />
                      {form.formState.errors.defaultImageUrl ? (
                        <Text size="1" color="red">{form.formState.errors.defaultImageUrl.message}</Text>
                      ) : null}
                    </div>

                    <div className="space-y-2 lg:col-span-1">
                      <Label htmlFor="catalog-fallback-image">Fallback Image URL</Label>
                      <Input id="catalog-fallback-image" placeholder="https://cdn.example.com/fallback.jpg" {...form.register("fallbackImageUrl")} />
                      {form.formState.errors.fallbackImageUrl ? (
                        <Text size="1" color="red">{form.formState.errors.fallbackImageUrl.message}</Text>
                      ) : null}
                    </div>
                  </div>

                  <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                    <Flex direction="column" gap="3">
                      <Flex align="center" gap="2">
                        <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <Text size="2" weight="medium">Ad Object Mapping</Text>
                      </Flex>

                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <div className="space-y-2 lg:col-span-1">
                          <Label htmlFor="catalog-linked-level">Link Level</Label>
                          <Select
                            value={watchedLinkedAdObjectLevel}
                            onValueChange={(value) => {
                              form.setValue(
                                "linkedAdObjectLevel",
                                value as ProductCatalogFormValues["linkedAdObjectLevel"],
                                { shouldDirty: true, shouldTouch: true, shouldValidate: true }
                              );
                              setLinkedAdObjectIds([]);
                              setCustomLinkedAdObjectId("");
                            }}
                          >
                            <SelectTrigger id="catalog-linked-level" className="w-full">
                              <SelectValue placeholder="Select link level" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="campaign">Campaign</SelectItem>
                              <SelectItem value="adset">Ad Set</SelectItem>
                              <SelectItem value="ad">Ad</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2 lg:col-span-2">
                          <Label>Linked Ad Object IDs</Label>
                          <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border border-[var(--glass-border)] bg-background/30 p-3">
                            {knownAdObjectOptionsForSelectedLevel.length === 0 ? (
                              <Text size="1" color="gray">
                                No existing {watchedLinkedAdObjectLevel} IDs found. Add a custom ID below.
                              </Text>
                            ) : (
                              knownAdObjectOptionsForSelectedLevel.map((option) => (
                                <div key={`${option.level}:${option.id}`} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`catalog-linked-id-${option.level}-${option.id}`}
                                    checked={selectedLinkedAdObjectIds.includes(option.id)}
                                    onCheckedChange={(checked) =>
                                      handleLinkedAdObjectSelection(option.id, checked === true)
                                    }
                                  />
                                  <Label
                                    htmlFor={`catalog-linked-id-${option.level}-${option.id}`}
                                    className="cursor-pointer text-sm font-normal"
                                  >
                                    {option.id}
                                    {option.name ? ` · ${option.name}` : ""}
                                  </Label>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              id="catalog-linked-ids-custom"
                              placeholder={`Add custom ${watchedLinkedAdObjectLevel} id`}
                              value={customLinkedAdObjectId}
                              onChange={(event) => setCustomLinkedAdObjectId(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  handleAddCustomLinkedAdObjectId();
                                }
                              }}
                            />
                            <Button type="button" variant="outline" size="sm" onClick={handleAddCustomLinkedAdObjectId}>
                              Add
                            </Button>
                          </div>
                          <Text size="1" color="gray">
                            Select from discovered IDs or add custom IDs used by DCO mapping.
                          </Text>
                        </div>
                      </div>
                    </Flex>
                  </Card>

                  <div className="space-y-2">
                    <Label htmlFor="catalog-last-sync">Last Synced</Label>
                    <Input id="catalog-last-sync" type="datetime-local" {...form.register("lastSyncedAtLocal")} />
                  </div>
                </>)
              : null}

              {!isCreateMode ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="flex items-start gap-3 rounded-md border border-[var(--glass-border)] bg-background/20 p-3">
                    <Checkbox
                      id="catalog-data-feed-enabled"
                      checked={form.watch("dataFeedEnabled")}
                      onCheckedChange={(checked) => form.setValue("dataFeedEnabled", checked === true, { shouldDirty: true })}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="catalog-data-feed-enabled">Data Feed Enabled</Label>
                      <Text size="1" color="gray">Enable feed ingestion for this catalog.</Text>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 rounded-md border border-[var(--glass-border)] bg-background/20 p-3">
                    <Checkbox
                      id="catalog-tagging-enabled"
                      checked={form.watch("productTaggingEnabled")}
                      onCheckedChange={(checked) => form.setValue("productTaggingEnabled", checked === true, { shouldDirty: true })}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="catalog-tagging-enabled">Product Tagging Enabled</Label>
                      <Text size="1" color="gray">Use catalog products for ad-level tagging and metrics.</Text>
                    </div>
                  </div>
                </div>
              ) : null}

              {!isCreateMode ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="catalog-sync-status">Sync Status</Label>
                    <Select
                      value={form.watch("syncStatus")}
                      onValueChange={(value) =>
                        form.setValue("syncStatus", value as ProductCatalogFormValues["syncStatus"], { shouldDirty: true })
                      }
                    >
                      <SelectTrigger id="catalog-sync-status" className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRODUCT_CATALOG_SYNC_STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 lg:col-span-1">
                    <Label htmlFor="catalog-notes">Notes</Label>
                    <Textarea
                      id="catalog-notes"
                      rows={4}
                      placeholder="Validation nuances, feed caveats, product set notes..."
                      {...form.register("notes")}
                    />
                  </div>
                </div>
              ) : null}

              <Flex align="center" justify="between" wrap="wrap" gap="3">
                <Text size="1" color="gray">
                  {activeCatalog
                    ? `Last updated ${new Date(activeCatalog.updatedAt).toLocaleString()}`
                    : "Create a catalog, then map feed and tagging settings."}
                </Text>

                <Flex align="center" gap="2">
                  {activeCatalog ? (
                    <Button
                      type="button"
                      variant={deleteArmed ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => void handleDelete()}
                      disabled={isDeleting || isSaving}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {isDeleting ? "Deleting..." : deleteArmed ? "Confirm Delete" : "Delete"}
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isSaving || isDeleting || (isCreateMode && !selectedMetaAccountId)}
                  >
                    {isSaving ? "Saving..." : activeCatalog ? "Update Catalog" : "Create Catalog"}
                  </Button>
                </Flex>
              </Flex>
              {form.formState.isDirty ? (
                <Text size="1" color="amber">
                  Unsaved changes
                </Text>
              ) : null}
            </form>

            <Separator size="4" />

            <Flex direction="column" gap="3">
              <Flex align="center" justify="between" wrap="wrap" gap="2">
                <Heading size="3" className="text-white">
                  Product Activity Mapping
                </Heading>
                <Flex align="center" gap="2">
                  <Badge color="gray" radius="full" variant="surface">
                    {catalogLinkSummary.total} tracked
                  </Badge>
                  <Badge color="green" radius="full" variant="surface">
                    {catalogLinkSummary.active} active
                  </Badge>
                  {catalogLinkSummary.inactive > 0 ? (
                    <Badge color="amber" radius="full" variant="surface">
                      {catalogLinkSummary.inactive} inactive
                    </Badge>
                  ) : null}
                </Flex>
              </Flex>

              <Text size="1" color="gray">
                Track which products are active in campaign, ad set, or ad objects for DCO attribution and feed diagnostics.
              </Text>

              <AnimatePresence initial={false}>
                {catalogLinksError ? (
                  <motion.div
                    initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }}
                    transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: MOTION_EASE }}
                  >
                    <Callout.Root color="red" variant="surface">
                      <Callout.Icon>
                        <AlertTriangle className="h-4 w-4" />
                      </Callout.Icon>
                      <Callout.Text>{catalogLinksError}</Callout.Text>
                    </Callout.Root>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              {!activeCatalog ? (
                <Card variant="surface" className="border border-dashed border-[var(--glass-border)] p-4 text-center">
                  <Text size="2" color="gray">
                    Save or select a catalog to manage product-to-ad activity mappings.
                  </Text>
                </Card>
              ) : (
                <>
                  <Card variant="surface" className="border border-[var(--glass-border)] p-3">
                    <Flex direction="column" gap="3">
                      <Flex align="center" justify="between" wrap="wrap" gap="2">
                        <Text size="2" weight="medium">Catalog Products</Text>
                        <Badge color="gray" radius="full" variant="surface">
                          {catalogProducts.length} products
                        </Badge>
                      </Flex>

                      {isCatalogLinksLoading ? (
                        <Text size="1" color="gray">Loading products…</Text>
                      ) : catalogProducts.length === 0 ? (
                        <Text size="1" color="gray">No products yet. Add one using the activity form below.</Text>
                      ) : (
                        <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--glass-border)]">
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
                                    <div className="text-sm font-medium text-white">{product.externalProductId}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {product.title?.trim() || "Untitled product"} · Last seen{" "}
                                      {product.lastSeenAt ? new Date(product.lastSeenAt).toLocaleString() : "--"}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-sm">{product.availability}</TableCell>
                                  <TableCell className="text-sm">
                                    {product.activeLinks}/{product.totalLinks} active
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <Input
                                        value={productRenameDrafts[product.externalProductId] ?? ""}
                                        onChange={(event) =>
                                          setProductRenameDrafts((current) => ({
                                            ...current,
                                            [product.externalProductId]: event.target.value,
                                          }))
                                        }
                                        placeholder="Rename product"
                                        className="w-44"
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={isCatalogProductSaving}
                                        onClick={() => void handleRenameCatalogProduct(product.externalProductId)}
                                      >
                                        {isCatalogProductSaving && activeCatalogProductId === product.externalProductId ? "Saving..." : "Rename"}
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        disabled={isCatalogProductSaving}
                                        onClick={() => void handleRemoveCatalogProduct(product.externalProductId)}
                                      >
                                        {isCatalogProductSaving && activeCatalogProductId === product.externalProductId ? "Removing..." : "Remove"}
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </Flex>
                  </Card>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="activity-product-id-select">Product ID</Label>
                      <Select value={activityProductSelectValue} onValueChange={handleActivityProductSelection}>
                        <SelectTrigger id="activity-product-id-select" className="w-full">
                          <SelectValue placeholder="Choose product ID" />
                        </SelectTrigger>
                        <SelectContent>
                          {knownActivityProducts.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.id}{product.title ? ` · ${product.title}` : ""}
                            </SelectItem>
                          ))}
                          <SelectItem value={PRODUCT_SELECT_CUSTOM}>Custom Product ID…</SelectItem>
                        </SelectContent>
                      </Select>
                      {activityProductSelectValue === PRODUCT_SELECT_CUSTOM ? (
                        <Input
                          id="activity-product-id"
                          placeholder="sku_12345"
                          value={linkDraft.product.externalProductId}
                          onChange={(event) => {
                            setCustomActivityProductId(event.target.value);
                            setLinkDraft((current) => ({
                              ...current,
                              product: { ...current.product, externalProductId: event.target.value },
                            }));
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activity-product-title">Product Title</Label>
                      <Input
                        id="activity-product-title"
                        placeholder="Weekend Hoodie"
                        value={linkDraft.product.title ?? ""}
                        onChange={(event) =>
                          setLinkDraft((current) => ({
                            ...current,
                            product: { ...current.product, title: event.target.value },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="activity-availability">Availability</Label>
                      <Select
                        value={linkDraft.product.availability}
                        onValueChange={(value) =>
                          setLinkDraft((current) => ({
                            ...current,
                            product: {
                              ...current.product,
                              availability: value as LinkDraftInput["product"]["availability"],
                            },
                          }))
                        }
                      >
                        <SelectTrigger id="activity-availability" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unknown">Unknown</SelectItem>
                          <SelectItem value="in_stock">In Stock</SelectItem>
                          <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                          <SelectItem value="preorder">Preorder</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activity-object-type">Ad Object Type</Label>
                      <Select
                        value={linkDraft.adObject.objectType}
                        onValueChange={(value) =>
                          setLinkDraft((current) => ({
                            ...current,
                            adObject: {
                              ...current.adObject,
                              objectType: value as LinkDraftInput["adObject"]["objectType"],
                              externalObjectId: "",
                            },
                          }))
                        }
                      >
                        <SelectTrigger id="activity-object-type" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="campaign">Campaign</SelectItem>
                          <SelectItem value="adset">Ad Set</SelectItem>
                          <SelectItem value="ad">Ad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activity-object-id-select">Ad Object ID</Label>
                      <Select value={activityAdObjectSelectValue} onValueChange={handleActivityAdObjectSelection}>
                        <SelectTrigger id="activity-object-id-select" className="w-full">
                          <SelectValue placeholder="Choose ad object ID" />
                        </SelectTrigger>
                        <SelectContent>
                          {knownActivityAdObjectOptions.map((option) => (
                            <SelectItem key={`${option.level}:${option.id}`} value={option.id}>
                              {option.id}{option.name ? ` · ${option.name}` : ""}
                            </SelectItem>
                          ))}
                          <SelectItem value={AD_OBJECT_SELECT_CUSTOM}>Custom Ad Object ID…</SelectItem>
                        </SelectContent>
                      </Select>
                      {activityAdObjectSelectValue === AD_OBJECT_SELECT_CUSTOM ? (
                        <Input
                          id="activity-object-id"
                          placeholder="adset_9876"
                          value={linkDraft.adObject.externalObjectId}
                          onChange={(event) => {
                            setCustomActivityAdObjectId(event.target.value);
                            setLinkDraft((current) => ({
                              ...current,
                              adObject: { ...current.adObject, externalObjectId: event.target.value },
                            }));
                          }}
                        />
                      ) : null}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="activity-object-name">Ad Object Name</Label>
                      <Input
                        id="activity-object-name"
                        placeholder="Prospecting - Broad 18-34"
                        value={linkDraft.adObject.name ?? ""}
                        onChange={(event) =>
                          setLinkDraft((current) => ({
                            ...current,
                            adObject: { ...current.adObject, name: event.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activity-object-status">Delivery Status</Label>
                      <Select
                        value={(linkDraft.adObject.status ?? "").trim() || "ACTIVE"}
                        onValueChange={(value) =>
                          setLinkDraft((current) => ({
                            ...current,
                            adObject: { ...current.adObject, status: value },
                          }))
                        }
                      >
                        <SelectTrigger id="activity-object-status" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {knownActivityStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="activity-source">Source</Label>
                      <Select
                        value={(linkDraft.activity.source ?? "").trim() || "manual"}
                        onValueChange={(value) =>
                          setLinkDraft((current) => ({
                            ...current,
                            activity: { ...current.activity, source: value },
                          }))
                        }
                      >
                        <SelectTrigger id="activity-source" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {knownActivitySources.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Flex align="center" justify="between" wrap="wrap" gap="3">
                    <div className="flex items-center gap-3 rounded-md border border-[var(--glass-border)] bg-background/20 p-3">
                      <Checkbox
                        id="activity-is-active"
                        checked={linkDraft.activity.isActive}
                        onCheckedChange={(checked) =>
                          setLinkDraft((current) => ({
                            ...current,
                            activity: { ...current.activity, isActive: checked === true },
                          }))
                        }
                      />
                      <Label htmlFor="activity-is-active">Mark as active in delivery</Label>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={isCatalogLinkSaving || isCatalogLinksLoading}
                      onClick={() => void handleCreateCatalogLink()}
                    >
                      {isCatalogLinkSaving && !activeCatalogLinkId ? "Saving Link..." : "Save Product Activity"}
                    </Button>
                  </Flex>

                  {isCatalogLinksLoading ? (
                    <Card variant="surface" className="border border-[var(--glass-border)] p-4 text-center">
                      <Text size="2" color="gray">Loading product activity…</Text>
                    </Card>
                  ) : catalogLinks.length === 0 ? (
                    <Card variant="surface" className="border border-dashed border-[var(--glass-border)] p-4 text-center">
                      <Text size="2" color="gray">
                        No product activity links recorded for this catalog yet.
                      </Text>
                    </Card>
                  ) : (
                    <div className="max-h-[24rem] overflow-y-auto rounded-md border border-[var(--glass-border)]">
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
                                <div className="text-sm font-medium text-white">{link.product.externalProductId}</div>
                                <div className="text-xs text-muted-foreground">
                                  {link.product.title ?? "Untitled product"} · {link.product.availability}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-white">
                                  {link.adObject.objectType.toUpperCase()} · {link.adObject.externalObjectId}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {link.adObject.name ?? "Unnamed object"}{link.adObject.status ? ` (${link.adObject.status})` : ""}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  color={link.activity.isActive ? "green" : "gray"}
                                  radius="full"
                                  variant="surface"
                                >
                                  {link.activity.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {new Date(link.activity.lastSeenAt).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={isCatalogLinkSaving}
                                  onClick={() => void handleToggleCatalogLink(link, !link.activity.isActive)}
                                >
                                  {isCatalogLinkSaving && activeCatalogLinkId === link.activity.id
                                    ? "Updating..."
                                    : link.activity.isActive
                                      ? "Set Inactive"
                                      : "Set Active"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </Flex>
          </Flex>
        </Card>
      </motion.div>
    </motion.div>
  );
}
