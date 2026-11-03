import type {
  Author,
  Avatar,
  BankEntry,
  Comment,
  Context,
  Language,
  Platform,
  Tone,
  Variant,
} from "@icg/shared";

export type GenerateOptions = {
  platform: Platform;
  language: Language;
  variant: Variant;
  tones?: Tone[];
  contexts?: Context[];
  creator?: Author;
  seed?: string;
};

export type RegenerableField = "text" | "author" | "avatar" | "likes" | "timeAgo" | "reply";

export type AvatarPicker = (rng: Rng, platform: Platform) => Avatar;

export type Rng = () => number;

export type EngineDeps = {
  bank: BankEntry[];
  pickAvatar: AvatarPicker;
};

export interface Engine {
  generate(options: GenerateOptions): Comment;
  generateMany(options: GenerateOptions, count: number): Comment[];
  regenerate(comment: Comment, field: RegenerableField, options: GenerateOptions): Comment;
  manual(options: GenerateOptions): Comment;
}
