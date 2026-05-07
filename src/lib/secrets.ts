import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getEncryptionKeyHex(): string {
  const keyHex = (process.env.ENCRYPTION_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters");
  }
  return keyHex;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(getEncryptionKeyHex(), "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf-8")), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${authTag.toString("hex")}`;
}

function decryptLegacyCtrSecret(ivHex: string, dataHex: string): string {
  const decipher = createDecipheriv(
    "aes-256-ctr",
    Buffer.from(getEncryptionKeyHex(), "hex"),
    Buffer.from(ivHex, "hex")
  );
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf-8");
}

export function decryptSecret(ciphertext: string): string {
  const parts = ciphertext.split(":");
  const [ivHex, dataHex, tagHex] = parts;

  if (!ivHex || !dataHex || !/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(dataHex)) {
    throw new Error("Invalid encrypted secret format");
  }

  if (parts.length === 2) {
    // Backward compatibility for existing AES-CTR data; newly written data uses GCM.
    return decryptLegacyCtrSecret(ivHex, dataHex);
  }

  if (!tagHex || !/^[0-9a-fA-F]+$/.test(tagHex)) {
    throw new Error("Invalid encrypted secret authentication tag");
  }

  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(getEncryptionKeyHex(), "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf-8");
}
