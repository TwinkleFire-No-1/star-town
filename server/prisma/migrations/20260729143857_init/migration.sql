-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hp" INTEGER NOT NULL DEFAULT 100,
    "maxHp" INTEGER NOT NULL DEFAULT 100,
    "sp" INTEGER NOT NULL DEFAULT 50,
    "maxSp" INTEGER NOT NULL DEFAULT 50,
    "attack" INTEGER NOT NULL DEFAULT 10,
    "defense" INTEGER NOT NULL DEFAULT 5,
    "speed" INTEGER NOT NULL DEFAULT 10,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 160,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "direction" TEXT NOT NULL DEFAULT 'down',
    "starCoins" INTEGER NOT NULL DEFAULT 100,
    "gameDay" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npcs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'villager',
    "personality" TEXT NOT NULL DEFAULT '',
    "backstory" TEXT NOT NULL DEFAULT '',
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "direction" TEXT NOT NULL DEFAULT 'down',
    "schedule" JSONB NOT NULL DEFAULT '[]',
    "hp" INTEGER NOT NULL DEFAULT 80,
    "maxHp" INTEGER NOT NULL DEFAULT 80,
    "attack" INTEGER NOT NULL DEFAULT 8,
    "defense" INTEGER NOT NULL DEFAULT 4,
    "speed" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "npcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'misc',
    "attack" INTEGER NOT NULL DEFAULT 0,
    "defense" INTEGER NOT NULL DEFAULT 0,
    "healHp" INTEGER NOT NULL DEFAULT 0,
    "healSp" INTEGER NOT NULL DEFAULT 0,
    "buyPrice" INTEGER NOT NULL DEFAULT 0,
    "sellPrice" INTEGER NOT NULL DEFAULT 0,
    "stackable" BOOLEAN NOT NULL DEFAULT true,
    "maxStack" INTEGER NOT NULL DEFAULT 99,
    "iconKey" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_items" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "equipped" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "player_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'main',
    "chapter" INTEGER NOT NULL DEFAULT 0,
    "triggerCond" JSONB NOT NULL DEFAULT '{}',
    "completeCond" JSONB NOT NULL DEFAULT '{}',
    "rewardExp" INTEGER NOT NULL DEFAULT 0,
    "rewardCoins" INTEGER NOT NULL DEFAULT 0,
    "rewardItems" JSONB NOT NULL DEFAULT '[]',
    "prerequisiteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_quests" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "progress" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "player_quests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_memories" (
    "id" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'observation',
    "content" TEXT NOT NULL,
    "importance" INTEGER NOT NULL DEFAULT 5,
    "embedding" vector(1536),
    "context" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "npc_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_memories" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "npcId" TEXT,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_relations" (
    "id" TEXT NOT NULL,
    "sourceNpcId" TEXT NOT NULL,
    "targetNpcId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'neutral',
    "affection" INTEGER NOT NULL DEFAULT 50,
    "trust" INTEGER NOT NULL DEFAULT 50,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "npc_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_relations" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "affection" INTEGER NOT NULL DEFAULT 50,
    "trust" INTEGER NOT NULL DEFAULT 50,
    "reputation" INTEGER NOT NULL DEFAULT 50,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "players_name_key" ON "players"("name");

-- CreateIndex
CREATE UNIQUE INDEX "npcs_name_key" ON "npcs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "items_name_key" ON "items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "player_items_playerId_itemId_key" ON "player_items"("playerId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "player_quests_playerId_questId_key" ON "player_quests"("playerId", "questId");

-- CreateIndex
CREATE INDEX "npc_memories_npcId_idx" ON "npc_memories"("npcId");

-- CreateIndex
CREATE INDEX "player_memories_playerId_idx" ON "player_memories"("playerId");

-- CreateIndex
CREATE INDEX "npc_relations_sourceNpcId_idx" ON "npc_relations"("sourceNpcId");

-- CreateIndex
CREATE INDEX "npc_relations_targetNpcId_idx" ON "npc_relations"("targetNpcId");

-- CreateIndex
CREATE UNIQUE INDEX "npc_relations_sourceNpcId_targetNpcId_key" ON "npc_relations"("sourceNpcId", "targetNpcId");

-- CreateIndex
CREATE UNIQUE INDEX "player_relations_playerId_npcId_key" ON "player_relations"("playerId", "npcId");

-- AddForeignKey
ALTER TABLE "player_items" ADD CONSTRAINT "player_items_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_items" ADD CONSTRAINT "player_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_questId_fkey" FOREIGN KEY ("questId") REFERENCES "quests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_memories" ADD CONSTRAINT "npc_memories_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "npcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_memories" ADD CONSTRAINT "player_memories_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_relations" ADD CONSTRAINT "npc_relations_sourceNpcId_fkey" FOREIGN KEY ("sourceNpcId") REFERENCES "npcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_relations" ADD CONSTRAINT "npc_relations_targetNpcId_fkey" FOREIGN KEY ("targetNpcId") REFERENCES "npcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_relations" ADD CONSTRAINT "player_relations_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
