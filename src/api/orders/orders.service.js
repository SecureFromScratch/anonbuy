import { prisma, Prisma, BusinessError } from "../../prisma.js";

export async function getOrder({ walletCode }) {
   const existing = await prisma.order.findUnique({
      where: { walletCode },
      include: { lines: true, coupons: true }
   });
   return existing;
}

export async function setOrder({ lines, walletCode, buyerIp }) {
   return prisma.$transaction(async (tx) => {
      // 1) Validate all items in ONE query
      const itemIds = [...new Set(lines.map(l => l.itemId))];
      const items = await tx.item.findMany({
         where: { id: { in: itemIds }, active: true },
         select: { id: true, price: true }
      });
      if (items.length !== itemIds.length) {
         throw new BusinessError("One or more items not found or inactive");
      }
      const priceById = new Map(items.map(i => [i.id, i.price]));

      // 2) Build line payload with computed prices

      const lineData = lines.map((line) => {
         if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
            throw new BusinessError(`Invalid quantity for item ${line.itemId}`);
         }
         const unitPrice = priceById.get(line.itemId);
         const totalPrice = unitPrice * line.quantity;
         if (!(totalPrice > 0)) {
            throw new BusinessError(`Invalid total price for ${line.itemId}`);
         }
         return {
            unitPrice,
            totalPrice,
            ...line,          
            itemId: line.itemId,
            quantity: line.quantity,
         };
      });

      const existing = await tx.order.findUnique({ where: { walletCode } })

      if (existing) {
         // reset lines
         return tx.order.update({
            where: { id: existing.id },
            data: {
               status: "PENDING",
               buyerIp: buyerIp ?? existing.buyerIp ?? null,
               lines: {
                  deleteMany: {},            // delete all prior lines
                  create: lineData
               }
            },
            include: { lines: true, coupons: true }
         });
      }

      // create new
      return tx.order.create({
         data: {
            status: "PENDING",
            walletCode: walletCode,
            buyerIp: buyerIp ?? null,
            lines: { create: lineData }
         },
         include: { lines: true, coupons: true }
      });
   });
}

export async function bulkSetOrders({ orders, buyerIp }) {
   const results = await Promise.allSettled(
      orders.map(({ lines, walletCode }) => setOrder({ lines, walletCode, buyerIp }))
   );

   const created = [];
   const errors = [];

   results.forEach((r, i) => {
      if (r.status === "fulfilled") {
         created.push(r.value);
      } else {
         errors.push({ index: i, walletCode: orders[i].walletCode, error: r.reason?.message ?? "Unknown error" });
      }
   });

   return { created: created.length, results: created, errors };
}

export async function redeemCoupon({ walletCode, couponCode }) {
   return prisma.$transaction(async (tx) => {
      // USING findFirst IS BAD - DO YOU KNOW WHY?
      const coupon = await tx.coupon.findFirst({ where: { code: couponCode, active: true } });
      if (!coupon) throw new BusinessError("Coupon invalid");

      const order = await tx.order.findUnique({ where: { walletCode } });
      if (!order) throw new BusinessError("No current order");

      const used = await tx.couponRedemption.findFirst({
         where: { orderId: order.id, couponId: coupon.id }
      });
      if (used) throw new BusinessError("Already used");

      // widen race window
      await new Promise(r => setTimeout(r, 300));

      return tx.couponRedemption.create({
         data: { couponId: coupon.id, couponCode: coupon.code, orderId: order.id, percent: coupon.percent, walletCode: walletCode },
      });
   });
}

export async function removeCoupon({ walletCode, couponId }) {
   return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { walletCode } });
      if (!order) throw new BusinessError("No current order");

      return tx.couponRedemption.deleteMany({
         where: { orderId: order.id, couponId }
      });
   });
}

