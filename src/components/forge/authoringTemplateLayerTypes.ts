import type {
  TemplateAuthoringSourceLayerEdit,
  TemplateEditableLayer,
} from '@continuum/contracts';

/** UI view of a beta layer with source-native Position retained for private authoring commands. */
export type AuthoringEditableLayer = Omit<TemplateEditableLayer, 'transformLocks'> & {
  position: [number, number] | null;
  transformLocks: NonNullable<TemplateEditableLayer['transformLocks']>;
};

/** Private AEP edits keep Position pairs; beta immutable revisions continue to use x/y. */
export type AuthoringLayerEdit = TemplateAuthoringSourceLayerEdit;
