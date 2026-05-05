import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createDecipheriv } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  const adminPassword = getAdminPassword();

  const existing = await prisma.user.findUnique({
    where: { username: adminUsername },
    include: {
      permissions: {
        include: {
          fsPathPerms: true,
        },
      },
    },
  });

  if (existing) {
    const looksLikeBcrypt = /^\$2[aby]\$\d{2}\$/.test(existing.passwordHash ?? "");
    if (!looksLikeBcrypt) {
      const migratedHash = await bcrypt.hash(adminPassword, 12);
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: migratedHash,
          mustChangePassword: false,
        },
      });
      console.log(`[seed] Migrated admin password to bcrypt hash for "${adminUsername}".`);
    }

    if (existing.permissions) {
      await prisma.userPermission.update({
        where: { id: existing.permissions.id },
        data: {
          dockerAccess: true,
          dockerViewAll: true,
          dockerImages: true,
          dockerVolumes: true,
          dockerNetworks: true,
          dockerCreate: true,
          dockerDelete: true,
          fsAccess: true,
          terminalAccess: true,
          terminalReadOnly: false,
          terminalMaxSessions: 0,
        },
      });

      const hasRootPath = existing.permissions.fsPathPerms.some((entry) => entry.path === "/");
      if (!hasRootPath) {
        await prisma.fsPathPermission.create({
          data: {
            permissionId: existing.permissions.id,
            path: "/",
            readOnly: false,
            canCreate: true,
            canDelete: true,
          },
        });
      }
    }

    console.log(`[seed] Admin user "${adminUsername}" already exists — skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.create({
    data: {
      username: adminUsername,
      passwordHash,
      displayName: "Administrator",
      role: "ADMIN",
      isActive: true,
      permissions: {
        create: {
          dockerAccess: true,
          dockerViewAll: true,
          dockerImages: true,
          dockerVolumes: true,
          dockerNetworks: true,
          dockerCreate: true,
          dockerDelete: true,
          fsAccess: true,
          fsPathPerms: {
            create: {
              path: "/",
              readOnly: false,
              canCreate: true,
              canDelete: true,
            },
          },
          terminalAccess: true,
          terminalReadOnly: false,
          terminalMaxSessions: 0,
        },
      },
    },
  });

  console.log(`[seed] Created admin user: ${admin.username} (id: ${admin.id})`);
}

function getAdminPassword(): string {
  const encrypted = process.env.ADMIN_PASSWORD_ENC?.trim();
  const fallback = process.env.ADMIN_PASSWORD?.trim();

  if (encrypted) return decryptSecret(encrypted);
  if (fallback) return fallback;
  return "changeme";
}

function decryptSecret(ciphertext: string): string {
  const keyHex = process.env.ENCRYPTION_KEY?.trim() ?? "";
  if (!/^[0-9a-fA-F]{32}$/.test(keyHex) && !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error("ENCRYPTION_KEY must be 32 or 64 hex characters");
  }

  const [ivHex, dataHex] = ciphertext.split(":");
  if (!ivHex || !dataHex || !/^[0-9a-fA-F]+$/.test(ivHex) || !/^[0-9a-fA-F]+$/.test(dataHex)) {
    throw new Error("Invalid ADMIN_PASSWORD_ENC format");
  }

  const normalizedKeyHex = keyHex.padEnd(64, "0");
  const decipher = createDecipheriv(
    "aes-256-ctr",
    Buffer.from(normalizedKeyHex, "hex"),
    Buffer.from(ivHex, "hex")
  );
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf-8");
}

main()
  .catch((e) => {
    console.error("[seed] Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
