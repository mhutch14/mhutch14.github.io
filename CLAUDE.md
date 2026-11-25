# mhutch14.github.io

GitHub Pages site served from the `master` branch at https://mhutch14.github.io.

- The root `index.html` only redirects to `pages/`. Besides `README.md`, `CLAUDE.md` and `supabase/`, don't add other files at the root.
- Personal HTML pages (meal plans, trackers, tools) go in `pages/`, served at https://mhutch14.github.io/pages/.

## Adding a page to `pages/`

1. Write it as one file: `pages/<short-name>.html`, with a full `<!doctype html>`, charset and viewport meta, inline CSS/JS, and light and dark themes. The only shared file is `pages/sync.js` (see below).
2. Add `<p class="back"><a href="./">&larr; All pages</a></p>` near the top of the body.
3. Add a card for it at the top of the list in `pages/index.html`.
4. Everything here is public. Don't put personal details (email, address, account info) in pages.
5. Commit and push to `master`. The site updates within a minute or two.

## Saving data across devices (Supabase)

Pages can sync their state through Supabase with the shared helper `pages/sync.js`.

- The database has one table, `public.page_state` (user_id, page, data jsonb, updated_at). Row-level security limits each row to the signed-in user who owns it. Its setup is in `supabase/setup.sql`. If you change the table, put the new SQL there too and tell the user to run it in Supabase's SQL Editor.
- The project URL and the publishable key are at the top of `sync.js`. Both are meant to be public. Never put the `service_role` key or the database password in this repo.
- Users sign in with an email magic link. The page URL has to be in Supabase under Authentication → URL Configuration → Redirect URLs (`https://mhutch14.github.io/pages/**` covers every page).
- To use it in a page, load `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.js`, then `sync.js`, then call:
  ```js
  PageSync.init({ page: "<short-name>", mount: el, initial: () => state, onData: d => { /* apply d */ } });
  PageSync.save(state); // on every change
  ```
  Keep localStorage as the offline copy, so the page still works without sign-in or offline. `pages/meal-plan.html` is the working example.
