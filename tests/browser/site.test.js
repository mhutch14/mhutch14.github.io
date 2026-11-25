// Site-wide browser tests: every page loads cleanly, shares the nav and theme, fits a phone,
// and every internal link works. Run: npm run test:browser
const test = require("node:test");
const assert = require("node:assert/strict");
const { startServer, launch, openPage, hasSideScroll, PHONE, PAGES } = require("./helpers");

let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser?.close(); await server?.close(); });

const SECTION = { "/": "Home", "/resume/": "Resume", "/pages/": "Tools", "/pages/budget.html": "Tools", "/pages/meal-plan.html": "Tools" };

for (const path of PAGES) {
  test(`${path} loads without errors, has a title, nav and footer`, async () => {
    const page = await openPage(browser, server.url);
    await page.goto(server.url + path);
    assert.ok((await page.title()).length > 0, "page has a <title>");
    assert.equal(await page.locator(".site-nav .brand").innerText(), "Odds & Ends");
    assert.equal(await page.locator('.site-nav [aria-current="page"]').innerText(), SECTION[path]);
    assert.equal(await page.locator("footer.site-foot").count(), 1);
    assert.equal(await page.locator("h1").count(), 1, "exactly one main heading");
    assert.deepEqual(page.problems, []);
    await page.context().close();
  });

  test(`${path} fits a phone screen in dark mode`, async () => {
    const page = await openPage(browser, server.url, { viewport: PHONE, colorScheme: "dark" });
    await page.goto(server.url + path);
    assert.equal(await hasSideScroll(page), false);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, "rgb(0, 0, 0)", "dark theme applied from the device setting");
    assert.deepEqual(page.problems, []);
    await page.context().close();
  });
}

test("home leads with the site name and tools; the resume keeps Mark's name", async () => {
  const page = await openPage(browser, server.url);
  await page.goto(server.url + "/");
  assert.equal(await page.locator("h1").innerText(), "Odds & Ends");
  assert.deepEqual(await page.locator(".tools a.card b").allInnerTexts(), ["Ledger", "Mise"]);
  assert.ok(await page.locator('.about a[href="/resume/"]').count(), "about section links to the resume");
  await page.goto(server.url + "/resume/");
  assert.equal(await page.locator("h1").innerText(), "Mark Hutchinson");
  await page.context().close();
});

test("every internal link on every page points to a page that exists", async () => {
  const page = await openPage(browser, server.url);
  const seen = new Set();
  for (const path of PAGES) {
    await page.goto(server.url + path);
    const hrefs = await page.$$eval("a[href]", as => as.map(a => a.href));
    for (const h of hrefs) if (h.startsWith(server.url)) seen.add(h.split("#")[0]);
  }
  assert.ok(seen.size >= 5);
  for (const h of seen) {
    const res = await page.request.get(h);
    assert.equal(res.status(), 200, `${h} should exist`);
  }
  await page.context().close();
});

test("theme switch cycles Auto, Light, Dark, is remembered across pages, and goes back to Auto", async () => {
  const page = await openPage(browser, server.url, { colorScheme: "light" });
  const state = () => page.evaluate(() => [document.querySelector(".theme-toggle").innerText.trim(), document.documentElement.dataset.theme || "auto", getComputedStyle(document.body).backgroundColor]);
  await page.goto(server.url + "/");
  assert.deepEqual(await state(), ["Auto", "auto", "rgb(245, 245, 247)"]);
  await page.click(".theme-toggle");
  assert.deepEqual(await state(), ["Light", "light", "rgb(245, 245, 247)"]);
  await page.click(".theme-toggle");
  assert.deepEqual(await state(), ["Dark", "dark", "rgb(0, 0, 0)"]);
  await page.goto(server.url + "/resume/");
  assert.deepEqual(await state(), ["Dark", "dark", "rgb(0, 0, 0)"], "choice carries to other pages");
  await page.click(".theme-toggle");
  assert.deepEqual(await state(), ["Auto", "auto", "rgb(245, 245, 247)"]);
  assert.deepEqual(page.problems, []);
  await page.context().close();
});

test("Light choice overrides a dark device setting", async () => {
  const page = await openPage(browser, server.url, { colorScheme: "dark" });
  await page.goto(server.url + "/");
  await page.click(".theme-toggle");   // Auto -> Light
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(245, 245, 247)");
  await page.context().close();
});

test("resume shows email, GitHub and LinkedIn, and never a phone number or street address", async () => {
  const page = await openPage(browser, server.url);
  await page.goto(server.url + "/resume/");
  const text = await page.locator("body").innerText();
  assert.match(text, /@gmail\.com/);
  assert.ok(await page.locator('a[href^="https://github.com/"]').count());
  assert.ok(await page.locator('a[href^="https://www.linkedin.com/in/"]').count());
  assert.doesNotMatch(text, /\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}/, "no phone number");
  assert.doesNotMatch(text, /\b(Rd|Road|Apt|Street|St\.)\b.*\d{5}/, "no street address");
  assert.doesNotMatch(text, /clearance/i, "no security clearance");
  await page.context().close();
});

test("resume email is not written in the HTML source (only assembled by script)", async () => {
  const page = await openPage(browser, server.url);
  const res = await page.request.get(server.url + "/resume/");
  assert.doesNotMatch(await res.text(), /mark\.hutch12@gmail\.com/);
  await page.context().close();
});
