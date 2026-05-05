-- CreateTable
CREATE TABLE "PermissionGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dockerAccess" BOOLEAN NOT NULL DEFAULT false,
    "dockerViewAll" BOOLEAN NOT NULL DEFAULT false,
    "dockerImages" BOOLEAN NOT NULL DEFAULT false,
    "dockerVolumes" BOOLEAN NOT NULL DEFAULT false,
    "dockerNetworks" BOOLEAN NOT NULL DEFAULT false,
    "dockerCreate" BOOLEAN NOT NULL DEFAULT false,
    "dockerDelete" BOOLEAN NOT NULL DEFAULT false,
    "fsAccess" BOOLEAN NOT NULL DEFAULT false,
    "terminalAccess" BOOLEAN NOT NULL DEFAULT false,
    "terminalReadOnly" BOOLEAN NOT NULL DEFAULT true,
    "terminalMaxSessions" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserPermissionGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermissionGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPermissionGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGroup_name_key" ON "PermissionGroup"("name");

-- CreateIndex
CREATE INDEX "UserPermissionGroup_userId_idx" ON "UserPermissionGroup"("userId");

-- CreateIndex
CREATE INDEX "UserPermissionGroup_groupId_idx" ON "UserPermissionGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionGroup_userId_groupId_key" ON "UserPermissionGroup"("userId", "groupId");
