import { z } from 'zod';
import { idSchema, revisionSchema, yearSchema } from './schemas';

export const papraIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const papraBaseUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, 'Papra benötigt eine HTTP(S)-Adresse ohne Zugangsdaten, Query oder Fragment.')
  .transform((value) => {
    const url = new URL(value);
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  });
export const papraSettingsSchema = z
  .object({
    baseUrl: z.union([z.literal(''), papraBaseUrlSchema]),
    publicUrl: z.union([z.literal(''), papraBaseUrlSchema]).default(''),
    apiKey: z
      .string()
      .trim()
      .min(1)
      .max(1000)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    clearApiKey: z.boolean().default(false),
    revision: revisionSchema,
  })
  .strict();
export const papraMappingSchema = z
  .object({
    organizationId: papraIdSchema.nullable(),
    revision: revisionSchema,
  })
  .strict();
export const papraSelectionSchema = z
  .object({
    documentId: papraIdSchema,
    organizationId: papraIdSchema,
    settingsRevision: revisionSchema,
    mappingRevision: revisionSchema,
  })
  .strict();
export const papraSourceSchema = papraSelectionSchema
  .extend({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const papraScanSchema = z
  .object({
    propertyId: idSchema,
    year: yearSchema,
    selection: papraSelectionSchema,
  })
  .strict();
export const papraLinkInputSchema = z
  .object({
    propertyId: idSchema,
    costId: idSchema.nullable(),
    selection: papraSelectionSchema,
  })
  .strict();
export const papraDocumentSchema = z.object({
  id: papraIdSchema,
  organizationId: papraIdSchema,
  name: z.string().min(1).max(1000),
  mimeType: z.string().min(1).max(255),
  originalName: z.string().min(1).max(1000),
  originalSize: z.number().int().nonnegative().safe(),
  originalSha256Hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PapraDocument = z.infer<typeof papraDocumentSchema>;
export type PapraSelection = z.infer<typeof papraSelectionSchema>;
export type PapraSource = z.infer<typeof papraSourceSchema>;
export type PapraOrganization = { id: string; name: string };
export type PapraSettings = {
  baseUrl: string;
  publicUrl: string;
  apiKeyConfigured: boolean;
  connected: boolean;
  revision: number;
};
export type PapraMapping = { organizationId: string | null; revision: number; baseUrl: string };
export type PapraDocumentPage = {
  documents: PapraDocument[];
  documentsCount: number;
  organizationId: string;
  settingsRevision: number;
  mappingRevision: number;
};
export type DocumentLink = {
  id: number;
  propertyId: number;
  costId: number | null;
  name: string;
  mimeType: string;
  originalSize: number;
  available: boolean;
  papraUrl: string;
};
