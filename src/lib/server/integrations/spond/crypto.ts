import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { IntegrationError } from "@/lib/server/integrations/spond/errors";

const ALGORITHM = "aes-256-gcm";

function getSecretKey(): Buffer {
  const secret = process.env.SPOND_CREDENTIALS_SECRET;

  if (!secret) {
    throw new IntegrationError(
      "ENCRYPTION_NOT_CONFIGURED",
      "Spond-kryptering er ikke konfigurert på serveren.",
      500
    );
  }

  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptJson(payload: unknown): string {
  const key = getSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptJson<T>(encoded: string): T {
  const key = getSecretKey();
  const [version, ivBase64, encryptedBase64, tagBase64] = encoded.split(":");

  if (version !== "v1" || !ivBase64 || !encryptedBase64 || !tagBase64) {
    throw new IntegrationError("INVALID_CREDENTIALS_PAYLOAD", "Ugyldig lagret Spond-tilkobling.", 500);
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}
