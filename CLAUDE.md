# mhutch14.github.io

Mark's personal website, served by GitHub Pages from the `master` branch at https://mhutch14.github.io. It's two things: a resume, and day-to-day life tools.

## Site map

| URL | File | What it is |
|---|---|---|
| `/` | `index.html` | Home: intro, work snapshot, links to life tools |
| `/resume/` | `resume/index.html` | Full resume (has a print / save-as-PDF button) |
| `/pages/` | `pages/index.html` | "Life" hub: list of tool pages |
| `/pages/<name>.html` | `pages/<name>.html` | One life tool per file (meal plan, budget, ...) |

Shared files: `assets/site.css` (theme tokens, nav, cards, buttons), `pages/sync.js` + `pages/vendor/` (Supabase sync), `supabase/setup.sql`.
Keep the `/pages/` URL for life tools: Supabase sign-in redirects and bookmarks point there.

## Every page

1. Full `<!doctype html>` page with charset and viewport meta, the Google Fonts link (Inter only, as a fallback for the system font) and `<link rel="stylesheet" href="/assets/site.css?v=N">`. Put page-specific CSS in a `<style>` after it. Use the tokens from `site.css`, never hard-coded colors. The look is modeled on modern product sites like apple.com: light gray/white (black in dark mode), near-black text, one blue used only for clickable things, the system font (Inter fallback) in semibold, pill buttons, borderless rounded cards. Avoid display fonts, monospace text, uppercase letter-spaced labels, colored words in headings, and decorative rules.
2. Start the body with the shared nav, with `aria-current="page"` on the current section:
   ```html
   <nav class="site-nav" style="--maxw:1100px" aria-label="Site">
     <a class="brand" href="/">Mark <span>Hutchinson</span></a>
     <div class="links"><a href="/">Home</a><a href="/resume/">Resume</a><a href="/pages/" aria-current="page">Life</a></div>
   </nav>
   ```
   If a new top-level section is added, add its link to the nav on every page.
3. End with `<footer class="site-foot">`.
4. When `site.css` or `sync.js` changes, bump its `?v=N` on every page that loads it so browsers fetch the new copy.

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

## Publishing

Commit and push to `master`. GitHub Pages updates within a minute or two; browsers may cache pages for up to 10 minutes.
