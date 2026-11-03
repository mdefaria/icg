import {
  Author,
  Context,
  FRAME_PRESETS,
  Language,
  Placement,
  Platform,
  Theme,
  Tone,
  Variant,
} from "@icg/shared";
import type { Unsubscribe } from "@icg/host-sdk";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

export interface SettingsStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  subscribe(listener: (key: string) => void): Unsubscribe;
}

export function createMemorySettings(initial: Record<string, unknown> = {}): SettingsStore {
  const values = new Map(Object.entries(initial));
  const listeners = new Set<(key: string) => void>();
  return {
    get: (key) => values.get(key),
    set(key, value) {
      values.set(key, value);
      for (const listener of listeners) listener(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createLocalStorageSettings(storage: Storage, prefix = "icg."): SettingsStore {
  const listeners = new Set<(key: string) => void>();
  return {
    get(key) {
      const raw = storage.getItem(prefix + key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return undefined;
      }
    },
    set(key, value) {
      try {
        storage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        return;
      }
      for (const listener of listeners) listener(key);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const FramePresetKey = z.enum(Object.keys(FRAME_PRESETS) as [keyof typeof FRAME_PRESETS]);

export const GenerateSettings = z.object({
  platform: Platform,
  theme: Theme,
  variant: Variant,
  language: Language,
  tones: z.array(Tone),
  context: Context.nullable(),
  count: z.number().int().min(1).max(10),
});
export type GenerateSettings = z.infer<typeof GenerateSettings>;

export const InsertSettings = z.object({
  durationSeconds: z.number().positive().max(600),
  staggerSeconds: z.number().min(0).max(60),
});
export type InsertSettings = z.infer<typeof InsertSettings>;

export const SETTINGS = {
  generate: {
    schema: GenerateSettings,
    fallback: {
      platform: "tiktok",
      theme: "dark",
      variant: "single",
      language: "en",
      tones: [],
      context: null,
      count: 3,
    } satisfies GenerateSettings as GenerateSettings,
  },
  creator: {
    schema: Author,
    fallback: {
      username: "yourchannel",
      displayName: "Your Channel",
      avatar: { kind: "default" },
      verified: true,
    } satisfies Author as Author,
  },
  placements: {
    schema: z.partialRecord(Platform, Placement),
    fallback: {} as Partial<Record<Platform, Placement>>,
  },
  snap: { schema: z.boolean(), fallback: true as boolean },
  safeZones: { schema: z.boolean(), fallback: true as boolean },
  frame: { schema: FramePresetKey, fallback: "9:16" as keyof typeof FRAME_PRESETS },
  insert: {
    schema: InsertSettings,
    fallback: {
      durationSeconds: 3,
      staggerSeconds: 0.5,
    } satisfies InsertSettings as InsertSettings,
  },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof SETTINGS)[K]["fallback"];

export function readSetting<K extends SettingKey>(store: SettingsStore, key: K): SettingValue<K> {
  const parsed = SETTINGS[key].schema.safeParse(store.get(key));
  return (parsed.success ? parsed.data : SETTINGS[key].fallback) as SettingValue<K>;
}

export function useSetting<K extends SettingKey>(
  store: SettingsStore,
  key: K,
): [SettingValue<K>, (value: SettingValue<K>) => void] {
  const [value, setValue] = useState(() => readSetting(store, key));
  useEffect(() => {
    setValue(readSetting(store, key));
    return store.subscribe((changed) => {
      if (changed === key) setValue(readSetting(store, key));
    });
  }, [store, key]);
  const update = useCallback((next: SettingValue<K>) => store.set(key, next), [store, key]);
  return [value, update];
}
