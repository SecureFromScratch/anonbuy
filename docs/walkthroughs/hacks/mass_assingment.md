## Mass Assignment

As you may have noticed, the application allows uploading an order via a **bulk CSV** instead of selecting items one by one.
Before uploading, try adding extra columns to the CSV and observe how the server handles them.

1. Download the sample CSV file.
2. Upload an order using the bulk upload feature.
3. Inspect the model or entity that stores the order items.
4. Think about what might happen if the CSV includes additional fields (for example, `unitPrice`).
5. Open DevTools (Inspect) and look for a hidden or disabled UI button that allows downloading another sample file.
6. Change the button’s visibility (for example, remove `visibility:hidden`) in the Elements panel).
7. Download the alternative sample CSV file.
8. Inspect the file and identify what is different (extra columns, different headers, etc.).
9. Upload the file.
10. Observe that the item prices have changed.
