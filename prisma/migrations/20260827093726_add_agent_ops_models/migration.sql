-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('IDLE', 'RUNNING', 'BLOCKED', 'FAILED', 'DONE');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "RunTrigger" AS ENUM ('MANUAL', 'CRON', 'WEBHOOK', 'AGENT');

-- CreateEnum
CREATE TYPE "SpanType" AS ENUM ('LLM', 'TOOL', 'SHELL', 'FILE', 'SUBAGENT');

-- CreateEnum
CREATE TYPE "SpanStatus" AS ENUM ('OK', 'RUNNING', 'ERROR', 'WARN');

-- CreateEnum
CREATE TYPE "LogStream" AS ENUM ('STDOUT', 'STDERR', 'SYSTEM');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('READING', 'WRITING', 'MODIFIED', 'COMMITTED');

-- CreateEnum
CREATE TYPE "NodeKind" AS ENUM ('TRIGGER', 'CONDITION', 'ACTION');

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'IDLE',
    "currentStep" TEXT,
    "startedAt" TIMESTAMP(3),
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stepMs" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "trigger" "RunTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" TEXT,
    "exitCode" INTEGER,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Span" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "SpanType" NOT NULL,
    "name" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "durMs" INTEGER NOT NULL,
    "status" "SpanStatus" NOT NULL DEFAULT 'OK',
    "model" TEXT,
    "tokens" INTEGER,
    "error" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Span_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogLine" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stream" "LogStream" NOT NULL DEFAULT 'STDOUT',
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "text" TEXT NOT NULL,

    CONSTRAINT "LogLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFile" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'READING',
    "added" INTEGER NOT NULL DEFAULT 0,
    "removed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkspaceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" "RunTrigger" NOT NULL DEFAULT 'CRON',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "runsToday" INTEGER NOT NULL DEFAULT 0,
    "p95Ms" INTEGER NOT NULL DEFAULT 0,
    "failures1h" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowNode" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "kind" "NodeKind" NOT NULL,
    "title" TEXT NOT NULL,
    "meta" TEXT,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "p95Ms" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "edgesTo" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "FlowNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowRun" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "status" "SpanStatus" NOT NULL DEFAULT 'OK',
    "summary" TEXT NOT NULL,
    "durMs" INTEGER NOT NULL DEFAULT 0,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_name_key" ON "Agent"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Run_ref_key" ON "Run"("ref");

-- CreateIndex
CREATE INDEX "Run_agentId_startedAt_idx" ON "Run"("agentId", "startedAt");

-- CreateIndex
CREATE INDEX "Span_runId_startMs_idx" ON "Span"("runId", "startMs");

-- CreateIndex
CREATE INDEX "LogLine_runId_ts_idx" ON "LogLine"("runId", "ts");

-- CreateIndex
CREATE INDEX "WorkspaceFile_runId_idx" ON "WorkspaceFile"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "Flow_name_key" ON "Flow"("name");

-- CreateIndex
CREATE INDEX "FlowNode_flowId_idx" ON "FlowNode"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "FlowRun_ref_key" ON "FlowRun"("ref");

-- CreateIndex
CREATE INDEX "FlowRun_flowId_at_idx" ON "FlowRun"("flowId", "at");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Span" ADD CONSTRAINT "Span_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogLine" ADD CONSTRAINT "LogLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFile" ADD CONSTRAINT "WorkspaceFile_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowNode" ADD CONSTRAINT "FlowNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
