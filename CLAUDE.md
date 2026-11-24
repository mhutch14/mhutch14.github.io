# mhutch14.github.io

GitHub Pages site served from the `master` branch at https://mhutch14.github.io.

- The root files (index.html, about.html, css/, img/, ...) are an older 2017 power-electronics site. Leave them alone unless asked.
- Personal HTML pages (meal plans, trackers, tools) go in `pages/`, served at https://mhutch14.github.io/pages/.

## Adding a page to `pages/`

1. Write it as one self-contained file: `pages/<short-name>.html`, with a full `<!doctype html>`, charset and viewport meta, inline CSS/JS, and light and dark themes.
2. Add `<p class="back"><a href="./">&larr; All pages</a></p>` near the top of the body.
3. Add a card for it at the top of the list in `pages/index.html`.
4. Everything here is public. Don't put personal details (email, address, account info) in pages.
5. Commit and push to `master`. The site updates within a minute or two.
