# Tab — Session Handoff

## What was done this session

### Custom tip % / $ toggle
- Setup page "Custom" tip now has a `[%] [$]` toggle
- `$` mode accepts a flat dollar amount; converts to effective % at publish time
- Totals panel label updates to show "fixed" vs "X%"

### Currency formatting
- Fixed `fmt()` to use `Intl.toLocaleString` — now shows commas ($2,423.40) and always two decimals when cents exist
- Dashboard bill cards use `fmtCurrency(amount, bill.currency)` instead of `fmt()`

### Multi-photo receipt upload
- setup.html: pre-generates `billId = crypto.randomUUID()` upfront
- Multiple photos can be uploaded and scanned sequentially — items merge into the list
- Photo strip shows thumbnails with gold checkmarks after each scan
- "Add another photo" button appears after each scan
- On publish: photos compressed → uploaded to Supabase Storage `receipts` bucket → URLs saved in `bills.receipt_urls TEXT[]`
- bill.html receipt sheet: "Digital / Photos" tab toggle appears when `receipt_urls` has entries

### Storage setup (user completed)
- Created `receipts` bucket (public) in Supabase dashboard
- Ran SQL migration: `ALTER TABLE tab.bills ADD COLUMN IF NOT EXISTS receipt_urls TEXT[] DEFAULT '{}';`
- Storage INSERT/SELECT policies added (in supabase-schema.sql)

### 422 scan error fix
- `parse-receipt.js`: when `JSON.parse` fails on Claude's response, now tries regex extraction of `{…}` and strips trailing commas before returning 422

### Contributor management + pass-the-phone kiosk
- **"+ Add Guest"** button (owner only, active bills): sheet with manual name+phone entry, pending list, "Add to Bill"
  - Contacts API import hidden unless available (Android Chrome only — iOS doesn't support it, user is aware)
  - Guests without phone get synthetic `@uuid` phone (kiosk-only, no seamless login)
  - Guests with real phone: when they later open the bill link and log in, `ensureJoined()` matches by phone → seamless
- **"Claim for"** button on each guest row: activates that guest as claiming context; footer shows "[Name]'s Total"; "Done →" returns to owner's own context
- **"Pass Phone →"** button: opens fullscreen kiosk picker (grid of guest avatar cards); tap a name → claiming view for that person; "Done →" returns to picker for next person; "Exit" ends kiosk
- `toggleClaim`, `renderItems`, `renderMyTotal` all respect `kioskGuest` state

## Pending / Known issues

- **Contact Picker API not on iOS** — told user, no code fix possible (Apple hasn't implemented it); manual entry is the iOS path
- **Storage policies** — user ran INSERT/SELECT policies; if storage upload still fails, check Supabase Storage → Policies for the `receipts` bucket
- No unresolved bugs as of end of session

## Key file locations
- `setup.html` — bill creation, multi-photo upload
- `bill.html` — bill view, contributor management, kiosk mode
- `api/parse-receipt.js` — Claude Vision OCR
- `api/exchange-rate.js` — Frankfurter proxy
- `js/config.js` — Supabase credentials (real, committed)
- `js/utils.js` — shared helpers: fmt, fmtCurrency, getPersonShare, etc.
- `css/style.css` — all styles
- `supabase-schema.sql` — full schema + migration comments

## Supabase project
- URL: `https://fcscdimjhycxgstnzucd.supabase.co`
- Schema: `tab` (separate schema, all tables prefixed)
- Storage bucket: `receipts` (public)
