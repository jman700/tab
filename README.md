# Tab — Split bills beautifully

A clean, real-time bill splitter. Upload a receipt, share a link, everyone claims their items.

---

## Stack
- **Frontend**: Vanilla HTML / CSS / JS (no framework)
- **Database + Realtime**: Supabase
- **Hosting**: Vercel
- **OCR**: Claude Vision API (via Vercel serverless function)

---

## Setup

### 1. Supabase
1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** and run the contents of `supabase-schema.sql`
3. In **Database → Replication**, enable realtime for: `bills`, `guests`, `claims`
4. Copy your **Project URL** and **anon public key** from **Project Settings → API**

### 2. Configure credentials
Open `js/config.js` and replace the placeholder values:
```js
const SUPABASE_URL      = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';
```

### 3. Anthropic API Key
In Vercel (step 4 below), add an environment variable:
```
ANTHROPIC_API_KEY = sk-ant-...
```

### 4. Deploy to Vercel
1. Push this repo to GitHub
2. Go to https://vercel.com → New Project → import your repo
3. Add environment variable: `ANTHROPIC_API_KEY`
4. Deploy — Vercel auto-detects the `api/` folder as serverless functions

---

## How it works

| Page | Route | Purpose |
|------|-------|---------|
| `index.html` | `/` | Login with name + phone |
| `dashboard.html` | `/dashboard.html` | Your active + closed bills |
| `setup.html` | `/setup` or `/setup/:id` | Create / edit a bill |
| `bill.html` | `/bill/:id` | Claim items, view summary |

### User flow
1. Visit the site → enter name + phone number (no password, no SMS)
2. Create a new bill → upload receipt photo → Claude parses items
3. Review/edit items, set tip → publish bill
4. Share the `/bill/:id` link with your group
5. Everyone opens the link, claims their items in real time
6. Owner closes the bill when everyone is settled

### Device recognition
A random fingerprint is stored in `localStorage` on first visit. Returning to the site on the same device auto-fills the user session. On a new device, users re-enter their phone number to access their bills.

---

## Project structure
```
tab/
├── index.html          # Login
├── dashboard.html      # Bills dashboard
├── setup.html          # Create / edit bill
├── bill.html           # Split bill page
├── css/
│   └── style.css       # Full design system
├── js/
│   ├── config.js       # Supabase credentials (edit this)
│   ├── auth.js         # User session management
│   └── utils.js        # Shared utilities
├── api/
│   └── parse-receipt.js  # Vercel serverless: Claude OCR
├── supabase-schema.sql   # Run once in Supabase SQL editor
├── vercel.json           # URL routing rules
└── package.json          # Anthropic SDK dependency
```

---

## Notes
- Bill links are UUIDs — unguessable by default
- Owner-only controls (remove guests, close bill, mark paid) enforced at app layer
- Row-level security in Supabase uses permissive policies for MVP; can be tightened with Supabase Auth phone OTP in a future version
- All currency is rendered in the currency symbol of the prices as imported — no conversion
