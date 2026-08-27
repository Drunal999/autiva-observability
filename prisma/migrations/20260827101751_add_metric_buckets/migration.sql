-- CreateTable
CREATE TABLE "MetricBucket" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "p50Ms" INTEGER NOT NULL DEFAULT 0,
    "p95Ms" INTEGER NOT NULL DEFAULT 0,
    "p99Ms" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION NOT NULL DEFAULT 100,

    CONSTRAINT "MetricBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetricBucket_at_key" ON "MetricBucket"("at");

-- CreateIndex
CREATE INDEX "MetricBucket_at_idx" ON "MetricBucket"("at");
