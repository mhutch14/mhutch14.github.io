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
