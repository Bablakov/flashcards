import { z } from "zod";

export const MemoryLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);
export type MemoryLevel = z.infer<typeof MemoryLevelSchema>;

export const CardSideSchema = z.object({
  text: z.string().default(""),
  image: z.string().nullable().default(null),
  audio: z.string().nullable().default(null),
});
export type CardSide = z.infer<typeof CardSideSchema>;

export const CardSchema = z.object({
  id: z.string(),
  front: CardSideSchema,
  back: CardSideSchema,
  level: MemoryLevelSchema.default(0),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Card = z.infer<typeof CardSchema>;

export const DeckSettingsSchema = z.object({
  frontLanguage: z.string().default("ru"),
  backLanguage: z.string().default("ru"),
  frontSpeechSpeed: z.number().min(0.5).max(2).default(1),
  backSpeechSpeed: z.number().min(0.5).max(2).default(1),
  flipDelay: z.number().min(0).default(0),
  nextDelay: z.number().min(0).default(0),
});
export type DeckSettings = z.infer<typeof DeckSettingsSchema>;

export const DeckSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().default("#e36b6b"),
  settings: DeckSettingsSchema.default({} as DeckSettings),
  cardCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Deck = z.infer<typeof DeckSchema>;

export interface DeckSummary extends Deck {
  progress: number;
}

export const GitConfigSchema = z.object({
  remoteUrl: z.string().default(""),
  branch: z.string().default("main"),
  username: z.string().default(""),
  email: z.string().default(""),
  token: z.string().default(""),
  autoSync: z.boolean().default(false),
});
export type GitConfig = z.infer<typeof GitConfigSchema>;

export const SyncStatusSchema = z.object({
  lastSyncAt: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  pendingChanges: z.number().int().default(0),
});
export type SyncStatus = z.infer<typeof SyncStatusSchema>;
