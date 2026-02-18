## Fix the Huge Discount

### The Coupon Defense

Your app supports a coupon that gives **10% off**. (SAVE10)
Attackers can achieve **more than that**.

Your goal is to make it **impossible** to get **more than 10%** from this coupon.

[Walk Through](../walkthroughs/fixes/coupon_race_condition.md)

### Fix Price Control


The application must ensure that **item prices cannot be manipulated by the client**, even indirectly.

Your goal is to **prevent attackers from controlling item prices** through bulk uploads, hidden fields, or mass assignment.

[Walk Through](../walkthroughs/fixes/mass_assingment.md)

