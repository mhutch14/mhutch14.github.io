// Shared setup for the browser tests: a tiny static server for the repo and a Chromium launcher.
// Supabase is never contacted: tests either block it or swap in a fake client (fakeSupabase).
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

/** Serve the repo like GitHub Pages does ("/x/" serves "/x/index.html"). Port 0 = any free port. Resolves to { url, close }. */
function startServer(port = 0) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end("not found"); }
        res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(port, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise(r => server.close(r)) });
    });
  });
}

async function launch() {
  const { chromium } = require("playwright");
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

/**
 * New page with: external requests (fonts, Supabase) blocked, and every page error and
 * failed same-site request collected in page.problems so tests can assert there were none.
 */
async function openPage(browser, base, opts = {}) {
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, colorScheme: opts.colorScheme || "light" });
  const page = await context.newPage();
  page.problems = [];
  page.on("pageerror", e => page.problems.push(`page error: ${e.message}`));
  page.on("response", r => { if (r.url().startsWith(base) && r.status() >= 400) page.problems.push(`${r.status()} ${r.url()}`); });
  await page.route(url => !url.href.startsWith(base), route => route.abort());
  if (opts.fakeSupabase) await page.route(`${base}/pages/vendor/**`, route => route.fulfill({ contentType: "text/javascript", body: fakeSupabase(opts.fakeSupabase) }));
  return page;
}

/**
 * Source for a stand-in window.supabase. options.signedIn = true pretends a user is signed in;
 * options.remote = data the "server" already has for the page. Upserts are recorded in window.__upserts.
 */
function fakeSupabase({ signedIn = false, remote = null } = {}) {
  return `window.__upserts = []; window.__otp = []; window.__verify = [];
  window.supabase = { createClient() { let cb; return {
    auth: {
      onAuthStateChange(f) { cb = f; setTimeout(() => f("INITIAL_SESSION", ${signedIn} ? { user: { id: "u1", email: "test@example.com" } } : null), 10); },
      signOut() { cb("SIGNED_OUT", null); return Promise.resolve({}); },
      signInWithOtp(o) { window.__otp.push(o); return Promise.resolve({ error: null }); },
      verifyOtp(o) { window.__verify.push(o);
        if (o.token !== "123456") return Promise.resolve({ error: { message: "Token has expired or is invalid" } });
        setTimeout(() => cb("SIGNED_IN", { user: { id: "u1", email: o.email } }), 10); return Promise.resolve({ error: null }); }
    },
    from() { return {
      select() { return { eq() { return { maybeSingle() { return Promise.resolve({ data: ${JSON.stringify(remote)} ? { data: ${JSON.stringify(remote)} } : null, error: null }); } }; } }; },
      upsert(row) { window.__upserts.push(row); return Promise.resolve({ error: null }); }
    }; }
  }; } };`;
}

/** True when the page scrolls sideways (a layout bug on phones). */
function hasSideScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

const PHONE = { width: 390, height: 844 };
const PAGES = ["/", "/resume/", "/pages/", "/pages/budget.html", "/pages/meal-plan.html"];

module.exports = { ROOT, startServer, launch, openPage, fakeSupabase, hasSideScroll, PHONE, PAGES };
