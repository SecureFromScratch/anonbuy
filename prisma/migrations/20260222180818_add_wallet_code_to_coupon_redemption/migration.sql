/*
  Warnings:

  - Added the required column `walletCode` to the `CouponRedemption` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."CouponRedemption" ADD COLUMN     "walletCode" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_walletCode_fkey" FOREIGN KEY ("walletCode") REFERENCES "public"."Wallet"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
