-- What happened when an engine carried out an approved action.
ALTER TABLE "Approval" ADD COLUMN "appliedAt" TIMESTAMP(3),
ADD COLUMN "applyOk" BOOLEAN,
ADD COLUMN "applyNote" TEXT;
