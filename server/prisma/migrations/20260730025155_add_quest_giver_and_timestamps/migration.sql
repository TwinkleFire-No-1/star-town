/*
  Warnings:

  - Added the required column `updatedAt` to the `player_quests` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "player_quests" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "quests" ADD COLUMN     "giverNpcId" TEXT,
ADD COLUMN     "repeatable" BOOLEAN NOT NULL DEFAULT false;
