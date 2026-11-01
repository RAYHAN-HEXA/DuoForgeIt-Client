/*
  Warnings:

  - Made the column `uploadedById` on table `OrderAttachment` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "OrderAttachment" DROP CONSTRAINT "OrderAttachment_uploadedById_fkey";

-- AlterTable
ALTER TABLE "OrderAttachment" ALTER COLUMN "orderId" DROP NOT NULL,
ALTER COLUMN "uploadedById" SET NOT NULL;

-- CreateIndex
CREATE INDEX "OrderAttachment_uploadedById_orderId_idx" ON "OrderAttachment"("uploadedById", "orderId");

-- AddForeignKey
ALTER TABLE "OrderAttachment" ADD CONSTRAINT "OrderAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
