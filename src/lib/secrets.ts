import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function getEncryptionKeyHex(): string {
  const keyHex = (process.env.ENCRYPTION_KEY ?? "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(keyHex) && !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be 32 or 64 hex characters");
  }
  return keyHex.padEnd(64, "0");
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-ctr", Buffer.from(getEncryptionKeyHex(), "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf-8")), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !dataHex || !/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(dataHex)) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = createDecipheriv(
    "aes-256-ctr",
    Buffer.from(getEncryptionKeyHex(), "hex"),
    Buffer.from(ivHex, "hex")
  );
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
  return decrypted.toString("utf-8");
}
