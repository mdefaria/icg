import { Device } from "@icg/shared";

export interface KeyRow {
  id: string;
  email: string;
  purchase_id: string;
  issued_at: number;
  devices: number;
  signature: string;
  revoked_at: number | null;
}

export interface PurchaseRow {
  id: string;
  email: string;
  quantity: number;
  amount_total: number | null;
  currency: string | null;
  created_at: number;
  emailed_at: number | null;
}

interface DeviceRow {
  id: string;
  name: string;
  host: string;
  activated_at: number;
}

export interface IssuedKey {
  id: string;
  issuedAt: number;
  devices: number;
  signature: string;
}

export async function hasStripeEvent(db: D1Database, id: string): Promise<boolean> {
  const row = await db.prepare("SELECT id FROM stripe_events WHERE id = ?").bind(id).first();
  return row !== null;
}

export function getPurchase(db: D1Database, id: string): Promise<PurchaseRow | null> {
  return db.prepare("SELECT * FROM purchases WHERE id = ?").bind(id).first<PurchaseRow>();
}

export async function issueKeys(
  db: D1Database,
  purchase: Omit<PurchaseRow, "emailed_at">,
  keys: IssuedKey[],
  event: { id: string; type: string; receivedAt: number },
): Promise<void> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO purchases (id, email, quantity, amount_total, currency, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        purchase.id,
        purchase.email,
        purchase.quantity,
        purchase.amount_total,
        purchase.currency,
        purchase.created_at,
      ),
    ...keys.map((key) =>
      db
        .prepare(
          "INSERT INTO keys (id, email, purchase_id, issued_at, devices, signature) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(key.id, purchase.email, purchase.id, key.issuedAt, key.devices, key.signature),
    ),
    db
      .prepare("INSERT INTO stripe_events (id, type, purchase_id, received_at) VALUES (?, ?, ?, ?)")
      .bind(event.id, event.type, purchase.id, event.receivedAt),
  ]);
}

export async function markPurchaseEmailed(
  db: D1Database,
  purchaseId: string,
  at: number,
): Promise<void> {
  await db.prepare("UPDATE purchases SET emailed_at = ? WHERE id = ?").bind(at, purchaseId).run();
}

export function findActiveKey(db: D1Database, id: string): Promise<KeyRow | null> {
  return db
    .prepare("SELECT * FROM keys WHERE id = ? AND revoked_at IS NULL")
    .bind(id)
    .first<KeyRow>();
}

export async function activeKeyIdsForPurchase(
  db: D1Database,
  purchaseId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id FROM keys WHERE purchase_id = ? AND revoked_at IS NULL ORDER BY id")
    .bind(purchaseId)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

export async function activeKeyIdsForEmail(db: D1Database, email: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT id FROM keys WHERE email = ? AND revoked_at IS NULL ORDER BY issued_at, id")
    .bind(email)
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

export async function listDevices(db: D1Database, keyId: string): Promise<Device[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, host, activated_at FROM devices WHERE key_id = ? ORDER BY activated_at, id",
    )
    .bind(keyId)
    .all<DeviceRow>();
  return results.map((row) =>
    Device.parse({ id: row.id, name: row.name, host: row.host, activatedAt: row.activated_at }),
  );
}

export async function upsertDevice(db: D1Database, keyId: string, device: Device): Promise<void> {
  await db
    .prepare(
      "INSERT INTO devices (key_id, id, name, host, activated_at) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT (key_id, id) DO UPDATE SET name = excluded.name, host = excluded.host",
    )
    .bind(keyId, device.id, device.name, device.host, device.activatedAt)
    .run();
}

export async function removeDevice(
  db: D1Database,
  keyId: string,
  deviceId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM devices WHERE key_id = ? AND id = ?")
    .bind(keyId, deviceId)
    .run();
  return result.meta.changes > 0;
}
