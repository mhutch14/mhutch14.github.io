// Unit tests for pages/timesheet-core.js (TimeSheet logic, ported from the Excel/VBA workbook).
// Run: npm test
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../pages/timesheet-core.js");

const t = (h, m = 0) => h * 60 + m;   // minutes after midnight
const LUNCH = t(11);                  // lunch starts 11:00

test("hours: a 7:00-3:30 day with lunch is 8.0, and 8.5 when working through lunch", () => {
  assert.equal(C.calcHrs(t(7), t(15, 30), false, LUNCH), 8);
  assert.equal(C.calcHrs(t(7), t(15, 30), true, LUNCH), 8.5);
});

test("hours: lunch is only deducted for the part of the window you were there", () => {
  assert.equal(C.calcHrs(t(7), t(10), false, LUNCH), 3, "left before lunch");
  assert.equal(C.calcHrs(t(7), t(11, 15), false, LUNCH), 4, "left during lunch");
  assert.equal(C.calcHrs(t(7), t(11, 30), false, LUNCH), 4, "left right at the end of lunch");
  assert.equal(C.calcHrs(t(12), t(16), false, LUNCH), 4, "came in after lunch");
});

test("hours are counted in tenths (6-minute units)", () => {
  assert.equal(C.calcHrs(t(8), t(8, 6), true, LUNCH), 0.1);
  assert.equal(C.calcCIOHrs(t(10), t(11)), 1);
});

test("8-hour clock-out time and its display", () => {
  const out = C.calcMinTime(t(7), 8, false, LUNCH);
  assert.equal(C.fmt12(out), "3:27 PM");
  assert.equal(C.calcHrs(t(7), out, false, LUNCH), 8);
  assert.equal(C.calcMinTime(t(23), 8, false, LUNCH), null, "can't reach 8 h before midnight");
});

test("time helpers round-trip", () => {
  assert.equal(C.toMin("07:42"), t(7, 42));
  assert.equal(C.fromMin(t(16, 5)), "16:05");
  assert.equal(C.toMin(""), null);
  assert.equal(C.sundayOf("2026-11-25"), "2026-11-22");
});

test("PTO accrues on the Friday ending the first full week of the month", () => {
  assert.equal(C.calcAccDate("2026-11-25"), "2026-12-11");
  assert.equal(C.calcAccDate("2026-12-11"), "2026-12-11");
  assert.equal(C.calcAccDate("2026-12-12"), "2027-01-08");
});

test("PTO accrual amounts and cap follow years of service", () => {
  assert.equal(C.annualAccrual(0), 120);
  assert.equal(C.annualAccrual(6), 160);
  assert.equal(C.annualAccrual(25), 208);
  assert.equal(C.maxAccrual(160), 240);
  assert.equal(C.accAmt(12, 6), 14);
});

test("holiday dates move with the calendar", () => {
  const h = Object.fromEntries(C.holidaysFor(2026).map(x => [x.key, [x.start, x.end]]));
  assert.deepEqual(h.goodfriday, ["2026-04-03", "2026-04-03"]);
  assert.deepEqual(h.thanksgiving, ["2026-11-26", "2026-11-27"]);
  assert.deepEqual(h.memorial, ["2026-05-25", "2026-05-25"]);
  assert.equal(C.holidayOn("2028-11-10").name, "Veterans Day", "Saturday holiday observed Friday");
  const edited = C.holidaysFor(2026, { 2026: { july4: ["2026-07-03", "2026-07-03"] } }).find(x => x.key === "july4");
  assert.deepEqual([edited.start, edited.edited], ["2026-07-03", true]);
});

test("a holiday counts as 8 paid hours unless you worked it", () => {
  assert.deepEqual(C.dayPaid(C.blankDay(), { name: "x" }, LUNCH), { paid: 8, kind: "holiday" });
  const worked = { ...C.blankDay(), hw: true, in: t(7), out: t(10) };
  assert.equal(C.dayPaid(worked, { name: "x" }, LUNCH).paid, 3);
  assert.equal(C.dayPaid({ ...C.blankDay(), in: t(9), out: t(8) }, null, LUNCH).kind, "invalid");
});

test("breaks are taken off a day's hours", () => {
  const d = { ...C.blankDay(), in: t(7), out: t(15, 30), lost: 1.5 };
  assert.equal(C.dayPaid(d, null, LUNCH).paid, 6.5);
});

function goodFridayWeek(hoursPerDay) {
  const wk = { sunday: "2026-03-29", days: Array.from({ length: 7 }, () => C.blankDay()) }; // Good Friday = Fri 4/3
  for (const i of [1, 2, 3, 4]) wk.days[i] = { ...C.blankDay(), in: t(7), out: t(7) + hoursPerDay * 60 };
  return C.weekDays(wk, LUNCH, {});
}

test("floating a holiday: 44+ paid hours banks it and costs 48 minus hours of PTO", () => {
  const days = goodFridayWeek(10);   // 9.5 h x 4 + 8 holiday = 46
  assert.equal(C.weekTotal(days), 46);
  assert.deepEqual(C.floatCheck(days, {}), [{ key: "goodfriday", name: "Good Friday", year: 2026, lostPto: 2 }]);
  assert.deepEqual(C.floatCheck(days, { 2026: { goodfriday: true } }), [], "already banked");
  assert.deepEqual(C.floatCheck(goodFridayWeek(9), {}), [], "42 hours is not enough");
});

/* ---------- week state, WTL all week ---------- */

const week = (sunday, entries) => ({ sunday, days: entries.map(d => Object.assign(C.blankDay(), d)) });
// Sun 3/1/2026 week (no holidays): Mon 7:00-3:30 (8.0), Tue 7:00-4:30 (9.0), Wed 7:00-10:00 so far (3.0)
const MARCH = () => week("2026-03-01", [{}, { in: t(7), out: t(15, 30) }, { in: t(7), out: t(16, 30) }, { in: t(7), out: t(10) }, {}, {}, {}]);

test("new weeks start with WTL off, or on every day when that's the default", () => {
  assert.equal(C.newWeek("2026-03-01", false).days.some(d => d.wtl), false);
  const w = C.newWeek("2026-03-01", true);
  assert.equal(w.days.length, 7);
  assert.ok(C.allWtl(w));
  assert.equal(w.sunday, "2026-03-01");
});

test("WTL all week turns lunch deduction off for every day, and back on", () => {
  const w = MARCH();
  assert.equal(C.weekTotal(C.weekDays(w, LUNCH, {})), 20);
  C.setWeekWtl(w, true);
  assert.ok(C.allWtl(w));
  assert.equal(C.weekTotal(C.weekDays(w, LUNCH, {})), 21, "Mon and Tue each gain the half hour (Wed left before lunch)");
  C.setWeekWtl(w, false);
  assert.equal(C.allWtl(w), false);
  assert.equal(C.weekTotal(C.weekDays(w, LUNCH, {})), 20);
});

test("a saved state missing newer settings gets the defaults; unknown keys are kept", () => {
  const old = { user: { hire: "2020-04-01", ptoBank: 12 }, week: { sunday: "2026-03-01", days: [] }, extra: 1 };
  const m = C.mergeState(C.defaultState(), old);
  assert.equal(m.user.hire, "2020-04-01");
  assert.equal(m.user.ptoBank, 12);
  assert.equal(m.user.lunch, 660, "default lunch filled in");
  assert.equal(m.user.wtlDefault, false, "new WTL default filled in");
  assert.deepEqual(m.planner.sched, [8, 8, 8, 8]);
  assert.equal(m.extra, 1);
  assert.deepEqual(m.week.days, [], "arrays come from the saved state");
});

/* ---------- archive ---------- */

test("archive rows: one per worked day, holidays you didn't work are skipped", () => {
  const rows = C.archiveEntries(MARCH(), LUNCH, {}, 40);
  assert.deepEqual(rows.map(r => [r.date, r.hrs, r.pto]), [["2026-03-02", 8, 40], ["2026-03-03", 9, 40], ["2026-03-04", 3, 40]]);
  const gf = week("2026-03-29", [{}, { in: t(7), out: t(15, 30) }, {}, {}, {}, {}, {}]);   // Good Friday 4/3 not worked
  assert.deepEqual(C.archiveEntries(gf, LUNCH, {}, null).map(r => r.date), ["2026-03-30"]);
  gf.days[5] = Object.assign(C.blankDay(), { hw: true, in: t(7), out: t(10) });             // ...now worked
  assert.deepEqual(C.archiveEntries(gf, LUNCH, {}, null).map(r => [r.date, r.hrs]), [["2026-03-30", 8], ["2026-04-03", 3]]);
});

test("archive upsert keeps dates sorted and replaces a date that's already there", () => {
  const a = [];
  C.upsertArchive(a, { date: "2026-03-03", hrs: 9 });
  C.upsertArchive(a, { date: "2026-03-01", hrs: 1 });
  C.upsertArchive(a, { date: "2026-03-02", hrs: 8 });
  C.upsertArchive(a, { date: "2026-03-02", hrs: 7.5 });
  assert.deepEqual(a.map(e => [e.date, e.hrs]), [["2026-03-01", 1], ["2026-03-02", 7.5], ["2026-03-03", 9]]);
});

/* ---------- closing out a week ---------- */

test("closing a short week: shows the gap, and can cover it with PTO", () => {
  const c = C.closeout(MARCH(), LUNCH, {}, {});
  assert.deepEqual([c.total, c.short, c.floats], [20, 20, []]);
  const used = C.applyCloseout(c, 40, true, "2026-03-01");
  assert.equal(used.bank, 20);
  assert.deepEqual(used.log, [{ type: "use", hrs: -20, bank: 20, note: "Covered 20.0 h short week of 3/1" }]);
  assert.deepEqual(C.applyCloseout(c, 40, false, "2026-03-01"), { bank: 40, log: [], bankKeys: [] }, "declined PTO");
  assert.equal(C.applyCloseout(c, null, true, "2026-03-01").bank, null, "PTO not tracked");
});

test("closing a full week uses no PTO", () => {
  const full = week("2026-03-01", [{}, ...[1, 2, 3, 4, 5].map(() => ({ in: t(7), out: t(15, 30) })), {}]);
  const c = C.closeout(full, LUNCH, {}, {});
  assert.deepEqual([c.total, c.short], [40, 0]);
  assert.deepEqual(C.applyCloseout(c, 40, true, "2026-03-01").log, []);
});

test("closing a 46-hour Good Friday week banks the holiday and deducts 2 h PTO", () => {
  const gf = week("2026-03-29", [{}, ...[1, 2, 3, 4].map(() => ({ in: t(7), out: t(17) })), {}, {}]);
  const c = C.closeout(gf, LUNCH, {}, {});
  assert.equal(c.total, 46);
  const r = C.applyCloseout(c, 40, true, "2026-03-29");
  assert.equal(r.bank, 38);
  assert.deepEqual(r.bankKeys, [{ year: 2026, key: "goodfriday" }]);
  assert.deepEqual(r.log, [{ type: "float", hrs: -2, bank: 38, note: "Floated Good Friday" }]);
});

/* ---------- PTO accrual flow ---------- */

const HIRE = "2020-04-01";   // 6 years of service in 2026

test("accrual: sets the next date and amount; nothing pending before the date", () => {
  const a = C.accrualCheck({ date: null, amt: 0, check: true, pending: null }, HIRE, 40, "2026-12-01");
  assert.deepEqual(a, { date: "2026-12-11", amt: 14, check: true, pending: null });
});

test("accrual: on the date it becomes pending once, and not again after it's handled", () => {
  const before = { date: "2026-12-11", amt: 14, check: true, pending: null };
  const due = C.accrualCheck(before, HIRE, 40, "2026-12-11");
  assert.deepEqual(due.pending, { date: "2026-12-11", amt: 14 });
  assert.deepEqual(before.pending, null, "input not changed");
  const handled = Object.assign({}, due, { pending: null, check: false });   // added or dismissed
  assert.equal(C.accrualCheck(handled, HIRE, 40, "2026-12-11").pending, null);
  const moved = C.accrualCheck(handled, HIRE, 40, "2026-12-14");
  assert.equal(moved.date, "2027-01-08", "moves on to next month's date");
  const nextCheck = C.accrualCheck(moved, HIRE, 40, "2026-12-14");   // the page checks every 30 s
  assert.equal(nextCheck.check, true, "re-armed for the next accrual");
  assert.equal(nextCheck.pending, null);
  assert.deepEqual(C.accrualCheck(nextCheck, HIRE, 40, "2027-01-08").pending, { date: "2027-01-08", amt: 13 });
});

test("accrual: nothing happens without a hire date, or pending without a PTO bank", () => {
  const a = { date: "2026-12-11", amt: 14, check: true, pending: null };
  assert.equal(C.accrualCheck(a, null, 40, "2026-12-11"), a);
  assert.equal(C.accrualCheck(a, HIRE, null, "2026-12-11").pending, null);
});

test("adding an accrual is capped at 1.5x the annual amount", () => {
  assert.deepEqual(C.applyAccrual(40, 14, HIRE, "2026-12-11"), { bank: 54, added: 14, capped: false, max: 240 });
  assert.deepEqual(C.applyAccrual(235, 14, HIRE, "2026-12-11"), { bank: 240, added: 5, capped: true, max: 240 });
});

/* ---------- clock-out targets ---------- */

test("targets: 8-hour, even (on pace) and planned clock-out for today", () => {
  const days = C.weekDays(MARCH(), LUNCH, {});
  const ahead = C.r1(C.weekTotal(days) - 3 * 8);           // Wednesday: 20 of 24 expected
  assert.equal(ahead, -4);
  const T = C.targets(days[3], ahead, t(10), t(15, 30), false, LUNCH);
  assert.equal(C.fmt12(T.full), "3:27 PM");
  assert.equal(T.fullH, 8);
  assert.equal(T.need, 7, "7 h today to be back on pace");
  assert.equal(T.evenState, "time");
  assert.equal(C.fmt12(T.even), "2:27 PM");
  assert.equal(T.planH, 8);
  assert.ok(Math.abs(T.prog - 180 / 510) < 1e-9, "progress toward the planned time");
});

test("targets: when you're already ahead, Even says so", () => {
  const w = week("2026-03-01", [{}, { in: t(6), out: t(17) }, { in: t(6), out: t(17) }, { in: t(7), out: t(10) }, {}, {}, {}]);
  const days = C.weekDays(w, LUNCH, {});
  const ahead = C.r1(C.weekTotal(days) - 24);
  const T = C.targets(days[3], ahead, t(10), null, false, LUNCH);
  assert.equal(T.evenState, "ahead");
  assert.equal(T.even, null);
  assert.equal(T.planH, null);
  assert.equal(C.targets(days[4], ahead, t(10), null, false, LUNCH), null, "no targets before clocking in");
});

test("targets use today's WTL: no lunch means leaving 30 minutes earlier", () => {
  const w = MARCH(); w.days[3].wtl = true;
  const days = C.weekDays(w, LUNCH, {});
  assert.equal(C.fmt12(C.targets(days[3], 0, t(10), null, true, LUNCH).full), "2:57 PM");
});

/* ---------- planner ---------- */

test("planner: Friday gets what's left of the target, with leave times", () => {
  const P = C.plan({ sched: [9, 9, 9, 9], coming: [t(7), t(7), t(7), t(7), t(7)], target: 40, wtl: false }, LUNCH);
  assert.deepEqual([P.sum4, P.fri], [36, 4]);
  assert.deepEqual(P.leave.map(C.fmt12), ["4:27 PM", "4:27 PM", "4:27 PM", "4:27 PM", "10:57 AM"]);
  const none = C.plan({ sched: [10, 10, 10, 10], coming: [t(7), null, t(7), t(7), t(7)], target: 40, wtl: true }, LUNCH);
  assert.equal(none.fri, 0);
  assert.equal(none.leave[1], null, "no arrival time");
  assert.equal(none.leave[4], null, "nothing left for Friday");
  assert.equal(C.fmt12(none.leave[0]), "4:57 PM", "WTL: 10 h straight (rounded to the tenth, like 3:27 for an 8-hour day)");
});

/* ---------- import ---------- */

test("import: pasted Excel rows and CSV, in many time and date formats", () => {
  const rows = C.parseImport("8/15/2022\t7:42 AM\t4:20 PM\t8.6\t19.2\n2022-08-16,0.3125,0.6875,8,20\nDate,In,Out\n\n45000\t7:00\t15:30");
  assert.deepEqual(rows, [
    { date: "2022-08-15", in: t(7, 42), out: t(16, 20), hrs: 8.6, pto: 19.2 },
    { date: "2022-08-16", in: t(7, 30), out: t(16, 30), hrs: 8, pto: 20 },
    { date: "2023-03-15", in: t(7), out: t(15, 30), hrs: null, pto: null }
  ], "header and blank lines skipped; Excel serial date and day fractions understood");
  assert.equal(C.parseTimeLoose("12:15 am"), t(0, 15));
  assert.equal(C.parseTimeLoose("12:15 PM"), t(12, 15));
  assert.equal(C.parseTimeLoose("16:05:30"), t(16, 5));
  assert.equal(C.parseTimeLoose("soon"), null);
  assert.equal(C.parseDateLoose("3/4/26"), "2026-03-04");
  assert.equal(C.parseDateLoose("not a date"), null);
});
