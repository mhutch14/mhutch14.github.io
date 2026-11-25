// Browser tests for the TimeSheet page (pages/timesheet.html). The clock is fixed to a
// plain week with no holidays (Wed 4 Mar 2026, 10:00) so results don't depend on today.
// Run: npm run test:browser
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openPage, hasSideScroll, PHONE } = require("./helpers");

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser?.close(); await server?.close(); });

const NOW = new Date(2026, 2, 4, 10, 0);      // Wednesday 10:00 local
const KEY = "timesheet.state.v1";
// fake settings: hire date, 11:00 lunch, 40 h PTO, this week (Sunday 3/1) with Mon and Tue worked
const SAVED = {
  v: 1, lastYear: 2026,
  user: { hire: "2020-04-01", lunch: 660, ptoBank: 40, planWTL: false, planDept: 930, autoStart: false },
  week: { sunday: "2026-03-01", days: [{}, { in: 420, out: 930 }, { in: 420, out: 990 }, {}, {}, {}, {}] }
};

async function tsPage(opts = {}, saved = SAVED) {
  const page = await openPage(browser, server.url, opts);
  await page.clock.setFixedTime(NOW);
  if (saved) await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [KEY, JSON.stringify(saved)]);
  await page.goto(server.url + "/pages/timesheet.html");
  await page.waitForSelector("#days .day");
  return page;
}
const text = (page, sel) => page.locator(sel).innerText();

test("first visit asks for setup; Use defaults closes it and the dashboard works", async () => {
  const page = await tsPage({}, null);
  await page.waitForSelector(".modal h2");
  assert.equal(await text(page, ".modal h2"), "Initial setup");
  assert.equal(await page.locator(".modal a[href*='gdeb']").count(), 0, "no internal company links");
  await page.click(".modal .btn.ghost");
  await page.waitForSelector(".modal", { state: "detached" });
  assert.equal(await page.locator("#days .day").count(), 7);
  assert.deepEqual(page.problems, []);
  await page.context().close();
});

test("week totals: Mon 8.0 + Tue 9.0 = 17.0, 7 behind the 24 h expected by end of Wednesday", async () => {
  const page = await tsPage();
  const paid = await page.locator("#days .pv").allInnerTexts();
  assert.deepEqual(paid.slice(1, 3), ["8.0", "9.0"]);
  assert.equal(await text(page, "#wkTotal"), "17.0");
  assert.equal(await text(page, "#wkRem"), "23.0");
  assert.equal(await text(page, "#wkAhead"), "-7.0");
  assert.equal(await page.locator("#days .day.today").count(), 1);
  await page.context().close();
});

test("clock in stamps today's In time, shows Running, and survives a reload", async () => {
  const page = await tsPage();
  await page.click("#runBtn");
  await page.waitForFunction(() => document.querySelector("#runPill").innerText === "Running");
  assert.equal(await page.inputValue("#inTime"), "10:00");
  assert.match(await text(page, "#runBtn"), /Stop/);
  await page.click("#runBtn");
  await page.reload(); await page.waitForSelector("#days .day");
  assert.equal(await page.inputValue("#inTime"), "10:00");
  assert.match(await text(page, "#runBtn"), /Resume/);
  await page.context().close();
});

test("editing a day's times updates its paid hours and the week", async () => {
  const page = await tsPage();
  const wed = page.locator("#days .day").nth(3);
  await wed.locator(".fin").fill("07:00");
  await wed.locator(".fout").fill("15:30");
  await wed.locator(".fout").dispatchEvent("change");
  await page.waitForFunction(() => document.querySelector("#wkTotal").innerText === "25.0");
  assert.equal(await wed.locator(".pv").innerText(), "8.0");
  await wed.locator(".fwtl").check();
  await page.waitForFunction(() => document.querySelector("#wkTotal").innerText === "25.5");
  await page.context().close();
});

test("tabs switch sections; holidays list the year's dates", async () => {
  const page = await tsPage();
  await page.click('#nav [data-tab="holidays"]');
  assert.ok(await page.locator("#tab-holidays").isVisible());
  assert.equal(await page.locator("#holTbl tbody tr").count(), 9);
  await page.click('#nav [data-tab="archive"]');
  assert.ok(await page.locator("#tab-archive").isVisible());
  await page.click('#nav [data-tab="dash"]');
  await page.locator("#days .day").nth(1).locator(".fwtl").check();   // any edit archives the week's days
  await page.click('#nav [data-tab="archive"]');
  assert.equal(await page.locator("#arcTbl tbody tr").count(), 2, "Mon and Tue archived");
  await page.context().close();
});

test("TimeSheet fits a phone in dark mode", async () => {
  const page = await tsPage({ viewport: PHONE, colorScheme: "dark" });
  assert.equal(await hasSideScroll(page), false);
  assert.deepEqual(page.problems, []);
  await page.context().close();
});

test("sync: signed in loads the saved sheet and uploads changes as page 'timesheet'", async () => {
  const remote = { ...SAVED, user: { ...SAVED.user, ptoBank: 72.5 } };
  const page = await tsPage({ fakeSupabase: { signedIn: true, remote } });
  await page.waitForFunction(() => document.querySelector("#ptoBank").value === "72.5");
  assert.match(await text(page, "#sync"), /Syncing as|Synced|Saved/);
  await page.fill("#ptoBank", "80"); await page.locator("#ptoBank").dispatchEvent("change");
  await page.waitForFunction(() => window.__upserts.some(u => u.page === "timesheet" && u.data.user.ptoBank === 80));
  await page.context().close();
});

const withSaved = patch => JSON.parse(JSON.stringify(Object.assign({}, SAVED, patch)));
const wtlBoxes = page => page.locator("#days .fwtl").evaluateAll(els => els.map(e => e.checked));

test("WTL all week: turns WTL on for every day, adds back lunch, and is remembered", async () => {
  const page = await tsPage();
  assert.equal(await page.isChecked("#wkWtl"), false);
  await page.check("#wkWtl");
  await page.waitForFunction(() => document.querySelector("#wkTotal").innerText === "18.0");
  assert.deepEqual(await wtlBoxes(page), [true, true, true, true, true, true, true]);
  await page.reload(); await page.waitForSelector("#days .day");
  assert.equal(await page.isChecked("#wkWtl"), true);
  await page.click('#nav [data-tab="settings"]');
  assert.equal(await page.isChecked("#sWtl"), true, "also the default for new weeks");
  await page.click('#nav [data-tab="dash"]');
  await page.uncheck("#wkWtl");
  await page.waitForFunction(() => document.querySelector("#wkTotal").innerText === "17.0");
  assert.deepEqual(await wtlBoxes(page), [false, false, false, false, false, false, false]);
  await page.context().close();
});

test("WTL all week unticks itself when one day is turned off", async () => {
  const page = await tsPage();
  await page.check("#wkWtl");
  await page.locator("#days .day").nth(2).locator(".fwtl").uncheck();
  await page.waitForFunction(() => !document.querySelector("#wkWtl").checked);
  await page.context().close();
});

test("with WTL as the default, a new week starts with WTL on every day", async () => {
  const page = await tsPage({}, withSaved({ user: { ...SAVED.user, wtlDefault: true }, week: { sunday: "2026-02-22", days: [{}, {}, {}, {}, {}, {}, {}] } }));
  await page.waitForFunction(() => document.querySelector("#weekTitle").innerText.startsWith("Week of 3/1"));
  assert.deepEqual(await wtlBoxes(page), [true, true, true, true, true, true, true]);
  await page.context().close();
});

test("new week: last week is shown, archived, and a short week can be covered with PTO", async () => {
  const lastWeek = { sunday: "2026-02-22", days: [{}, { in: 420, out: 930 }, { in: 420, out: 990 }, {}, {}, {}, {}] };
  const page = await tsPage({}, withSaved({ week: lastWeek }));
  await page.waitForSelector(".modal h2");
  assert.match(await text(page, ".modal h2"), /close out 2\/22–2\/28/);
  assert.match(await text(page, ".modal"), /17\.0/);
  await page.click(".modal .btn.pri");                     // "Use 23.0 h PTO"
  await page.waitForSelector(".modal", { state: "detached" });
  assert.equal(await page.inputValue("#ptoBank"), "17");
  assert.match(await text(page, "#weekTitle"), /Week of 3\/1/);
  assert.equal(await text(page, "#wkTotal"), "0.0");
  await page.click("#ptoHist");
  assert.match(await text(page, ".modal"), /Covered 23\.0 h short week of 2\/22/);
  await page.click(".modal .btn.pri");
  await page.click('#nav [data-tab="archive"]');
  assert.equal(await page.locator("#arcTbl tbody tr").count(), 2);
  await page.context().close();
});

test("new week: 'Not yet' keeps last week and shows a banner to close it out later", async () => {
  const lastWeek = { sunday: "2026-02-22", days: [{}, { in: 420, out: 930 }, {}, {}, {}, {}, {}] };
  const page = await tsPage({}, withSaved({ week: lastWeek }));
  await page.waitForSelector(".modal h2");
  await page.click(".modal .btn.ghost");
  await page.waitForSelector(".banner.warn");
  assert.match(await text(page, "#weekTitle"), /not closed out/);
  await page.click(".banner.warn .btn.pri");
  await page.waitForSelector(".modal h2");
  await page.click(".modal .mact .btn >> text=Don't use PTO");
  await page.waitForSelector(".modal", { state: "detached" });
  assert.equal(await page.inputValue("#ptoBank"), "40", "PTO untouched");
  assert.match(await text(page, "#weekTitle"), /Week of 3\/1/);
  await page.context().close();
});

test("PTO accrual: a passed accrual date shows a banner; Add puts it in the bank", async () => {
  const page = await tsPage({}, withSaved({ acc: { date: "2026-03-02", amt: 13, check: true, pending: null } }));
  await page.waitForSelector(".banner.info");
  assert.match(await text(page, ".banner.info"), /13 hours/);
  await page.click(".banner.info .btn.pri");
  await page.waitForSelector(".banner.info", { state: "detached" });
  assert.equal(await page.inputValue("#ptoBank"), "53");
  assert.equal(await text(page, "#nad"), "3/6", "next accrual date");
  await page.context().close();
});

test("Log a break: time away is taken off today's hours", async () => {
  const days = [{}, { in: 420, out: 930 }, { in: 420, out: 990 }, { in: 420, out: 600 }, {}, {}, {}];
  const page = await tsPage({}, withSaved({ week: { sunday: "2026-03-01", days } }));
  assert.equal(await text(page, "#todayHrs"), "3.0");
  await page.click("#breakBtn");
  await page.fill("#bk-out", "08:00");
  await page.check("#bk-at");
  await page.fill("#bk-in", "08:30");
  await page.locator("#bk-in").dispatchEvent("change");
  assert.match(await text(page, "#bk-prev"), /0\.5 h will be subtracted/);
  await page.click(".modal .btn.pri");
  await page.waitForSelector(".modal", { state: "detached" });
  assert.equal(await text(page, "#todayHrs"), "2.5");
  assert.equal(await page.locator("#days .day").nth(3).locator(".flost").inputValue(), "0.5");
  await page.context().close();
});

test("clock-out targets show for today once clocked in", async () => {
  const days = [{}, { in: 420, out: 930 }, { in: 420, out: 990 }, { in: 420, out: 600 }, {}, {}, {}];
  const page = await tsPage({}, withSaved({ week: { sunday: "2026-03-01", days } }));
  assert.equal(await text(page, "#fullOut"), "3:27 PM");
  assert.equal(await text(page, "#evenOut"), "2:27 PM");
  await page.context().close();
});

test("planner: Friday gets the rest of the weekly target, with leave times", async () => {
  const page = await tsPage();
  await page.click('#nav [data-tab="planner"]');
  await page.fill("#plTarget", "40"); await page.locator("#plTarget").dispatchEvent("change");
  for (let i = 0; i < 4; i++) {
    const row = page.locator("#plTbl tbody tr").nth(i);
    await row.locator(".psch").fill("9"); await row.locator(".psch").dispatchEvent("change");
  }
  assert.match(await text(page, "#plTbl tbody tr:nth-child(5) .frisch"), /^4\.0/);
  assert.equal(await text(page, "#plTbl tbody tr:nth-child(1) .lv"), "4:27 PM");
  assert.equal(await text(page, "#plTbl tbody tr:nth-child(5) .lv"), "10:57 AM");
  await page.context().close();
});

test("archive: paste rows from Excel to import them", async () => {
  const page = await tsPage();
  await page.click('#nav [data-tab="archive"]');
  await page.click("#arcImport");
  await page.fill("#im-t", "1/5/2026\t7:00 AM\t3:30 PM\t8\t30\n1/6/2026\t7:00 AM\t4:30 PM\t9\t30");
  assert.match(await text(page, "#im-s"), /2 rows recognised/);
  await page.click(".modal .btn.pri");
  await page.waitForSelector(".modal", { state: "detached" });
  assert.equal(await page.locator("#arcTbl tbody tr").count(), 2);
  assert.equal(await text(page, "#stDays"), "2");
  await page.context().close();
});

test("backup: export downloads the whole sheet, and restoring it brings it back", async () => {
  const page = await tsPage();
  await page.click('#nav [data-tab="settings"]');
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#bkExport")]);
  assert.match(dl.suggestedFilename(), /^timesheet-backup-2026-03-04\.json$/);
  const backup = JSON.parse(require("node:fs").readFileSync(await dl.path(), "utf8"));
  assert.equal(backup.user.ptoBank, 40);
  backup.user.ptoBank = 12.5;
  await page.setInputFiles("#bkFile", { name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForSelector(".modal h2");
  await page.click(".modal .btn.danger");
  await page.waitForSelector(".modal", { state: "detached" });
  assert.equal(await page.inputValue("#ptoBank"), "12.5");
  await page.setInputFiles("#bkFile", { name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await page.waitForSelector(".toast >> text=isn't a valid TimeSheet backup");
  assert.equal(await page.inputValue("#ptoBank"), "12.5", "a bad file changes nothing");
  await page.context().close();
});
