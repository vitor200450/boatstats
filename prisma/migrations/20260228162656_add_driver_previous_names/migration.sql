-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "previousNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
