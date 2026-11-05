-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('PAID', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('SD_WEB', 'COMMERCIAL_WEB', 'JAVA_OOP', 'PRESENTATION', 'LAB_REPORT', 'ASSIGNMENT_FORMATTING', 'PROJECT_DOCUMENTATION', 'HARDWARE_PROJECT', 'PC_REPAIR', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'STARTING_FROM', 'RANGE', 'CUSTOM_QUOTE');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ServiceOptionKind" AS ENUM ('PACKAGE', 'ADDON');

-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'SELECT', 'MULTISELECT', 'DATE', 'CHECKBOX', 'FILE', 'URL', 'PHONE');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('REQUEST_SUBMITTED', 'UNDER_REVIEW', 'DIAGNOSIS_SCHEDULED', 'DIAGNOSIS_SENT', 'QUOTATION_SENT', 'QUOTATION_DECLINED', 'QUOTATION_EXPIRED', 'ACCEPTED_AWAITING_PAYMENT', 'ORDER_CREATED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RequestFileKind" AS ENUM ('ATTACHMENT', 'PHOTO', 'DELIVERABLE');

-- CreateEnum
CREATE TYPE "RepairDeviceType" AS ENUM ('LAPTOP', 'DESKTOP');

-- CreateEnum
CREATE TYPE "RepairIssueCategory" AS ENUM ('WINDOWS_BOOT', 'SOFTWARE_DRIVERS', 'PERFORMANCE', 'HARDWARE_DIAGNOSIS', 'LAPTOP_SPECIFIC', 'GENERAL_TROUBLESHOOTING');

-- CreateEnum
CREATE TYPE "StatusEntityType" AS ENUM ('REQUEST', 'ORDER');

-- CreateEnum
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "WalletTxType" AS ENUM ('DEPOSIT', 'ORDER_PAYMENT', 'REFUND', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL', 'FEE', 'ADMIN_CREDIT', 'ADMIN_DEBIT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "WalletTxDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WalletMethod" AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'BINANCE', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DepositDeclineReason" AS ENUM ('TRX_NOT_FOUND', 'AMOUNT_MISMATCH', 'DUPLICATE', 'SUSPECTED_FRAUD', 'OTHER');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PAID_SCHEDULED';
ALTER TYPE "OrderStatus" ADD VALUE 'REVIEW_REVISION';
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED_COMPLETED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "acceptedQuotationId" TEXT,
ADD COLUMN     "amountPaid" DECIMAL(12,2),
ADD COLUMN     "amountRefunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentStatus" "OrderPaymentStatus",
ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "serviceSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "acceptedFileTypes" JSONB,
ADD COLUMN     "bannerImage" TEXT,
ADD COLUMN     "deliverables" JSONB,
ADD COLUMN     "deliveryEstimateText" TEXT,
ADD COLUMN     "faqs" JSONB,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "isPopular" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceFrom" DECIMAL(12,2),
ADD COLUMN     "priceNote" TEXT,
ADD COLUMN     "priceTo" DECIMAL(12,2),
ADD COLUMN     "pricingModel" "PricingModel",
ADD COLUMN     "requirementsText" TEXT,
ADD COLUMN     "revisionPolicy" TEXT,
ADD COLUMN     "serviceType" "ServiceType",
ADD COLUMN     "status" "ServiceStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "thumbnail" TEXT;

-- AlterTable
ALTER TABLE "ServiceCategory" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "nameBn" TEXT;

-- AlterTable
ALTER TABLE "ServiceOption" ADD COLUMN     "description" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "kind" "ServiceOptionKind",
ADD COLUMN     "priceFrom" DECIMAL(12,2),
ADD COLUMN     "priceTo" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "ServiceFormField" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "helpText" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceFormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'REQUEST_SUBMITTED',
    "answers" JSONB NOT NULL,
    "deadline" TIMESTAMP(3),
    "contactPreference" TEXT,
    "notes" TEXT,
    "assignedToId" TEXT,
    "serviceSnapshot" JSONB NOT NULL,
    "isRepair" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestFile" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "kind" "RequestFileKind" NOT NULL DEFAULT 'ATTACHMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(12,2) NOT NULL,
    "items" JSONB NOT NULL,
    "scopeText" TEXT NOT NULL,
    "deliverables" JSONB NOT NULL,
    "estimatedTimeline" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
    "sentById" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "deviceType" "RepairDeviceType" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT,
    "issueCategory" "RepairIssueCategory" NOT NULL,
    "symptoms" TEXT NOT NULL,
    "location" TEXT,
    "contactMethod" TEXT,
    "diagnosisNotes" TEXT,
    "estimatedCost" DECIMAL(12,2),
    "customerApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "entityType" "StatusEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestUpdate" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "heldBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "frozenReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTxType" NOT NULL,
    "direction" "WalletTxDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "actorId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "WalletMethod" NOT NULL,
    "amountClaimed" DECIMAL(12,2) NOT NULL,
    "amountCredited" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "usdtAmount" DECIMAL(18,6),
    "fxRate" DECIMAL(18,6),
    "trxId" TEXT NOT NULL,
    "trxIdNormalized" TEXT NOT NULL,
    "screenshotPublicId" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "declineReason" "DepositDeclineReason",
    "adminNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "WalletMethod" NOT NULL,
    "destination" TEXT NOT NULL,
    "network" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "fee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "outgoingTrxId" TEXT,
    "proofPublicId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodConfig" (
    "method" "WalletMethod" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT true,
    "withdrawEnabled" BOOLEAN NOT NULL DEFAULT true,
    "accountLabel" TEXT,
    "accountValue" TEXT,
    "accountType" TEXT,
    "qrPublicId" TEXT,
    "minDeposit" DECIMAL(12,2) NOT NULL,
    "maxDeposit" DECIMAL(12,2) NOT NULL,
    "minWithdraw" DECIMAL(12,2) NOT NULL,
    "maxWithdraw" DECIMAL(12,2) NOT NULL,
    "feePercent" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "feeFlat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodConfig_pkey" PRIMARY KEY ("method")
);

-- CreateTable
CREATE TABLE "WalletSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ServiceFormField_serviceId_idx" ON "ServiceFormField"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFormField_serviceId_key_key" ON "ServiceFormField"("serviceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_referenceNo_key" ON "ServiceRequest"("referenceNo");

-- CreateIndex
CREATE INDEX "ServiceRequest_userId_status_idx" ON "ServiceRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_createdAt_idx" ON "ServiceRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_serviceId_idx" ON "ServiceRequest"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceRequest_assignedToId_status_idx" ON "ServiceRequest"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "RequestFile_requestId_idx" ON "RequestFile"("requestId");

-- CreateIndex
CREATE INDEX "RequestFile_uploadedById_requestId_idx" ON "RequestFile"("uploadedById", "requestId");

-- CreateIndex
CREATE INDEX "Quotation_requestId_status_idx" ON "Quotation"("requestId", "status");

-- CreateIndex
CREATE INDEX "Quotation_status_validUntil_idx" ON "Quotation"("status", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_requestId_version_key" ON "Quotation"("requestId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "RepairRequest_requestId_key" ON "RepairRequest"("requestId");

-- CreateIndex
CREATE INDEX "RepairRequest_issueCategory_idx" ON "RepairRequest"("issueCategory");

-- CreateIndex
CREATE INDEX "StatusHistory_entityType_entityId_createdAt_idx" ON "StatusHistory"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestUpdate_requestId_createdAt_idx" ON "RequestUpdate"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "Wallet_status_idx" ON "Wallet"("status");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_refType_refId_idx" ON "WalletTransaction"("refType", "refId");

-- CreateIndex
CREATE INDEX "DepositRequest_userId_status_idx" ON "DepositRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "DepositRequest_status_createdAt_idx" ON "DepositRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DepositRequest_trxIdNormalized_idx" ON "DepositRequest"("trxIdNormalized");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_userId_status_idx" ON "WithdrawalRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_acceptedQuotationId_key" ON "Order"("acceptedQuotationId");

-- CreateIndex
CREATE INDEX "Service_status_isPopular_idx" ON "Service"("status", "isPopular");

-- CreateIndex
CREATE INDEX "Service_status_isFeatured_idx" ON "Service"("status", "isFeatured");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_acceptedQuotationId_fkey" FOREIGN KEY ("acceptedQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFormField" ADD CONSTRAINT "ServiceFormField_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestFile" ADD CONSTRAINT "RequestFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestFile" ADD CONSTRAINT "RequestFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestUpdate" ADD CONSTRAINT "RequestUpdate_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepositRequest" ADD CONSTRAINT "DepositRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─── Database guarantees beyond Prisma's expressiveness (Addendum §9) ───

-- WAL-03: wallet balances can never go negative.
ALTER TABLE "Wallet"
  ADD CONSTRAINT "wallet_non_negative_balances"
  CHECK ("balance" >= 0 AND "heldBalance" >= 0);

-- DEP-05: a TrxID is unique per method across all non-declined deposits
-- (case-insensitive normalization happens in application code).
CREATE UNIQUE INDEX "deposit_trx_unique_per_method"
  ON "DepositRequest"("method", "trxIdNormalized")
  WHERE "status" <> 'DECLINED';
