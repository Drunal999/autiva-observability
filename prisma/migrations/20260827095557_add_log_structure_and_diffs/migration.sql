-- CreateEnum
CREATE TYPE "LogKind" AS ENUM ('TEXT', 'TOOL', 'DIFF', 'STACK');

-- AlterTable
ALTER TABLE "LogLine" ADD COLUMN     "args" TEXT,
ADD COLUMN     "kind" "LogKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "lines" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "meta" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceFile" ADD COLUMN     "diff" TEXT[] DEFAULT ARRAY[]::TEXT[];
