// ============================================================
// TAB — Groups
// Data access for groups, members, expenses, and splits.
// Depends on: global `db` (Supabase client, schema: tab)
// ============================================================

const Groups = (() => {

  async function createGroup(name, phone, displayName) {
    if (!name || typeof name !== 'string') return { error: new Error('Invalid group name') };
    if (!displayName || typeof displayName !== 'string') return { error: new Error('Invalid display name') };
    const { data: group, error: e1 } = await db
      .from('groups')
      .insert({ name: name.trim(), created_by: phone })
      .select()
      .single();
    if (e1) return { error: e1 };

    const { error: e2 } = await db
      .from('group_members')
      .insert({ group_id: group.id, phone, display_name: displayName });
    if (e2) {
      const { error: e3 } = await db.from('groups').delete().eq('id', group.id);
      if (e3) console.error('Rollback failed, orphaned group:', group.id, e3);
      return { error: e2 };
    }

    return { data: group };
  }

  async function getMyGroups(phone) {
    // Step 1: get the group IDs this user belongs to, in join order.
    const { data: rows, error: e1 } = await db
      .from('group_members')
      .select('group_id')
      .eq('phone', phone)
      .order('joined_at', { ascending: false });
    if (e1) return { error: e1 };
    if (!rows?.length) return { data: [] };

    // Step 2: fetch the actual group rows by ID.
    const ids = rows.map(r => r.group_id);
    const { data: groups, error: e2 } = await db
      .from('groups')
      .select('*')
      .in('id', ids);
    if (e2) return { error: e2 };

    // Restore join order (newest joined first).
    const orderMap = Object.fromEntries(ids.map((id, i) => [id, i]));
    return { data: (groups || []).sort((a, b) => (orderMap[a.id] ?? 999) - (orderMap[b.id] ?? 999)) };
  }

  async function getGroup(id) {
    // Try both access patterns; whichever succeeds first wins.
    const [directRes, joinRes] = await Promise.all([
      db.from('groups').select('*').eq('id', id).limit(1),
      db.from('group_members').select('groups(*)').eq('group_id', id).limit(1),
    ]);
    if (!directRes.error && directRes.data?.[0]) return { data: directRes.data[0] };
    if (!joinRes.error && joinRes.data?.[0]?.groups) return { data: joinRes.data[0].groups };
    const err = directRes.error || joinRes.error;
    console.error('getGroup failed — direct:', directRes.error, '| join:', joinRes.error, '| data:', directRes.data, joinRes.data);
    return { error: err || new Error('Group not found') };
  }

  async function getMembers(groupId) {
    const { data, error } = await db
      .from('group_members')
      .select('*')
      .eq('group_id', groupId)
      .order('joined_at');
    if (error) return { error };
    return { data: data || [] };
  }

  async function joinGroup(groupId, inviteToken, phone, displayName) {
    if (!inviteToken) return { error: new Error('Missing invite token') };
    const { data: group, error: e1 } = await db
      .from('groups')
      .select('id, invite_token')
      .eq('id', groupId)
      .eq('invite_token', inviteToken)
      .single();
    if (e1 || !group) return { error: e1 || new Error('Invalid invite link') };

    const { data: existing } = await db
      .from('group_members')
      .select('phone')
      .eq('group_id', groupId)
      .eq('phone', phone)
      .maybeSingle();
    if (existing) return { data: group, alreadyMember: true };

    const { error: e2 } = await db
      .from('group_members')
      .insert({ group_id: groupId, phone, display_name: displayName });
    if (e2) return { error: e2 };

    return { data: group };
  }

  async function addExpense(groupId, expense, splits) {
    // expense: { description, amount, currency, paid_by, split_method, note, expense_date }
    // splits: [{ phone, amount }]
    const { data: exp, error: e1 } = await db
      .from('expenses')
      .insert({ group_id: groupId, ...expense })
      .select()
      .single();
    if (e1) return { error: e1 };

    const splitRows = splits.map(s => ({
      expense_id: exp.id,
      phone: s.phone,
      amount: s.amount,
    }));
    const { error: e2 } = await db.from('expense_splits').insert(splitRows);
    if (e2) {
      const { error: e3 } = await db.from('expenses').delete().eq('id', exp.id);
      if (e3) console.error('Rollback failed, orphaned expense:', exp.id, e3);
      return { error: e2 };
    }
    return { data: exp };
  }

  async function getExpenses(groupId) {
    const { data: expenses, error: e1 } = await db
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .order('expense_date', { ascending: false, nullsFirst: false })
      .order('created_at',   { ascending: false });
    if (e1) return { error: e1 };
    if (!expenses || expenses.length === 0) return { data: [] };

    const expenseIds = expenses.map(e => e.id);
    const { data: splits, error: e2 } = await db
      .from('expense_splits')
      .select('*')
      .in('expense_id', expenseIds);
    if (e2) return { error: e2 };

    const byExpense = {};
    (splits || []).forEach(s => {
      if (!byExpense[s.expense_id]) byExpense[s.expense_id] = [];
      byExpense[s.expense_id].push(s);
    });

    return {
      data: expenses.map(e => ({ ...e, splits: byExpense[e.id] || [] })),
    };
  }

  async function deleteExpense(expenseId) {
    const { error } = await db.from('expenses').delete().eq('id', expenseId);
    if (error) return { error };
    return { data: true };
  }

  async function getBillsForGroup(groupId) {
    const { data: bills, error: e1 } = await db
      .from('bills')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });
    if (e1) return { error: e1 };
    if (!bills || bills.length === 0) return { data: [] };

    const billIds = bills.map(b => b.id);

    const [{ data: allClaims, error: e2 }, { data: allItems, error: e3 }, { data: allGuests, error: e4 }] =
      await Promise.all([
        db.from('claims').select('*').in('bill_id', billIds),
        db.from('items').select('*').in('bill_id', billIds),
        db.from('guests').select('*').in('bill_id', billIds),
      ]);
    if (e2 || e3 || e4) return { error: e2 || e3 || e4 };

    const claimsByBill = {};
    const itemsByBill  = {};
    const guestsByBill = {};
    (allClaims || []).forEach(c => { if (!claimsByBill[c.bill_id]) claimsByBill[c.bill_id] = []; claimsByBill[c.bill_id].push(c); });
    (allItems  || []).forEach(i => { if (!itemsByBill[i.bill_id])  itemsByBill[i.bill_id]  = []; itemsByBill[i.bill_id].push(i); });
    (allGuests || []).forEach(g => { if (!guestsByBill[g.bill_id]) guestsByBill[g.bill_id] = []; guestsByBill[g.bill_id].push(g); });

    return {
      data: bills.map(bill => {
        const claims = claimsByBill[bill.id] || [];
        const items  = itemsByBill[bill.id]  || [];
        const guests = guestsByBill[bill.id] || [];
        const memberShares = guests.map(g => ({
          phone:  g.phone,
          amount: getPersonShare(g.phone, claims, items, guests, bill),
        }));
        return { ...bill, paid_by_phone: bill.paid_by_phone || bill.created_by_phone, memberShares };
      }),
    };
  }

  async function addSettlement(groupId, settlement) {
    // settlement: { paid_by, paid_to, amount, currency, method, note }
    const { data, error } = await db
      .from('settlements')
      .insert({ group_id: groupId, ...settlement })
      .select()
      .single();
    if (error) return { error };
    return { data };
  }

  async function getSettlements(groupId) {
    const { data, error } = await db
      .from('settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('settled_at', { ascending: false });
    if (error) return { error };
    return { data: data || [] };
  }

  async function addMember(groupId, phone, displayName) {
    const { data, error } = await db
      .from('group_members')
      .upsert({ group_id: groupId, phone, display_name: displayName }, { onConflict: 'group_id,phone', ignoreDuplicates: true })
      .select()
      .maybeSingle();
    if (error) return { error };
    return { data };
  }

  async function closeGroup(groupId, reopen = false) {
    const { error } = await db
      .from('groups')
      .update({ closed_at: reopen ? null : new Date().toISOString() })
      .eq('id', groupId);
    if (error) return { error };
    return {};
  }

  async function deleteGroup(groupId) {
    // Delete child records first, then the group row.
    // Bills keep their data but lose the group link.
    const expRes = await db.from('expenses').select('id').eq('group_id', groupId);
    if (expRes.error) return { error: expRes.error };
    const expIds = (expRes.data || []).map(e => e.id);

    if (expIds.length > 0) {
      const { error: splitsErr } = await db.from('expense_splits').delete().in('expense_id', expIds);
      if (splitsErr) return { error: splitsErr };
    }
    const steps = [
      db.from('expenses').delete().eq('group_id', groupId),
      db.from('settlements').delete().eq('group_id', groupId),
      db.from('group_members').delete().eq('group_id', groupId),
    ];
    for (const step of steps) {
      const { error } = await step;
      if (error) return { error };
    }
    // Detach any bills that referenced this group
    await db.from('bills').update({ group_id: null }).eq('group_id', groupId);

    const { error } = await db.from('groups').delete().eq('id', groupId);
    if (error) return { error };
    return {};
  }

  async function assignBillToGroup(billId, groupId) {
    const { error } = await db.from('bills').update({ group_id: groupId || null }).eq('id', billId);
    if (error) return { error };
    return {};
  }

  return {
    createGroup,
    getMyGroups,
    getGroup,
    getMembers,
    joinGroup,
    addExpense,
    getExpenses,
    deleteExpense,
    getBillsForGroup,
    addSettlement,
    getSettlements,
    addMember,
    closeGroup,
    deleteGroup,
    assignBillToGroup,
  };
})();
