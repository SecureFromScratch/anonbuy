import { prisma, Prisma, BusinessError } from "../../prisma.js";
//import * as solution from "./spoilers/serialized.js"

export async function getWallet({ code }) {
   const existing = await prisma.wallet.findUnique({ where: { code } });
   return existing;
}

export async function transferAll({ from, to }) {
    return prisma.$transaction(
        async (tx) => {
            const fromWallet = await tx.wallet.findUnique({
                where: { code: from },
            });

            if (!fromWallet) {
                throw new BusinessError("Wallet to withdraw from not found");
            }

            const transferAmount = fromWallet.balance;

            if (transferAmount <= 0) {
                throw new BusinessError("Wallet to withdraw from doesn't have any funds");
            }

            const result = await tx.wallet.update({
                where: { code: to },
                data: { balance: { increment: transferAmount } },
            });

            await tx.wallet.update({
                where: { code: from },
                data: { balance: { decrement: transferAmount } },
            });

            return result;
        },
        {
            maxWait: 10000,
            timeout: 10000,
        }
    );
}