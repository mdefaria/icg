export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  SITE_URL: string;
  EMAIL_FROM: string;
  STRIPE_PRICE_ID: string;
  SIGNING_PUBLIC_KEY_JWK: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string;
  SIGNING_PRIVATE_KEY_JWK: string;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
