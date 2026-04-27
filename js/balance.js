// ============================================================
// TAB — Balance
// Computes per-member net balances from expenses + bills.
// Pure functions — no Supabase calls. Caller passes data.
// ============================================================

const Balance = (() => {

  // Build a map: { phone → { currency → netAmount } }
  // Positive = others owe this person. Negative = this person owes others.
  function computeRaw(expenses, bills, members) {
    // expenses: array of expense objects with .splits[] (from Groups.getExpenses)
    // bills: array of bill objects with .grand_total, .paid_by_phone, .currency,
    //        and .memberShares: [{ phone, amount }] (caller must compute these)
    // members: array of { phone, display_name }

    const net = {};
    members.forEach(m => { net[m.phone] = {}; });

    function addNet(phone, currency, amount) {
      if (!net[phone]) net[phone] = {};
      net[phone][currency] = (net[phone][currency] || 0) + amount;
    }

    // Expenses: payer is owed back (positive), split members owe (negative)
    for (const exp of expenses) {
      addNet(exp.paid_by, exp.currency, exp.amount);
      for (const split of (exp.splits || [])) {
        addNet(split.phone, exp.currency, -split.amount);
      }
    }

    // Bills: bill payer is owed back, each member's share is their debt
    for (const bill of bills) {
      if (!bill.paid_by_phone) continue;
      addNet(bill.paid_by_phone, bill.currency, bill.grand_total);
      for (const share of (bill.memberShares || [])) {
        addNet(share.phone, bill.currency, -share.amount);
      }
    }

    return net;
  }

  // Convert raw per-currency balances to a single USD net per member.
  // rates: { 'MXN': 0.055, 'EUR': 1.08, ... } — USD rate for each currency
  // Returns: [{ phone, display_name, usdNet, breakdown }]
  // breakdown: [{ currency, amount, usdAmount }]
  function toUSD(rawNet, members, rates) {
    return members.map(m => {
      const byPhone   = rawNet[m.phone] || {};
      let usdNet      = 0;
      const breakdown = [];

      for (const [currency, amount] of Object.entries(byPhone)) {
        if (Math.abs(amount) < 0.001) continue;
        const rate     = currency === 'USD' ? 1 : (rates[currency] || null);
        const usdAmount = rate !== null ? amount * rate : null;
        if (usdAmount !== null) usdNet += usdAmount;
        breakdown.push({ currency, amount, usdAmount, rateAvailable: rate !== null });
      }

      return { phone: m.phone, display_name: m.display_name, usdNet, breakdown };
    });
  }

  // Fetch all exchange rates needed for a set of currencies.
  // Returns: { 'MXN': 0.055, 'EUR': 1.08, ... }
  async function fetchRates(currencies) {
    const nonUSD = [...new Set(currencies.filter(c => c && c !== 'USD'))];
    const entries = await Promise.all(
      nonUSD.map(async c => {
        const rate = await getExchangeRate(c, 'USD');
        return [c, rate];
      })
    );
    return Object.fromEntries(entries.filter(([, r]) => r !== null));
  }

  return { computeRaw, toUSD, fetchRates };
})();
