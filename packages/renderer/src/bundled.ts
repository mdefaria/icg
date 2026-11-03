import type { BundledFamily, FontWeight } from "./fonts";

export const BUNDLED_FONTS: ReadonlyArray<{
  family: BundledFamily;
  weight: FontWeight;
  file: string;
}> = [
  { family: "Inter", weight: 400, file: "Inter-Regular.ttf" },
  { family: "Inter", weight: 500, file: "Inter-Medium.ttf" },
  { family: "Inter", weight: 600, file: "Inter-SemiBold.ttf" },
  { family: "Inter", weight: 700, file: "Inter-Bold.ttf" },
  { family: "Roboto", weight: 400, file: "Roboto-Regular.ttf" },
  { family: "Roboto", weight: 500, file: "Roboto-Medium.ttf" },
  { family: "Roboto", weight: 700, file: "Roboto-Bold.ttf" },
];
