// Unit tests for pages/budget-core.js (the budget page's logic).
// Run: npm test   (uses Node's built-in test runner, no install needed)
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../pages/budget-core.js");

let n = 0;
const seqId = () => `id${++n}`;

test("num parses money-like input and falls back to 0", () => {
  assert.equal(B.num("1,234.50"), 1234.5);
  assert.equal(B.num("$ 86.40"), 86.4);
  assert.equal(B.num(42), 42);
  assert.equal(B.num("-12"), -12);
  assert.equal(B.num(""), 0);
  assert.equal(B.num("abc"), 0);
  assert.equal(B.num(null), 0);
  assert.equal(B.num(undefined), 0);
  assert.equal(B.num(Infinity), 0);
});

test("money shows cents only when needed and uses a real minus sign", () => {
  assert.equal(B.money(1450), "$1,450");
  assert.equal(B.money(86.4), "$86.40");
  assert.equal(B.money(2417.68), "$2,417.68");
  assert.equal(B.money(0), "$0");
  assert.equal(B.money(-866.04), "−$866.04");
  assert.equal(B.money(0.1 + 0.2), "$0.30");      // floating point noise is rounded away
  assert.equal(B.money(1999.999), "$2,000");
});

test("esc makes text safe for HTML", () => {
  assert.equal(B.esc(`<b>"Tom" & Jerry</b>`), "&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;");
  assert.equal(B.esc(5), "5");
});

test("monthKey and daysInMonth", () => {
  assert.equal(B.monthKey(2026, 10), "2026-11");
  assert.equal(B.monthKey(2026, 0), "2026-01");
  assert.equal(B.daysInMonth(2026, 1), 28);
  assert.equal(B.daysInMonth(2028, 1), 29);   // leap year
  assert.equal(B.daysInMonth(2026, 10), 30);
});

test("billStatus: paid, late, due today, due soon, later", () => {
  const today = new Date(2026, 10, 25, 15, 30);   // Nov 25 2026, mid-afternoon
  const bill = day => ({ id: "x", name: "Bill", amount: 10, day });
  assert.deepEqual(B.billStatus(bill(2), true, 2026, 10, today), ["paid", "Paid"]);
  assert.deepEqual(B.billStatus(bill(24), false, 2026, 10, today), ["late", "1 day late"]);
  assert.deepEqual(B.billStatus(bill(2), false, 2026, 10, today), ["late", "23 days late"]);
  assert.deepEqual(B.billStatus(bill(25), false, 2026, 10, today), ["soon", "Due today"]);
  assert.deepEqual(B.billStatus(bill(26), false, 2026, 10, today), ["soon", "Due in 1 day"]);
  assert.deepEqual(B.billStatus(bill(5), false, 2026, 11, today), ["later", "Due Dec 5"]);
  // next month, within a week
  assert.deepEqual(B.billStatus(bill(1), false, 2026, 11, today), ["soon", "Due in 6 days"]);
});

test("billStatus clamps a day past the end of the month to the last day", () => {
  const today = new Date(2026, 1, 1);
  assert.deepEqual(B.billStatus({ day: 31 }, false, 2026, 1, today), ["later", "Due Feb 28"]);
  assert.deepEqual(B.billStatus({ day: 0 }, false, 2026, 1, today), ["soon", "Due today"]);
});

test("sortedBills orders by due day without changing the original", () => {
  const bills = [{ id: "a", day: 15 }, { id: "b", day: 1 }, { id: "c", day: 5 }];
  assert.deepEqual(B.sortedBills(bills).map(b => b.id), ["b", "c", "a"]);
  assert.deepEqual(bills.map(b => b.id), ["a", "b", "c"]);
});

test("summarize totals bills, spending, pay and what's left", () => {
  const state = {
    income: 5000,
    bills: [{ id: "rent", amount: 1500, day: 1 }, { id: "net", amount: 70, day: 15 }],
    cats: [{ id: "g", planned: 400 }, { id: "e", planned: 200 }],
  };
  const mo = { paid: { rent: true }, spent: { g: 120.25, e: 250 } };
  assert.deepEqual(B.summarize(state, mo), {
    billTotal: 1570, paidTotal: 1500, paidCount: 1, billCount: 2,
    spent: 370.25, planned: 600, income: 5000,
    left: 3059.75, leftToSpend: 229.75,
  });
});

test("summarize uses a month's own pay when set, and handles an empty month", () => {
  const state = { income: 5000, bills: [], cats: [{ id: "g", planned: 100 }] };
  assert.equal(B.summarize(state, { income: 5200, paid: {}, spent: {} }).income, 5200);
  const empty = B.summarize(state, undefined);
  assert.equal(empty.spent, 0);
  assert.equal(empty.left, 5000);
  assert.equal(empty.leftToSpend, 100);
});

test("summarize never reports negative money left to spend, but left over can go negative", () => {
  const state = { income: 100, bills: [{ id: "b", amount: 80 }], cats: [{ id: "g", planned: 10 }] };
  const s = B.summarize(state, { paid: {}, spent: { g: 50 } });
  assert.equal(s.leftToSpend, 0);
  assert.equal(s.left, -30);
});

test("percentUsed caps at 100 and handles a zero plan", () => {
  assert.equal(B.percentUsed(50, 200), 25);
  assert.equal(B.percentUsed(500, 200), 100);
  assert.equal(B.percentUsed(0, 0), 0);
  assert.equal(B.percentUsed(10, 0), 100);
});

test("addSpend adds to a category and ignores empty amounts", () => {
  const mo = { paid: {}, spent: {} };
  assert.equal(B.addSpend(mo, "g", "25.50"), 25.5);
  assert.equal(B.addSpend(mo, "g", 0.1), 25.6);
  assert.equal(B.addSpend(mo, "g", 0.2), 25.8);       // no floating point drift
  assert.equal(B.addSpend(mo, "g", ""), 25.8);
  assert.equal(B.addSpend(mo, "", 10), 0);
  assert.deepEqual(mo.spent, { g: 25.8 });
  const fresh = {};
  B.addSpend(fresh, "x", 5);
  assert.deepEqual(fresh.spent, { x: 5 });
});

test("cleanImport accepts a valid file and normalizes it", () => {
  const d = B.cleanImport({
    income: "3,900",
    bills: [{ id: "rent", name: "Rent", amount: "1500", day: 1 }, { name: "No id", amount: 5, day: 45 }],
    cats: [{ id: "g", name: "Groceries", planned: 450 }, {}],
    months: { "2026-10": { income: 3800, spent: { g: "432.17" }, paid: { rent: true, other: false } }, "bad key": { spent: { g: 1 } }, "2026-09": null },
    extra: "ignored",
  }, seqId);
  assert.equal(d.income, 3900);
  assert.deepEqual(d.bills[0], { id: "rent", name: "Rent", amount: 1500, day: 1 });
  assert.equal(d.bills[1].day, 31);                 // clamped
  assert.match(d.bills[1].id, /^id\d+$/);           // new id given
  assert.deepEqual(d.cats[1], { id: d.cats[1].id, name: "Category", planned: 0 });
  assert.deepEqual(Object.keys(d.months), ["2026-10"]);
  assert.deepEqual(d.months["2026-10"], { spent: { g: 432.17 }, paid: { rent: true }, income: 3800 });
  assert.equal("extra" in d, false);
});

test("cleanImport trims very long names", () => {
  const d = B.cleanImport({ bills: [{ name: "x".repeat(200) }], cats: [] }, seqId);
  assert.equal(d.bills[0].name.length, 60);
});

test("cleanImport rejects files that aren't budgets", () => {
  assert.throws(() => B.cleanImport(null), /isn't a budget file/);
  assert.throws(() => B.cleanImport([1, 2]), /isn't a budget file/);
  assert.throws(() => B.cleanImport("text"), /isn't a budget file/);
  assert.throws(() => B.cleanImport({ bills: [] }), /list of bills and a list of categories/);
  assert.throws(() => B.cleanImport({ cats: [] }), /list of bills and a list of categories/);
});

test("exampleBudget is clearly marked as example data", () => {
  const ex = B.exampleBudget(seqId);
  assert.equal(ex.example, true);
  assert.equal(ex.bills.length, 7);
  assert.equal(ex.cats.length, 4);
  assert.deepEqual(ex.months, {});
  assert.equal(new Set([...ex.bills, ...ex.cats].map(x => x.id)).size, 11);   // unique ids
});

test("newId returns short unique-looking ids", () => {
  const ids = new Set(Array.from({ length: 200 }, () => B.newId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[a-z0-9]{1,7}$/);
});
