import { z } from 'zod';
import { ALLOCATION_KEYS, METER_TYPES } from './constants';
import { dateSchema, idSchema, moneySchema, revisionSchema, yearSchema } from './schemas';

export const AI_PROVIDERS = ['openai', 'mistral', 'ollama'] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);

export const AI_PROVIDER_DEFAULTS = {
  openai: { model: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1' },
  mistral: { model: 'mistral-small-latest', baseUrl: 'https://api.mistral.ai/v1' },
  ollama: { model: 'qwen2.5vl:7b', baseUrl: 'http://localhost:11434' },
} as const;

export const aiSettingsUpdateSchema = z
  .object({
    enabled: z.boolean(),
    provider: aiProviderSchema,
    model: z.string().trim().min(1).max(200),
    baseUrl: z.string().trim().url().max(500),
    apiKey: z.string().trim().min(1).max(1000).optional(),
    clearApiKey: z.boolean().default(false),
    revision: revisionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.provider !== 'ollama' && !value.baseUrl.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: 'Cloud-Anbieter müssen über HTTPS angesprochen werden.',
      });
    }
  });

export const aiConnectionTestSchema = z
  .object({
    provider: aiProviderSchema,
    model: z.string().trim().min(1).max(200),
    baseUrl: z.string().trim().url().max(500),
  })
  .strict();

const aiScanCostObjectSchema = z.object({
  description: z.string().trim().min(1).max(300),
  amount: moneySchema,
  statementGroup: z.enum(['Wohnung', 'Garage', 'Grundsteuer']),
  allocationKey: z.enum(ALLOCATION_KEYS).refine((value) => value !== 'direct'),
  meterType: z.enum(METER_TYPES).nullable(),
  labor35a: moneySchema,
  confidence: z.number().finite().min(0).max(1),
  source: z.string().trim().max(300),
});

export const aiScanCostSchema = aiScanCostObjectSchema.strict().superRefine((value, context) => {
  if (value.labor35a > value.amount) {
    context.addIssue({
      code: 'custom',
      path: ['labor35a'],
      message: 'Der §35a-Anteil darf den Betrag nicht überschreiten.',
    });
  }
  if (value.allocationKey === 'meter' && value.meterType === null) {
    context.addIssue({
      code: 'custom',
      path: ['meterType'],
      message: 'Für eine Verbrauchsverteilung ist eine Zählerart erforderlich.',
    });
  }
});

export const aiScanReadingSchema = z
  .object({
    meterNumber: z.string().trim().max(100).nullable(),
    meterName: z.string().trim().max(200).nullable(),
    date: dateSchema.nullable(),
    value: z.number().finite().nonnegative().nullable(),
    unit: z.string().trim().max(30).nullable(),
    confidence: z.number().finite().min(0).max(1),
    source: z.string().trim().max(300),
  })
  .strict();

export const aiScanResultSchema = z
  .object({
    documentType: z.enum(['owner_statement', 'invoice', 'meter_statement', 'unknown']),
    detectedYear: yearSchema.nullable(),
    costs: z.array(aiScanCostSchema).max(500),
    readings: z.array(aiScanReadingSchema).max(500),
    warnings: z.array(z.string().trim().max(500)).max(100),
  })
  .strict();

export const aiScanRequestSchema = z
  .object({
    propertyId: idSchema,
    year: yearSchema,
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.literal('application/pdf'),
    dataBase64: z
      .string()
      .min(4)
      .max(28_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'PDF-Daten sind nicht gültig Base64-kodiert.')
      .refine((value) => value.length % 4 === 0, 'PDF-Daten sind unvollständig.'),
  })
  .strict();

const aiImportCostSchema = aiScanCostObjectSchema
  .pick({
    description: true,
    amount: true,
    statementGroup: true,
    allocationKey: true,
    meterType: true,
    labor35a: true,
    source: true,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.labor35a > value.amount) {
      context.addIssue({
        code: 'custom',
        path: ['labor35a'],
        message: 'Der §35a-Anteil darf den Betrag nicht überschreiten.',
      });
    }
    if (value.allocationKey === 'meter' && value.meterType === null) {
      context.addIssue({
        code: 'custom',
        path: ['meterType'],
        message: 'Für eine Verbrauchsverteilung ist eine Zählerart erforderlich.',
      });
    }
  });

const aiImportReadingSchema = z
  .object({
    meterId: idSchema,
    date: dateSchema,
    value: z.number().finite().nonnegative(),
    source: z.string().trim().max(300),
  })
  .strict();

export const aiImportRequestSchema = z
  .object({
    propertyId: idSchema,
    year: yearSchema,
    fileName: z.string().trim().min(1).max(255),
    costs: z.array(aiImportCostSchema).max(500),
    readings: z.array(aiImportReadingSchema).max(500),
  })
  .strict()
  .refine((value) => value.costs.length + value.readings.length > 0, {
    message: 'Wähle mindestens einen Kostenposten oder Zählerstand aus.',
  });

export type AiProvider = z.infer<typeof aiProviderSchema>;
export type AiSettingsUpdate = z.infer<typeof aiSettingsUpdateSchema>;
export type AiConnectionTest = z.infer<typeof aiConnectionTestSchema>;
export type AiScanCost = z.infer<typeof aiScanCostSchema>;
export type AiScanReading = z.infer<typeof aiScanReadingSchema>;
export type AiScanResult = z.infer<typeof aiScanResultSchema>;
export type AiScanRequest = z.infer<typeof aiScanRequestSchema>;
export type AiImportRequest = z.infer<typeof aiImportRequestSchema>;

export type AiSettings = Omit<AiSettingsUpdate, 'apiKey' | 'clearApiKey'> & {
  apiKeyConfigured: boolean;
  updatedAt: string;
};

export type AiScanResponse = AiScanResult & {
  provider: AiProvider;
  model: string;
  fileName: string;
};
