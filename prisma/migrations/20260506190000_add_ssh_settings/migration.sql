-- CreateTable
CREATE TABLE "SshSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "passwordEnc" TEXT,
    "privateKeyEnc" TEXT,
    "keyPassphraseEnc" TEXT,
    "sftpRoot" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
