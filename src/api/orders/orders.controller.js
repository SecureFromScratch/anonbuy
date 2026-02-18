import * as svc from "./orders.service.js";
import { BusinessError } from "../../prisma.js";
import { parseCSV } from './bulk-orders-server.js';

export async function currentOrder(req, res) {
  const { walletCode } = req.params;
  if (!walletCode) {
    res.status(200).json({});
    return;
  }

  const order = await svc.getOrder({ walletCode });
  if (!order) {
    res.status(200).json({});
    return;
  }

  res.status(200).json({
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    lines: order.lines.map(({ itemId, quantity, unitPrice, totalPrice }) => ({
      itemId,
      quantity,
      unitPrice,
      totalPrice
    })),
    coupons: order.coupons.map(
      ({ id, orderId, couponId, couponCode, percent }) =>
        ({ id, orderId, couponId, couponCode, percent })
    )
  });
}

// lines: Array<{ itemId: number, quantity: number }>
// order-level fields: { idempotencyKey?: string, buyerIp?: string }
export async function setOrder(req, res) {
  const { lines, walletCode } = res.locals.data;
  const buyerIp = (req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");

  if (!Array.isArray(lines)) {
    throw new Error("lines must be an array");
  }

  const order = await svc.setOrder({ lines, walletCode, buyerIp });
  res.status(201).json({
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    lines: order.lines.map(({ itemId, quantity, unitPrice, totalPrice }) => ({
      itemId,
      quantity,
      unitPrice,
      totalPrice
    })),
    coupons: order.coupons.map(
      ({ id, orderId, couponId, couponCode, percent }) =>
        ({ id, orderId, couponId, couponCode, percent })
    )
  });
}


export async function bulkOrders(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let rows;
  try { rows = parseCSV(req.file.buffer); }
  catch (err) { return res.status(400).json({ error: `CSV parse error: ${err.message}` }); }

  const orderMap = new Map();
  for (const row of rows) {
    const walletCode = row.walletCode;
    if (!orderMap.has(walletCode)) orderMap.set(walletCode, []);

    // Build line object from CSV row - convert string numbers to actual numbers
    const line = {};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'walletCode') continue;  // skip wallet, we already have it
      // Try to parse as number if it looks numeric
      line[key] = !isNaN(value) && value !== '' ? Number(value) : value;
    }

    orderMap.get(walletCode).push(line);
  }

  const results = await Promise.allSettled(
    [...orderMap.entries()].map(([walletCode, lines]) =>
      svc.setOrder({ lines, walletCode, buyerIp: req.ip })
    )
  );

  const created = results.filter(r => r.status === 'fulfilled').length;
  const errors = results
    .map((r, i) => r.status === 'rejected'
      ? { walletCode: [...orderMap.keys()][i], error: r.reason?.message }
      : null)
    .filter(Boolean);

  res.status(207).json({ created, errors });
}

export async function redeemCoupon(req, res) {
  // THERE'S A VULNERABILITY HERE - CAN YOU FIND IT?
  const { walletCode, code } = res.locals.couponReq;
  try {
    const r = await svc.redeemCoupon({ walletCode, couponCode: code });
    res.status(201).json({
      id: r.id, couponCode: code, couponId: r.couponId, percent: r.percent
    });
  }
  catch (err) {
    if (err instanceof BusinessError) {
      res.status(400).json({ message: err.message });
    }
    else {
      throw err;
    }
  }
}

export async function removeCoupon(req, res) {
  const { walletCode, couponId } = res.locals.couponReq;
  try {
    const r = await svc.removeCoupon({ walletCode, couponId });
    res.status(200).json({});
  }
  catch (err) {
    if (err instanceof BusinessError) {
      res.status(400).json({ message: err.message });
    }
    else {
      throw err;
    }
  }
}
