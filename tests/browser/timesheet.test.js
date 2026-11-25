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
