-- Migration number: 0001 	 2024-05-09T09:28:45.679Z

-- CreateTable
CREATE TABLE "Submissions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "state" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "country" TEXT,
    "user_agent" TEXT
);

