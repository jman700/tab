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
    if (e2) return { error: e2 };

    return { data: group };
  }

  async function getMyGroups(phone) {
    const { data, error } = await db
      .from('group_members')
      .select('group_id, groups(*)')
      .eq('phone', phone)
      .order('joined_at', { ascending: false });
    if (error) return { error };
    return { data: (data || []).map(r => r.groups).filter(Boolean) };
  }

  async function getGroup(id) {
    const { data, error } = await db
      .from('groups')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return { error };
    return { data };
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
    // expense: { description, amount, currency, paid_by, split_method, note }
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
      .order('created_at', { ascending: false });
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

  return {
    createGroup,
    getMyGroups,
    getGroup,
    getMembers,
    joinGroup,
    addExpense,
    getExpenses,
    deleteExpense,
  };
})();
