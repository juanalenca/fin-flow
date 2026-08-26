import assert from "node:assert/strict";
import { budgetFromIncome, calculateGoalStatus, calculateMonthlyBudget, splitEqually } from "./financial-engine.js";

assert.deepEqual(budgetFromIncome(500000), { needs: 250000, wants: 150000, savings: 100000 });
assert.deepEqual(splitEqually(100, ["needs", "wants", "savings"]), { needs: 34, wants: 33, savings: 33 });

const over = calculateMonthlyBudget({
  incomeCents: 500000,
  goals: { needs: 220000, wants: 140000 },
  entries: [{ budget_type: "needs", entry_kind: "expense", value_cents: 270000 }],
});
assert.equal(over.budgets.needs.deficit_cents, 20000);
assert.equal(over.budgets.needs.remaining_cents, -20000);
assert.equal(over.budgets.needs.savings_cents, 0);
assert.equal(over.budgets.savings.mandatory_cents, 100000);

const underGoal = calculateMonthlyBudget({
  incomeCents: 500000,
  goals: { needs: 220000 },
  entries: [{ budget_type: "needs", entry_kind: "expense", value_cents: 200000 }],
});
assert.equal(underGoal.budgets.needs.surplus_cents, 50000);
assert.equal(underGoal.budgets.needs.savings_cents, 20000);

const status = calculateGoalStatus({ target_cents: 100000, current_cents: 50000, start_date: "2026-01-01", due_date: "2026-12-31" }, new Date("2026-06-01"));
assert.equal(status.status, "adiantado");
console.log("financial-engine: cenários principais aprovados");
