## Fix the Huge Discount

### The Coupon Defense

Your app supports a coupon that gives **10% off**. (SAVE10)
Attackers can achieve **more than that**.

Your goal is to make it **impossible** to get **more than 10%** from this coupon.

[Walk Through](../walkthroughs/fixes/coupon_race_condition.md)

### Secure the file upload method

The bulk upload feature allows attackers to upload **malicious files**. 

Your goal is to secure the file upload method

<details>
<summary>Hints</summary>

<br>

- Should you serve user uploads from the same domain?

- What file types should be allowed?

- How can you force files to download instead of render?

- What HTTP headers protect against XSS?

</details>

[Walk Through](../walkthroughs/fixes/file_upload.md)


### Fix Price Control


The application must ensure that **item prices cannot be manipulated by the client**, even indirectly.

Your goal is to **prevent attackers from controlling item prices** through bulk uploads, hidden fields, or mass assignment.

[Walk Through](../walkthroughs/fixes/mass_assingment.md)

