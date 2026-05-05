-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserPermissionGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserPermissionGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserPermissionGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_UserPermissionGroup" ("createdAt", "groupId", "id", "userId") SELECT "createdAt", "groupId", "id", "userId" FROM "UserPermissionGroup";
DROP TABLE "UserPermissionGroup";
ALTER TABLE "new_UserPermissionGroup" RENAME TO "UserPermissionGroup";
CREATE INDEX "UserPermissionGroup_userId_idx" ON "UserPermissionGroup"("userId");
CREATE INDEX "UserPermissionGroup_groupId_idx" ON "UserPermissionGroup"("groupId");
CREATE UNIQUE INDEX "UserPermissionGroup_userId_groupId_key" ON "UserPermissionGroup"("userId", "groupId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
