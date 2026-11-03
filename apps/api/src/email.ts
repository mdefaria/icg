import type { Env } from "./env";

const RESEND_API = "https://api.resend.com/emails";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function keysEmail(keys: string[], siteUrl: string, resend = false): EmailContent {
  const plural = keys.length === 1 ? "Key" : "Keys";
  const subject = resend ? `Your ICG ${plural}` : `Your ICG ${plural} - thanks for buying`;
  const intro = resend
    ? `Here ${keys.length === 1 ? "is the Key" : "are the Keys"} registered to this email address.`
    : `Thanks for buying ICG. ${keys.length === 1 ? "Your Key is" : `Your ${keys.length} Keys are`} below; each Key activates up to 3 Devices.`;
  const text = [
    intro,
    "",
    ...keys.map((key) => `  ${key}`),
    "",
    `Download: ${siteUrl}/download`,
    `Manage Devices: ${siteUrl}/devices`,
    "",
    "Keep this email: there is no account, the Key is your proof of purchase.",
    "Questions: reply to this email.",
  ].join("\n");
  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<ul style="font-family:monospace;font-size:16px;list-style:none;padding:0">`,
    ...keys.map((key) => `<li>${escapeHtml(key)}</li>`),
    `</ul>`,
    `<p><a href="${escapeHtml(siteUrl)}/download">Download</a> &middot; <a href="${escapeHtml(siteUrl)}/devices">Manage Devices</a></p>`,
    `<p>Keep this email: there is no account, the Key is your proof of purchase.<br>Questions: reply to this email.</p>`,
  ].join("\n");
  return { subject, text, html };
}

export async function sendEmail(env: Env, to: string, content: EmailContent): Promise<void> {
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], ...content }),
  });
  if (!response.ok) {
    throw new Error(`resend failed: ${response.status} ${await response.text()}`);
  }
}
