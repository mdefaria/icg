import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

async function testKeypair() {
  const pair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return {
    SIGNING_PRIVATE_KEY_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)),
    SIGNING_PUBLIC_KEY_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", pair.publicKey)),
  };
}

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    test: {
      include: ["src/**/*.test.ts"],
      setupFiles: ["./src/test/setup.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              STRIPE_SECRET_KEY: "sk_test_fake",
              STRIPE_WEBHOOK_SECRET: "whsec_fake",
              RESEND_API_KEY: "re_fake",
              STRIPE_PRICE_ID: "price_fake",
              SITE_URL: "https://icg.test",
              EMAIL_FROM: "ICG <keys@icg.test>",
              ...(await testKeypair()),
            },
          },
        },
      },
    },
  };
});
