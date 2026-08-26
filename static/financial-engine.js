/**
 * Regras puras do orçamento mensal FinFlow.
 * Valores monetários são sempre inteiros em centavos.
 */
export const BUDGET_KEYS = ["needs", "wants", "savings"];

export function monthKeyFromDate(date) {
  return String(date || new Date().toISOString().slice(0, 10)).slice(0, 7);
}

export function budgetFromIncome(incomeCents = 0) {
  const needs = Math.round(incomeCents * 0.5);
  const wants = Math.round(incomeCents * 0.3);
  return { needs, wants, savings: incomeCents - needs - wants };
}

export function splitEqually(cents, keys) {
  const result = Object.fromEntries(keys.map((key) => [key, 0]));
  const base = Math.floor(cents / keys.length);
  let remainder = cents - base * keys.length;
  keys.forEach((key) => {
    result[key] = base + (remainder-- > 0 ? 1 : 0);
  });
  return result;
}

export function calculateGoalStatus(goal, today = new Date()) {
  const target = Math.max(0, Number(goal.target_cents) || 0);
  const current = Math.max(0, Number(goal.current_cents) || 0);
  const progress = target ? (current / target) * 100 : 0;
  const remaining = Math.max(0, target - current);
  if (target > 0 && current >= target) return { progress, remaining, status: "atingido", requiredMonthly: 0 };

  const due = goal.due_date ? new Date(`${goal.due_date}T12:00:00`) : null;
  const started = goal.start_date ? new Date(`${goal.start_date}T12:00:00`) : today;
  if (!due || Number.isNaN(due.getTime())) return { progress, remaining, status: "sem_prazo", requiredMonthly: 0 };

  const totalDays = Math.max(1, due - started);
  const elapsed = Math.max(0, Math.min(totalDays, today - started));
  const expected = target * (elapsed / totalDays);
  const monthsLeft = Math.max(1, Math.ceil((due - today) / (30.44 * 24 * 60 * 60 * 1000)));
  const requiredMonthly = Math.ceil(remaining / monthsLeft);
  if (due < today) return { progress, remaining, status: "atrasado", requiredMonthly };
  if (current >= expected * 1.08) return { progress, remaining, status: "adiantado", requiredMonthly };
  if (current + 1 < expected * 0.92) return { progress, remaining, status: "abaixo_do_ritmo", requiredMonthly };
  return { progress, remaining, status: "no_ritmo", requiredMonthly };
}

export function calculateMonthlyBudget({
  incomeCents = 0,
  goals = {},
  entries = [],
  carry = {},
  allocation = {},
  compensationOutflows = {},
  investmentChangeCents = 0,
}) {
  const base = budgetFromIncome(incomeCents);
  const spent = { needs: 0, wants: 0, savings: 0 };
  entries.forEach((entry) => {
    if (BUDGET_KEYS.includes(entry.budget_type) && entry.entry_kind === "expense") {
      spent[entry.budget_type] += Number(entry.value_cents) || 0;
    }
  });

  const budgets = {};
  ["needs", "wants"].forEach((key) => {
    const ceiling = base[key] + (Number(carry[key]) || 0) + (Number(allocation[key]) || 0);
    const target = Math.min(Math.max(0, Number(goals[key]) || ceiling), ceiling);
    const realized = spent[key] + (Number(compensationOutflows[key]) || 0);
    budgets[key] = {
      mandatory_cents: base[key],
      ceiling_cents: ceiling,
      target_cents: target,
      spent_cents: spent[key],
      realized_cents: realized,
      remaining_cents: ceiling - realized,
      surplus_cents: Math.max(0, ceiling - realized),
      savings_cents: Math.max(0, target - realized),
      deficit_cents: Math.max(0, realized - ceiling),
      usage_percent: ceiling ? (realized / ceiling) * 100 : 0,
    };
  });

  const investmentAvailable = base.savings + (Number(investmentChangeCents) || 0) + (Number(allocation.savings) || 0);
  budgets.savings = {
    mandatory_cents: base.savings,
    ceiling_cents: investmentAvailable,
    target_cents: base.savings,
    spent_cents: spent.savings,
    realized_cents: spent.savings,
    remaining_cents: investmentAvailable - spent.savings,
    surplus_cents: Math.max(0, investmentAvailable - spent.savings),
    savings_cents: Math.max(0, base.savings - spent.savings),
    deficit_cents: 0,
    usage_percent: base.savings ? (spent.savings / base.savings) * 100 : 0,
    investment_change_cents: Math.max(0, investmentAvailable - spent.savings),
    carried_change_cents: Math.max(0, Number(investmentChangeCents) || 0),
  };

  return {
    base,
    budgets,
    totals: {
      spent_cents: spent.needs + spent.wants + spent.savings,
      available_cents: incomeCents - spent.needs - spent.wants - spent.savings,
      surplus_cents: budgets.needs.surplus_cents + budgets.wants.surplus_cents,
      deficit_cents: budgets.needs.deficit_cents + budgets.wants.deficit_cents,
    },
  };
}
