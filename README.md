# mhutch14.github.io

**Odds & Ends**, Mark Hutchinson's personal website: a set of **life tools** for day-to-day planning, like a work time sheet (**TimeSheet**), a monthly budget (**Ledger**) and a weekly meal plan with a grocery checklist (**Mise**), plus an online **resume**. Tool data can sync between phone and laptop.

**Live site: https://mhutch14.github.io**

| Page | Link |
|---|---|
| Home | https://mhutch14.github.io/ |
| Resume | https://mhutch14.github.io/resume/ |
| Tools | https://mhutch14.github.io/pages/ |
| TimeSheet (weekly hours & PTO) | https://mhutch14.github.io/pages/timesheet.html |
| Ledger (monthly budget) | https://mhutch14.github.io/pages/budget.html |
| Mise (weekly meal plan) | https://mhutch14.github.io/pages/meal-plan.html |

---

## How to use the site

### Everywhere
- **Menu:** Home, Tools and Resume are at the top of every page.
- **Light / dark:** the round button at the end of the menu cycles **Auto** (follows your device), **Light** and **Dark**. Each browser remembers your choice.
- **Syncing between devices:** TimeSheet, Ledger and Mise each have a **"Sign in to sync"** box. Enter your email, tap **Email me a link**, and open the link in that email *on the same device*. That browser stays signed in. Once signed in, tap **Set password**; then on a device where you can't open your email (like a work computer) tap **Have a password? Sign in with it** and use your email and password. Changes then save to your account and show up on your other signed-in devices when you open or switch back to the page. Signed out or offline, each page still works and saves to that device only.
- **Seeing an old version?** Browsers can keep a page for up to 10 minutes. Force a refresh with **Ctrl+Shift+R** (**Cmd+Shift+R** on a Mac), or open the page in a new tab on a phone.

### Resume
- Shows experience, education, skills and contact links (email, GitHub, LinkedIn).
- **Print or save as PDF** opens your browser's print dialog with a clean, print-friendly layout.

### TimeSheet (weekly hours & PTO)
Ported from Mark's Excel time-sheet workbook. Hours are counted in tenths of an hour (6-minute units) with the workbook's rounding.
- **First visit:** enter your start (hire) date, lunch start and (optionally) PTO balance, or tap *Use defaults*.
- **Dashboard:** **Clock in** stamps today's In time and keeps Out at the current time until you tap **Stop**. Resuming after a gap offers to log it as a break. **WTL** (working through lunch) skips the 30-minute lunch deduction; the **WTL all week** switch on the week card turns it on for every day and makes new weeks start that way (also in Settings). Every day's In/Out, WTL and break hours can be edited.
- **Week:** total, remaining to 40, and ahead/behind an 8-hour-a-day pace. Holidays fill in as 8 paid hours (tap *I worked this day* to count real hours instead).
- **Clock-out targets:** when you reach 8.0 hours today, the earliest you can leave and stay on pace, and the hours you'd have at a planned time.
- **PTO:** your bank, next accrual date and amount (by years of service), max bank and history. When an accrual date passes, a banner asks before adding it.
- **New week:** on Sunday the last week is archived; if it's under 40 hours you're asked whether to cover it with PTO. A floatable holiday in a week with 44+ paid hours is banked.
- **Archive, Planner, Holidays, Settings** tabs: daily history with charts and CSV import/export; a Mon–Fri schedule planner; editable holiday dates per year; backup/restore and reset.

### Ledger (monthly budget)
- **Month:** use the ← and → arrows to move between months. Each month keeps its own paid bills and spending.
- **Take-home pay:** tap the number to change it. That also becomes the default for new months.
- **Bills:** check a bill off when it's paid, and it moves into the **Paid** group (tap it to show or hide). Each bill shows *Due in N days*, *Due today* or *N days late*. Tap the **Bills** heading to collapse the whole list.
- **Spending:** type an amount, pick a category and tap **Add purchase**. The category is remembered for next time. Tap a category row to see what's left and to set the month's total if you need to correct it. A bar turns red when you go over plan.
- **Edit bills & categories:** rename, change amounts and due days, add or remove bills and categories.
- **Import or back up:**
  - *Import* loads a budget file (`.json`, see format below). It replaces bills, categories and pay, and keeps months that aren't in the file. If you already have your own data, it asks you to confirm.
  - *Copy my budget* copies everything as text so you can keep a backup.
- **Clear this month** resets paid bills and spending for the month you're viewing. It asks for a second tap first.
- The page starts with **example data** (marked in orange) until you edit or import your own.

Budget file format (also see [`pages/budget-core.js`](pages/budget-core.js)):

```json
{
  "income": 4000,
  "bills": [{ "id": "rent", "name": "Rent", "amount": 1500, "day": 1 }],
  "cats":  [{ "id": "groc", "name": "Groceries", "planned": 400 }],
  "months": { "2026-10": { "income": 4000, "paid": { "rent": true }, "spent": { "groc": 320.25 } } }
}
```

### Mise (weekly meal plan)
- A week of quick, healthy meals: grab-and-go breakfasts and lunches, and dinners of 30 minutes or less, plus a Sunday prep plan and recipes (tap a meal to open it).
- **Grocery list:** check items off as you shop, and the progress bar fills. **Hide pantry items** hides staples you probably already have. **Copy what's left** copies the unchecked items by aisle, ready to paste into a shopping app. **Uncheck all** starts over.

---

## Project design

### What it is
A **static website**: plain HTML, CSS and JavaScript files with no build step and no framework. GitHub Pages serves the `master` branch as-is. The only server-side piece is **Supabase** (a hosted Postgres database with sign-in), which stores each person's tool data so it can sync between devices.

```
Browser ──(HTML/CSS/JS)── GitHub Pages (this repo, public)
   │
   └──(sign-in + saved tool data)── Supabase (private per user, row-level security)
```

### Look and feel
The site is called **Odds & Ends**: the home page leads with the tools, and the resume is one section of the site. Each tool has a short name (Ledger, Mise) with a plain description next to it.

Modeled on modern product sites like apple.com: light gray and white (true black in dark mode), near-black text, one blue used only for clickable things, the device's system font (San Francisco on Apple devices, with Inter as the fallback), pill-shaped buttons and borderless rounded cards. Every color is a CSS variable ("token") in `assets/site.css`, defined once for light and once for dark, so pages never hard-code colors.

### Data and privacy
- **The site is public.** Anyone with the link can read every page and every file in this repo, so personal figures never go in the code. Tools ship with *example* data only.
- **Your own data** lives in two places only: your browser's `localStorage` (works offline, per device), and your row in Supabase's `page_state` table when you're signed in. Row-level security means each signed-in user can read and write only their own rows.
- The Supabase **project URL and publishable key** in `pages/sync.js` are designed to be public. The secret `service_role` key and the database password must never be added to this repo.
- The resume leaves out phone number, street address and security clearance on purpose. The email address is assembled by script so it isn't in the HTML for scrapers.

### Sync design (`pages/sync.js`)
- One table, `public.page_state (user_id, page, data jsonb, updated_at)`, with one row per user per page (`"budget"`, `"meal-plan"`, `"timesheet"`). The setup SQL is in `supabase/setup.sql`.
- Sign-in uses the magic link in an email, or email + password (`signInWithPassword`; the password is set while signed in with `updateUser`). Supabase must allow `https://mhutch14.github.io/pages/**` as a redirect URL.
- On sign-in, the page loads the saved row. If none exists yet, it uploads what the device already has. After that, every change is saved (debounced, 0.6 seconds) and the page reloads the row whenever you switch back to the tab.
- If the sign-in library can't load, the page shows a short notice and keeps working locally.

---

## Files

```
index.html                  Home page: site name, tool cards, short About with resume link
resume/index.html           Resume, with print / save-as-PDF
pages/index.html            Tools hub: one card per tool
pages/budget.html           Monthly budget page (UI and events)
pages/budget-core.js        Budget logic with no DOM access: parsing, money format, due-date status,
                            totals, import checks, example data. Used by the page and the unit tests.
pages/meal-plan.html        Weekly meal plan, recipes and grocery checklist
pages/timesheet.html        TimeSheet: clock in/out, week, targets, PTO, archive, planner, holidays (UI and flows)
pages/timesheet-core.js     TimeSheet logic with no DOM access: hour rounding, lunch/WTL, targets, PTO accrual,
                            holidays, floating, closing out a week, archive, planner, import, saved-state merge.
                            Used by the page and the unit tests.
pages/sync.js               Shared sign-in + save/load helper for any tool page (Supabase)
pages/vendor/supabase-2.119.0.js   Supabase browser library, served from this site (not a CDN)
                                   so ad blockers and CDN outages don't break sign-in
assets/site.css             Shared theme: color tokens (light + dark), type, nav, cards, buttons, footer
assets/theme.js             Auto / Light / Dark switch; adds itself to the nav, applies before paint
supabase/setup.sql          Creates the page_state table and its row-level security rules (run once)
tests/unit/                 Unit tests for budget-core.js and timesheet-core.js (Node's built-in test runner)
tests/browser/              Browser tests for every page (Playwright + Chromium)
tests/browser/fixtures/     Sample budget file used by the tests (fake numbers)
tests/serve.js              Local preview server: npm run serve
_config.yml                 GitHub Pages settings: keeps tests, notes and setup files off the live site
.vscode/                    VS Code setup: recommended extension, test discovery, tasks, preview and debug
.github/workflows/tests.yml Runs the unit and browser tests on GitHub on every push
package-lock.json           Exact test-tool versions (Playwright)
package.json                Test and preview commands
CLAUDE.md                   Working notes for Claude Code sessions: conventions, privacy rules, how to add a page
```

---

## Working on the site

### Set up on your laptop (VS Code)
One-time installs (all free):
1. **Git**: https://git-scm.com/downloads (on a Mac, running `git --version` in Terminal offers to install it).
2. **Node.js 22 LTS**: https://nodejs.org (the "LTS" installer).
3. **VS Code**: https://code.visualstudio.com
4. **Google Chrome** or Microsoft Edge, for viewing the site from VS Code.

Get the project:
1. In VS Code: **Ctrl+Shift+P** (Cmd+Shift+P on a Mac) → **Git: Clone** → paste `https://github.com/mhutch14/mhutch14.github.io.git` → pick a folder (e.g. Documents) → **Open**.
2. Click **Yes, I trust the authors** when asked.
3. Accept the pop-up to install the recommended extension (**Node.js Test Runner**), which puts the tests in the Testing panel.
4. **Terminal → Run Task… → First-time setup**. This installs Playwright and its Chromium browser (a few minutes, about 200 MB).

Day to day:
| To... | Do this |
|---|---|
| See and run the tests | **Testing** panel (beaker icon on the left): run all, one file or one test; failures show inline in the code. Or **Terminal → Run Task… → Unit tests / Browser tests / All tests**. |
| Preview the site | **Run and Debug** (Ctrl+Shift+D) → **Open the site in Chrome** → ▶. It starts the local server and opens http://127.0.0.1:8080. (Edge: change `"chrome"` to `"msedge"` in `.vscode/launch.json`.) |
| Step through a test | Set a breakpoint (click left of a line number), then **Run and Debug → Debug the open test file** with that test file open. |
| Publish | **Source Control** panel: write a message, **Commit**, then **Sync Changes**. Pushing to `master` publishes the live site in a minute or two, and GitHub runs the tests (see the repo's Actions tab). Run **All tests** first. |
| Get changes made elsewhere (e.g. in a Claude session) | **Source Control → ⋯ → Pull** (or the sync arrows in the status bar). |

The first push asks you to sign in to GitHub in the browser; VS Code remembers it after that.

Project files for VS Code live in `.vscode/`: `extensions.json` (recommended extension), `settings.json` (test discovery), `tasks.json` (the tasks above) and `launch.json` (preview and debugging).

### Preview locally
```bash
npm run serve
```
Then open http://127.0.0.1:8080. Pages use root-relative links (`/assets/...`), so open them through this server rather than double-clicking the files.

### Run the tests
Unit tests need only Node 20 or newer:
```bash
npm test
```
Browser tests need Playwright and Chromium, installed once:
```bash
npm install
```
```bash
npx playwright install chromium
```
```bash
npm run test:browser
```
Or run both:
```bash
npm run test:all
```

What's covered:
- **Unit tests (45):** TimeSheet hours (lunch, WTL and WTL all week, tenths, breaks, holidays), clock-out targets (8-hour, even, plan), PTO accrual dates, amounts, pending/add and the cap, holiday dates and floating, closing out a week (short week and PTO, full week, floated holiday), archive rows, the planner, pasted-row import, and loading older saved data; budget number parsing, money formatting, due-date status (late, today, soon, later, short months), totals, progress bars, adding purchases without rounding drift, and import checking (valid files, bad files, trimming, clamping).
- **Browser tests (61):**
  - Every page loads with no errors and has the shared nav and footer.
  - The home page leads with "Odds & Ends" and the tools; the resume keeps Mark's name as its heading.
  - Every page fits a phone screen in dark mode.
  - Every internal link works.
  - The theme switch cycles and is remembered.
  - The resume shows no private details, and the email isn't in the HTML source.
  - Budget: import (including bad files and confirmation), past months, the add-purchase bar, set total and over-plan, paid-bill grouping, collapse remembered after reload, edit mode, take-home pay entry, clear month, and phone layout.
  - Meal plan: checklist, hide pantry, copy list, uncheck all.
  - TimeSheet: first-visit setup, week totals and pace, clock in and reload, editing days and WTL, WTL all week (and as the new-week default), closing out a week with or without PTO and "Not yet", the PTO accrual banner, logging a break, clock-out targets, planner, pasted import, backup export/restore, tabs, phone layout, and sync as page "timesheet".
  - Sync, with a fake Supabase: sign-in link email, signing in with a password (and a wrong one), setting a password, loading saved data, the first upload, sign out, and the offline fallback.

The browser tests never contact the real Supabase project.

### Publish
Commit and push to `master`. GitHub Pages rebuilds in about a minute. Check progress under the repo's **Actions** tab ("pages build and deployment").

### Add a new life tool
1. Copy the structure of an existing tool page into `pages/<name>.html`: the head links to `site.css` and `theme.js`, then the shared nav and footer. See "Every page" in `CLAUDE.md`.
2. Start it with clearly labeled example data.
3. To sync it, load `vendor/supabase-2.119.0.js` and `sync.js`, then call `PageSync.init({ page: "<name>", mount, initial, onData })` and `PageSync.save(state)` on every change.
4. Give it a short name, and add a card to `pages/index.html` and to the Tools grid on `index.html`.
5. Put any logic worth testing in a separate `*-core.js` file like `budget-core.js`, and add tests.

### Supabase setup (already done; for reference)
1. Run `supabase/setup.sql` in the Supabase SQL Editor.
2. Under **Authentication → URL Configuration**, set Site URL to `https://mhutch14.github.io/pages/` and add Redirect URL `https://mhutch14.github.io/pages/**`.
3. After signing in on your devices, turn off **Allow new users to sign up** under **Authentication → Sign In / Providers**.
4. Free-tier projects pause after about a week without use. Un-pause from the Supabase dashboard; no data is lost.
