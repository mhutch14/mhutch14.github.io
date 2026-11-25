// Browser tests for the budget page (pages/budget.html). Run: npm run test:browser
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { startServer, launch, openPage, hasSideScroll, PHONE } = require("./helpers");

const SAMPLE = path.join(__dirname, "fixtures", "budget-sample.json");
let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser?.close(); await server?.close(); });

async function budgetPage(opts) {
  const page = await openPage(browser, server.url, opts);
  await page.goto(server.url + "/pages/budget.html");
  await page.waitForSelector("#bills .bill");
  return page;
}
async function importSample(page) {
  await page.click("#ioBtn");
  await page.setInputFiles("#ioFile", SAMPLE);
  await page.waitForFunction(() => document.getElementById("ioText").value.length > 0);
  await page.click("#ioImport");
  await page.click("#ioBtn");
}
const text = (page, sel) => page.locator(sel).innerText();

test("starts with clearly labeled example data", async () => {
  const page = await budgetPage();
  assert.equal(await page.locator("#exampleNote").isVisible(), true);
  assert.equal(await page.locator("#bills .bill").count(), 7);
  assert.equal(await page.locator("#cats .cat").count(), 4);
  assert.deepEqual(page.problems, []);
  await page.context().close();
});

test("import replaces the example data and the totals add up", async () => {
  const page = await budgetPage();
  await importSample(page);
  assert.match(await text(page, "#ioMsg"), /Imported 3 bills and 4 categories/);
  assert.equal(await page.locator("#exampleNote").isVisible(), false);
  assert.equal(await text(page, "#tBills"), "$1,695");
  assert.equal(await text(page, "#tSpent"), "$0");
  assert.equal(await text(page, "#tLeft"), "$2,305");          // 4,000 - 1,695 - 0
  assert.equal(await page.inputValue("#income"), "$4,000");
  await page.context().close();
});

test("a past month from the file shows its real spending and paid bills", async () => {
  const page = await budgetPage();
  await importSample(page);
  // Walk back to October 2026, the month the sample file includes.
  for (let i = 0; i < 24 && (await text(page, "#monthName")) !== "October 2026"; i++) await page.click("#prev");
  assert.equal(await text(page, "#monthName"), "October 2026");
  assert.equal(await text(page, "#billsMeta"), "3 of 3 paid");
  assert.equal(await text(page, "#tSpent"), "$500.50");
  await page.context().close();
});

test("bad import text shows a clear error and changes nothing", async () => {
  const page = await budgetPage();
  await page.click("#ioBtn");
  await page.fill("#ioText", "{not json");
  await page.click("#ioImport");
  assert.match(await text(page, "#ioMsg"), /isn't a valid budget file/);
  await page.fill("#ioText", '{"bills": []}');
  await page.click("#ioImport");
  assert.match(await text(page, "#ioMsg"), /list of bills and a list of categories/);
  assert.equal(await page.locator("#bills .bill").count(), 7);
  await page.context().close();
});

test("re-importing over your own data asks for confirmation first", async () => {
  const page = await budgetPage();
  await importSample(page);
  await page.click("#ioBtn");
  await page.setInputFiles("#ioFile", SAMPLE);
  await page.waitForFunction(() => document.getElementById("ioText").value.length > 0);
  await page.click("#ioImport");
  assert.match(await text(page, "#ioMsg"), /Tap again to confirm/);
  await page.click("#ioImport");
  assert.match(await text(page, "#ioMsg"), /Imported/);
  await page.context().close();
});

test("add purchase bar adds to the chosen category and remembers it", async () => {
  const page = await budgetPage();
  await importSample(page);
  await page.fill("#qAmt", "25.50");
  await page.selectOption("#qCat", "groc");
  await page.click("#quick button[type=submit]");
  assert.equal(await text(page, '[data-open="groc"] .amt'), "$25.50 / $400");
  assert.match(await text(page, "#qDone"), /Added \$25\.50 to Groceries/);
  await page.fill("#qAmt", "4.50");
  await page.click("#quick button[type=submit]");
  assert.equal(await text(page, '[data-open="groc"] .amt'), "$30 / $400");
  assert.equal(await text(page, "#tSpent"), "$30");
  await page.context().close();
});

test("tapping a category opens it to set the month total; over-plan turns red", async () => {
  const page = await budgetPage();
  await importSample(page);
  await page.click('[data-open="eat"]');
  assert.equal(await page.getAttribute('[data-open="eat"]', "aria-expanded"), "true");
  await page.fill("#set-eat", "250");
  await page.click("form.settotal button");
  assert.equal(await text(page, '[data-open="eat"] .amt'), "$250 / $200");
  assert.equal(await page.locator(".cat.over").count(), 1);
  assert.match(await text(page, ".cdetail .st"), /\$50 over plan/);
  await page.context().close();
});

test("bills: checking one moves it into a Paid group; the list collapses and remembers it", async () => {
  const page = await budgetPage();
  await importSample(page);
  await page.click("#b-rent");
  assert.equal(await page.locator("#bills .bill").count(), 2);
  assert.match(await text(page, "#paidToggle"), /Paid \(1\) · \$1,500/);
  await page.click("#paidToggle");
  assert.equal(await page.locator("#bills .bill").count(), 3);
  await page.click("#billsToggle");
  assert.equal(await page.locator("#bills").isHidden(), true);
  await page.reload();
  await page.waitForSelector("#billsToggle");
  assert.equal(await page.locator("#bills").isHidden(), true, "collapsed state survives a reload");
  assert.equal(await text(page, "#billsMeta"), "1 of 3 paid", "paid state survives a reload");
  await page.click("#billsToggle");
  assert.equal(await page.locator("#bills").isVisible(), true);
  await page.context().close();
});

test("edit mode renames a bill and adds a category", async () => {
  const page = await budgetPage();
  await importSample(page);
  await page.click("#editBtn");
  const name = page.locator('.edit-row.b[data-id="rent"] input[data-f="name"]');
  await name.fill("Apartment");
  await name.blur();
  await page.click("#addCat");
  await page.click("#editBtn");
  assert.match(await text(page, "#bills"), /Apartment/);
  assert.equal(await page.locator("#cats .cat").count(), 5);
  await page.context().close();
});

test("changing take-home pay replaces the old number instead of appending to it", async () => {
  const page = await budgetPage();
  await page.click("#income");
  await page.keyboard.type("5000");
  await page.keyboard.press("Tab");
  assert.equal(await page.inputValue("#income"), "$5,000");
  await page.context().close();
});

test("clear this month needs a second tap", async () => {
  const page = await budgetPage();
  await importSample(page);
  await page.click("#b-rent");
  await page.click("#resetMonth");
  assert.equal(await text(page, "#billsMeta"), "1 of 3 paid", "first tap only asks");
  await page.click("#resetMonth");
  assert.equal(await text(page, "#billsMeta"), "0 of 3 paid");
  await page.context().close();
});

test("works on a phone without sideways scrolling, even with a huge number", async () => {
  const page = await budgetPage({ viewport: PHONE });
  await page.click("#income");
  await page.keyboard.type("123456789");
  await page.keyboard.press("Tab");
  assert.equal(await hasSideScroll(page), false);
  await page.context().close();
});

test("signed in: loads saved data from the server and saves changes back", async () => {
  const remote = require(SAMPLE);
  const page = await openPage(browser, server.url, { fakeSupabase: { signedIn: true, remote } });
  await page.goto(server.url + "/pages/budget.html");
  await page.waitForFunction(() => document.querySelectorAll("#bills .bill").length === 3);
  assert.match(await text(page, "#sync"), /Syncing as test@example.com/);
  await page.click("#b-net");
  await page.waitForFunction(() => window.__upserts.length > 0);
  const row = await page.evaluate(() => window.__upserts.at(-1));
  assert.equal(row.page, "budget");
  assert.equal(row.user_id, "u1");
  assert.equal(Object.values(row.data.months).some(m => m.paid && m.paid.net), true);
  assert.deepEqual(page.problems, []);
  await page.context().close();
});
