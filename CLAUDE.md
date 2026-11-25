# mhutch14.github.io

Mark's personal website, served by GitHub Pages from the `master` branch at https://mhutch14.github.io. It's two things: a resume, and day-to-day life tools.

## Site map

| URL | File | What it is |
|---|---|---|
| `/` | `index.html` | Home: intro, work snapshot, links to life tools |
| `/resume/` | `resume/index.html` | Full resume (has a print / save-as-PDF button) |
| `/pages/` | `pages/index.html` | "Life" hub: list of tool pages |
| `/pages/<name>.html` | `pages/<name>.html` | One life tool per file (meal plan, budget, ...) |

README.md has the full file list, how-to-use guide and design notes. Keep it current when you add or change pages.

Logic worth testing goes in a DOM-free `pages/<name>-core.js` (see `pages/budget-core.js`), loaded by the page and required by unit tests.
Shared files: `assets/site.css` (theme tokens, nav, cards, buttons), `assets/theme.js` (light/dark switch), `pages/sync.js` + `pages/vendor/` (Supabase sync), `supabase/setup.sql`.
Keep the `/pages/` URL for life tools: Supabase sign-in redirects and bookmarks point there.

## Every page

1. Full `<!doctype html>` page with charset and viewport meta, the Google Fonts link (Inter only, as a fallback for the system font) `<link rel="stylesheet" href="/assets/site.css?v=N">`, and right after it `<script src="/assets/theme.js?v=N"></script>` (the Auto/Light/Dark switch; it adds itself to the nav and must load in `<head>` so there's no flash of the wrong theme). Put page-specific CSS in a `<style>` after it. Use the tokens from `site.css`, never hard-coded colors. The look is modeled on modern product sites like apple.com: light gray/white (black in dark mode), near-black text, one blue used only for clickable things, the system font (Inter fallback) in semibold, pill buttons, borderless rounded cards. Avoid display fonts, monospace text, uppercase letter-spaced labels, colored words in headings, and decorative rules.
2. Start the body with the shared nav, with `aria-current="page"` on the current section:
   ```html
   <nav class="site-nav" style="--maxw:1100px" aria-label="Site">
     <a class="brand" href="/">Mark <span>Hutchinson</span></a>
     <div class="links"><a href="/">Home</a><a href="/resume/">Resume</a><a href="/pages/" aria-current="page">Life</a></div>
   </nav>
   ```
   If a new top-level section is added, add its link to the nav on every page.
3. End with `<footer class="site-foot">`.
4. Dark colors are defined twice in `site.css` (device setting and `[data-theme="dark"]`); keep both blocks identical.
5. When `site.css`, `theme.js` or `sync.js` changes, bump its `?v=N` on every page that loads it so browsers fetch the new copy.

## Adding a life tool

1. Create `pages/<short-name>.html` following "Every page".
2. Add a card at the top of the list in `pages/index.html` (title, date, one-line description, tags, arrow). Also add it to the "Life" list on the home page, `index.html`.
3. New tools start with clearly labeled example data, never invented personal figures.

## Privacy

The site is public. Allowed: name, Groton CT (city/state only), email (assembled in JS on the resume page, not plain in HTML), GitHub and LinkedIn links.
Never publish: street address, phone number, security clearance status, or anything beyond the user's resume wording about classified/defense work. Ask before adding any other personal details.

## Saving data across devices (Supabase)

Pages can sync their state through Supabase with the shared helper `pages/sync.js`.

- The database has one table, `public.page_state` (user_id, page, data jsonb, updated_at). Row-level security limits each row to the signed-in user who owns it. Its setup is in `supabase/setup.sql`. If you change the table, put the new SQL there too and tell the user to run it in Supabase's SQL Editor.
- The project URL and the publishable key are at the top of `sync.js`. Both are meant to be public. Never put the `service_role` key or the database password in this repo.
- Users sign in with an email magic link. The page URL has to be in Supabase under Authentication → URL Configuration → Redirect URLs (`https://mhutch14.github.io/pages/**` covers every life tool).
- To use it in a page, load `vendor/supabase-2.119.0.js`, then `sync.js?v=N`, then:
  ```js
  PageSync.init({ page: "<short-name>", mount: el, initial: () => state, onData: d => { /* apply d */ } });
  PageSync.save(state); // on every change
  ```
  Keep localStorage as the offline copy, so the page still works without sign-in or offline. `pages/meal-plan.html` and `pages/budget.html` are working examples.

## Tests

- `npm test`: unit tests in `tests/unit/` (Node's built-in runner, no install).
- `npm run test:browser`: Playwright tests in `tests/browser/` (every page, theme, budget, meal plan, sync with a fake Supabase). Needs `npm install` and `npx playwright install chromium`, or set `CHROMIUM_PATH`.
- Run both before pushing, and add tests for new behavior. Test data must be fake (`tests/browser/fixtures/`), never the user's real figures.
- `_config.yml` keeps tests, notes and setup files off the live site; add new non-site files to its `exclude` list.

## Publishing

Commit and push to `master`. GitHub Pages updates within a minute or two; browsers may cache pages for up to 10 minutes.
