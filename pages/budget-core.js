/*
 * budget-core.js: the budget page's logic with no DOM access, so it can be unit-tested.
 *
 * Used by pages/budget.html (as window.BudgetCore) and by tests/unit/budget-core.test.js
 * (as a CommonJS module). Every function here is pure except addSpend, which updates
 * the month object it's given.
 *
 * Budget data shape (what's saved to localStorage and Supabase):
 *   {
 *     example?: true,                        // still showing the starter data
 *     income: 4200,                          // default monthly take-home pay
 *     bills:  [{ id, name, amount, day }],   // recurring bills; day = due day of month (1-31)
 *     cats:   [{ id, name, planned }],       // spending categories with a monthly plan
 *     months: { "2026-11": {                 // one entry per month that has activity
 *       income?: 4300,                       // overrides the default pay for this month
 *       paid:  { [billId]: true },
 *       spent: { [catId]: 123.45 } } }
 *   }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BudgetCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Parse user input like "$1,234.50" into a number; anything unreadable becomes 0. */
  function num(v) {
    const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  /** Format dollars: whole amounts without cents ("$1,450"), others with two decimals ("$86.40"). Negative uses a real minus sign. */
  function money(n) {
    const r = Math.round(num(n) * 100) / 100;
    const abs = Math.abs(r);
    const cents = Math.round(abs * 100) % 100 !== 0;
    return (r < 0 ? "−$" : "$") + abs.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  }

  /** Escape text for safe use inside HTML. */
  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /** "2026-11" for year 2026, month index 10 (JavaScript months start at 0). */
  function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, "0")}`; }

  /** Number of days in a month (month index starts at 0). */
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  /**
   * Status pill for a bill in the month being viewed.
   * Returns [cssClass, label]: "paid", "late" (past due), "soon" (today or within 7 days), "later".
   * A due day past the end of a short month (e.g. 31 in February) counts as the last day.
   */
  function billStatus(bill, paid, y, m, today) {
    if (paid) return ["paid", "Paid"];
    const day = Math.min(Math.max(1, Math.round(num(bill.day)) || 1), daysInMonth(y, m));
    const due = new Date(y, m, day);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = Math.round((due - t) / 864e5);
    if (diff < 0) return ["late", diff === -1 ? "1 day late" : `${-diff} days late`];
    if (diff === 0) return ["soon", "Due today"];
    if (diff <= 7) return ["soon", `Due in ${diff} day${diff > 1 ? "s" : ""}`];
    return ["later", `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`];
  }

  /** Bills sorted by due day (stable for equal days). */
  function sortedBills(bills) {
    return [...bills].sort((a, b) => num(a.day) - num(b.day));
  }

  /** All the totals shown on the page for one month. */
  function summarize(state, mo) {
    mo = mo || { paid: {}, spent: {} };
    const paid = mo.paid || {}, spentBy = mo.spent || {};
    const billTotal = state.bills.reduce((s, b) => s + num(b.amount), 0);
    const paidBills = state.bills.filter(b => paid[b.id]);
    const paidTotal = paidBills.reduce((s, b) => s + num(b.amount), 0);
    const spent = state.cats.reduce((s, c) => s + num(spentBy[c.id] || 0), 0);
    const planned = state.cats.reduce((s, c) => s + num(c.planned), 0);
    const income = num(mo.income ?? state.income);
    const r = x => Math.round(x * 100) / 100;
    return {
      billTotal: r(billTotal), paidTotal: r(paidTotal), paidCount: paidBills.length, billCount: state.bills.length,
      spent: r(spent), planned: r(planned), income: r(income),
      left: r(income - billTotal - spent),
      leftToSpend: r(Math.max(planned - spent, 0)),
    };
  }

  /** Progress-bar fill (0-100) for a category. */
  function percentUsed(spent, planned) {
    spent = num(spent); planned = num(planned);
    if (planned <= 0) return spent > 0 ? 100 : 0;
    return Math.min(100, (spent / planned) * 100);
  }

  /** Add a purchase to a category for one month; returns the new total. Ignores zero/invalid amounts. */
  function addSpend(mo, catId, amount) {
    const v = num(amount);
    mo.spent = mo.spent || {};
    if (!v || !catId) return num(mo.spent[catId] || 0);
    mo.spent[catId] = Math.round((num(mo.spent[catId] || 0) + v) * 100) / 100;
    return mo.spent[catId];
  }

  /**
   * Validate and clean an imported budget file. Throws an Error with a readable message
   * if it isn't a budget. Unknown fields are dropped, names are trimmed to 60 characters,
   * due days are clamped to 1-31, and months must look like "YYYY-MM".
   */
  function cleanImport(d, uid) {
    uid = uid || newId;
    if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("That isn't a budget file.");
    if (!Array.isArray(d.bills) || !Array.isArray(d.cats)) throw new Error("The file needs a list of bills and a list of categories.");
    const bills = d.bills.map(b => ({
      id: String((b && b.id) || uid()), name: String((b && b.name) || "Bill").slice(0, 60),
      amount: num(b && b.amount), day: Math.max(1, Math.min(31, Math.round(num(b && b.day)) || 1)),
    }));
    const cats = d.cats.map(c => ({ id: String((c && c.id) || uid()), name: String((c && c.name) || "Category").slice(0, 60), planned: num(c && c.planned) }));
    const months = {};
    for (const [k, m] of Object.entries(d.months || {})) {
      if (!/^\d{4}-\d{2}$/.test(k) || !m || typeof m !== "object") continue;
      const spent = {}, paid = {};
      for (const [id, v] of Object.entries(m.spent || {})) spent[id] = num(v);
      for (const [id, v] of Object.entries(m.paid || {})) if (v) paid[id] = true;
      months[k] = { spent, paid };
      if (m.income != null) months[k].income = num(m.income);
    }
    return { income: num(d.income), bills, cats, months };
  }

  /** Short random id for new bills and categories. */
  function newId() { return Math.random().toString(36).slice(2, 9); }

  /** Starter data shown until the user edits or imports their own. Clearly example figures. */
  function exampleBudget(uid) {
    uid = uid || newId;
    return {
      example: true,
      income: 4200,
      bills: [
        { id: uid(), name: "Rent", amount: 1450, day: 1 },
        { id: uid(), name: "Car payment", amount: 320, day: 5 },
        { id: uid(), name: "Car insurance", amount: 115, day: 12 },
        { id: uid(), name: "Electric", amount: 90, day: 18 },
        { id: uid(), name: "Internet", amount: 65, day: 20 },
        { id: uid(), name: "Phone", amount: 55, day: 22 },
        { id: uid(), name: "Streaming", amount: 28, day: 26 },
      ],
      cats: [
        { id: uid(), name: "Groceries", planned: 400 },
        { id: uid(), name: "Gas", planned: 160 },
        { id: uid(), name: "Eating out", planned: 200 },
        { id: uid(), name: "Fun & misc", planned: 150 },
      ],
      months: {},
    };
  }

  return { num, money, esc, monthKey, daysInMonth, billStatus, sortedBills, summarize, percentUsed, addSpend, cleanImport, newId, exampleBudget };
});
