import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME ?? "admin";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme";

  const existing = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (existing) {
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
          terminalAccess: true,
          terminalReadOnly: false,
          terminalMaxSessions: 0,
        },
      },
    },
  });

  console.log(`[seed] Created admin user: ${admin.username} (id: ${admin.id})`);
}

main()
  .catch((e) => {
    console.error("[seed] Fatal error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
