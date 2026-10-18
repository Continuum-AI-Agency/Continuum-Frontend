import type { TemplateEditableLayer, TemplateLayerEdit } from '@continuum/contracts';

/** UI view of a beta layer with source-native Position retained for private authoring commands. */
export type AuthoringEditableLayer = Omit<TemplateEditableLayer, 'transformLocks'> & {
  position: [number, number] | null;
  transformLocks: NonNullable<TemplateEditableLayer['transformLocks']>;
};

/** Native layer edits share the canonical x/y shape used by immutable revisions. */
export type AuthoringLayerEdit = TemplateLayerEdit;
