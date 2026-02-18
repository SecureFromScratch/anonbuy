import { Router } from "express";
import asyncHandler from "../../middlewares/asyncHandler.js";
import { validateOrder } from "./validateOrder.js";
import { currentOrder, setOrder, bulkOrders } from "./orders.controller.js";
import { validateCouponRedeem, validateCouponRemove } from "./validateCoupon.js";
import { redeemCoupon, removeCoupon } from "./orders.controller.js";
import { upload } from "./bulk-orders-server.js";




const r = Router();
r.get("/:walletCode", asyncHandler(currentOrder));
r.post("/change", validateOrder, asyncHandler(setOrder));
r.post("/bulk", upload.single('file'), asyncHandler(bulkOrders)); 
r.post("/redeem-coupon", validateCouponRedeem, asyncHandler(redeemCoupon));
r.post("/remove-coupon", validateCouponRemove, asyncHandler(removeCoupon));

export default r;
