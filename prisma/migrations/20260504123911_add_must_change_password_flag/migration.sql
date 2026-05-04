-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
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
    CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContainerPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "permissionId" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "containerName" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT true,
    "canStart" BOOLEAN NOT NULL DEFAULT false,
    "canStop" BOOLEAN NOT NULL DEFAULT false,
    "canRestart" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canLogs" BOOLEAN NOT NULL DEFAULT false,
    "canExec" BOOLEAN NOT NULL DEFAULT false,
    "canInspect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContainerPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "UserPermission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FsPathPermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "permissionId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT true,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FsPathPermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "UserPermission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "detail" TEXT,
    "ipAddress" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_key" ON "UserPermission"("userId");

-- CreateIndex
CREATE INDEX "ContainerPermission_permissionId_idx" ON "ContainerPermission"("permissionId");

-- CreateIndex
CREATE INDEX "ContainerPermission_containerId_idx" ON "ContainerPermission"("containerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContainerPermission_permissionId_containerId_key" ON "ContainerPermission"("permissionId", "containerId");

-- CreateIndex
CREATE INDEX "FsPathPermission_permissionId_idx" ON "FsPathPermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "FsPathPermission_permissionId_path_key" ON "FsPathPermission"("permissionId", "path");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resource_idx" ON "AuditLog"("resource");
