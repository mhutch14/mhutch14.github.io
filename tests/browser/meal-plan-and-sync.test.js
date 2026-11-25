// Browser tests for the meal plan page and the shared sign-in/sync helper (pages/sync.js).
// Run: npm run test:browser
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openPage } = require("./helpers");

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser?.close(); await server?.close(); });

async function mealPage(opts) {
  const page = await openPage(browser, server.url, opts);
  await page.goto(server.url + "/pages/meal-plan.html");
  await page.waitForSelector("#list input");
  return page;
}

test("meal plan renders the week, prep steps, recipes and grocery list", async () => {
  const page = await mealPage();
  assert.equal(await page.locator("#week tbody tr").count(), 7);
  assert.equal(await page.locator("#prep .step").count(), 4);
  assert.equal(await page.locator("#recipes details").count(), 8);
  assert.ok(await page.locator("#list input").count() >= 40);
  assert.deepEqual(page.problems, []);
  await page.context().close();
});

test("checking grocery items updates the count and survives a reload", async () => {
  const page = await mealPage();
  const total = await page.locator("#list input").count();
  await page.click('label[for="g0"]');
  await page.click('label[for="g1"]');
  assert.equal(await page.locator("#count").innerText(), `2 of ${total} items in the cart`);
  await page.reload();
  await page.waitForSelector("#list input");
  assert.equal(await page.isChecked("#g0"), true);
  assert.equal(await page.locator("#count").innerText(), `2 of ${total} items in the cart`);
  await page.context().close();
});

test("hide pantry items removes them from the count", async () => {
  const page = await mealPage();
  const all = await page.locator("#list input").count();
  const pantry = await page.locator('label.item[data-pantry="1"]').count();
  await page.click("#hidePantry");
  assert.equal(await page.locator("#count").innerText(), `0 of ${all - pantry} items in the cart`);
  assert.equal(await page.locator("#hidePantry").innerText(), "Show pantry items");
  await page.context().close();
});

test("copy what's left produces a list grouped by aisle without checked items", async () => {
  const page = await mealPage();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.url });
  await page.click('label[for="g0"]');                 // Bananas
  await page.click("#copyBtn");
  await page.waitForFunction(() => !document.getElementById("toast").hidden);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^PRODUCE\n- Apples \(4\)/);
  assert.doesNotMatch(copied, /Bananas/);
  assert.match(copied, /MEAT & SEAFOOD/);
  await page.context().close();
});

test("uncheck all clears every item", async () => {
  const page = await mealPage();
  await page.click('label[for="g0"]');
  await page.click("#resetBtn");
  assert.match(await page.locator("#count").innerText(), /^0 of/);
  await page.context().close();
});

test("sync: signed out shows the email sign-in form and sends a link back to this page", async () => {
  const page = await mealPage({ fakeSupabase: { signedIn: false } });
  await page.waitForSelector("#ps-email");
  await page.fill("#ps-email", "someone@example.com");
  await page.click("#ps-send button");
  await page.waitForFunction(() => window.__otp.length === 1);
  const otp = await page.evaluate(() => window.__otp[0]);
  assert.equal(otp.email, "someone@example.com");
  assert.match(otp.options.emailRedirectTo, /\/pages\/meal-plan\.html$/);
  assert.match(await page.locator("#sync").innerText(), /Check your email/);
  await page.context().close();
});

test("sync: sign in with email and password (wrong password shows an error)", async () => {
  const page = await mealPage({ fakeSupabase: { signedIn: false, remote: { checked: {}, hidePantry: false } } });
  await page.waitForSelector("#ps-email");
  assert.equal(await page.locator("#ps-pw").isVisible(), false, "password box hidden until asked for");
  await page.click("#ps-usepw");
  await page.fill("#ps-email", "someone@example.com");
  await page.fill("#ps-pw", "wrong");
  await page.click("#ps-pass button");
  await page.waitForFunction(() => /Couldn't sign in/.test(document.querySelector("#sync").innerText));
  await page.fill("#ps-pw", "correct-horse");
  await page.click("#ps-pass button");
  await page.waitForFunction(() => /Syncing as/.test(document.querySelector("#sync").innerText));
  assert.deepEqual(await page.evaluate(() => window.__pw.at(-1)), { email: "someone@example.com", password: "correct-horse" });
  assert.equal(await page.evaluate(() => window.__otp.length), 0, "no email sent");
  await page.context().close();
});

test("sync: signed in, you can set a password for other devices", async () => {
  const page = await mealPage({ fakeSupabase: { signedIn: true, remote: { checked: {}, hidePantry: false } } });
  await page.waitForSelector("#ps-pwbtn");
  await page.click("#ps-pwbtn");
  await page.fill("#ps-newpw", "a-long-password");
  await page.click("#ps-setpw button");
  await page.waitForFunction(() => /Password saved/.test(document.querySelector("#sync").innerText));
  assert.deepEqual(await page.evaluate(() => window.__setpw), [{ password: "a-long-password" }]);
  assert.equal(await page.locator("#ps-setpw").isVisible(), false);
  await page.context().close();
});

test("sync: signed in loads saved checkmarks from the server", async () => {
  const remote = { checked: { g0: true, g1: true, g2: true }, hidePantry: false };
  const page = await mealPage({ fakeSupabase: { signedIn: true, remote } });
  await page.waitForFunction(() => document.getElementById("g2").checked);
  assert.match(await page.locator("#count").innerText(), /^3 of/);
  assert.match(await page.locator("#sync").innerText(), /Syncing as test@example.com/);
  await page.context().close();
});

test("sync: first sign-in with nothing saved uploads this device's checkmarks", async () => {
  const page = await mealPage({ fakeSupabase: { signedIn: true, remote: null } });
  await page.waitForFunction(() => window.__upserts.length === 1);
  const row = await page.evaluate(() => window.__upserts[0]);
  assert.equal(row.page, "meal-plan");
  assert.deepEqual(row.data, { checked: {}, hidePantry: false });
  await page.context().close();
});

test("sync: sign out returns to the sign-in form", async () => {
  const page = await mealPage({ fakeSupabase: { signedIn: true, remote: { checked: {}, hidePantry: false } } });
  await page.waitForSelector("#ps-out");
  await page.click("#ps-out");
  await page.waitForSelector("#ps-email");
  await page.context().close();
});

test("sync: if the sign-in library can't load, the page says so and still works offline", async () => {
  const page = await openPage(browser, server.url);
  await page.route(`${server.url}/pages/vendor/**`, r => r.abort());
  await page.goto(server.url + "/pages/meal-plan.html");
  await page.waitForSelector("#list input");
  assert.match(await page.locator("#sync").innerText(), /Sync couldn't start/);
  await page.click('label[for="g0"]');
  assert.match(await page.locator("#count").innerText(), /^1 of/);
  await page.context().close();
});
