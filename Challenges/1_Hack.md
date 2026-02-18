# Hacking Challanges

## Get a Huge Discount

### The Coupon

Greetings! You received a **coupon** that gives you a **10% discount**.

To use it, enter `SAVE10` in the coupon field and apply the coupon.

But wait…
Can you **achieve more than a 10% discount**?

[Walk Through](../walkthroughs/hacks/race_condition.md) 

## Compromise the Admin

The developers noticed suspicious activity and started monitoring orders more closely. 

You notice the bulk endpoint accepts a file with items.
Can you exploit this feature to **steal the admin's credentials** when they review uploaded files?


<details>
<summary>Hints:</summary>

<br>

- What file types are actually being accepted?

- Where are uploaded files stored?

- Can you make the admin visit a URL under your control?

- Remember: the same-origin policy matters

</details>

[Walk Through](../walkthroughs/hacks/file_upload.md)

## Control the Price

Oh no. It’s no longer possible to get more than a **10% discount** after the developers fixed the vulnerability.
What can you do now? Could you somehow control the **price of the items** in the shop?

[Walk Through](../walkthroughs/hacks/mass_assingment.md)
