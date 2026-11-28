# Demo script (60–90 seconds)

Screen-record at phone width (375 × 812, or DevTools device mode) in stub mode. No credentials needed.

**Setup (before recording)**

```bash
rm -rf .data && npm run dev
```

Open `http://localhost:3000/?stub=` (clears any leftover scenario flags).

---

| Time | Do | Say (voice-over) |
|---|---|---|
| 0:00 | Welcome screen. Point at the badge, tap **Continue in demo mode**. | “Instamart Lists lets you shop groceries with Instamart by chat. It’s powered by Instamart.” |
| 0:06 | Tap the **Create a list** chip, finish the sentence: `with milk, bread, 6 eggs and 1kg atta` → send. | “I describe my weekly shop in one sentence.” |
| 0:12 | “Found these for you” card. Tap **Swap variant** on atta, pick **5 kg**. Bump bread to 2 with **+**. | “It picks the best pack size and price, and I can swap variants or change quantities.” |
| 0:22 | Tap **Save as L1**. | “Saved as L1.” |
| 0:26 | Type `Add 2 bananas to L1, remove eggs, rename it to Weekly staples` → send. | “Editing is plain language too.” |
| 0:32 | Diff card: green **+ bananas**, red struck-through **eggs**, rename line, “unchanged” collapsed. Tap **Apply changes**. | “I see exactly what changes before I apply it.” |
| 0:38 | Tap **My lists**. Open **Demo scenarios** at the bottom, tick out-of-stock (milk 500 ml), price change and surge fee. | “Let’s simulate a real-world order: something’s out of stock, a price changed, and there’s a surge.” |
| 0:46 | On L1 tap **Order this list**. Checklist animates: Checking availability → Adding to cart → Fetching bill. | “One tap reorders the whole list.” |
| 0:52 | Summary: amber substitution banner → **Accept**. Point at **Price updated ₹49 to ₹52**, the amber **Surge Fee** line, and the bill. | “It swapped the out-of-stock item and flagged the price change. Every number comes from Instamart.” |
| 1:02 | Surge banner “A surge fee of ₹25 is applied right now” → tap **Order anyway**. | “Nothing is ordered until I confirm. The assistant itself can’t place orders.” |
| 1:08 | Success screen: order ID, badge. Tap **Track order** to show the status. | “Order placed, and I can track it.” |
| 1:14 | Optional: back to chat, type `Order L1 under ₹150` to show the budget bar and suggestions. | “Budgets work too.” |
| 1:20 | End. | |

**Tips**

- Out-of-stock needs the list to contain **Amul Taaza Toned Milk 500 ml**. With flags off at creation time, “milk” picks that one, so don’t swap the milk.
- Price change needs **Britannia White Bread 400 g** saved at ₹49, so create the list with flags off.
- To show the no-ETA path, tick “Order responses have no ETA”. The ETA line disappears.
- Shortcut: `http://localhost:3000/?stub=demo` sets out-of-stock + price + surge for the whole tab (do it only after creating the list).
