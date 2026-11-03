import { BankFile } from "@icg/shared";
import type { BankEntry } from "@icg/shared";
import type { AvatarPicker } from "../engine";
import { pick } from "../rng";
import en from "./bank.en.json";
import es from "./bank.es.json";

export const FIXTURE_BANK: BankEntry[] = [
  ...BankFile.parse(en).entries,
  ...BankFile.parse(es).entries,
];

export const FIXTURE_AVATAR_IDS = ["a-01", "a-02", "a-03", "a-04", "a-05", "a-06"] as const;

export const fixtureAvatarPicker: AvatarPicker = (rng) => ({
  kind: "pool",
  id: pick(rng, FIXTURE_AVATAR_IDS),
});
