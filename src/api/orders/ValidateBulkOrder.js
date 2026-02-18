'use strict';
import { z } from "zod";
import { OrderSchema } from "./validateOrder.js";

// ── Schema ─────────────────────────────────────────────────────

export const BulkOrderSchema = z.object({
  orders: z.array(OrderSchema).min(1).max(500),
}).strict();

// ── Middleware ─────────────────────────────────────────────────

export function validateBulkOrders(req, res, next) {
  const parsed = BulkOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error:   "Invalid body",
      details: parsed.error.issues.map(i => ({
        path:    i.path.join("."),
        message: i.message,
      })),
    });
  }
  res.locals.data = parsed.data;
  next();
}

