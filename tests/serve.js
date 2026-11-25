// Preview the site locally, the way GitHub Pages serves it.
// Run: npm run serve   then open the address it prints. Ctrl+C to stop.
const { startServer } = require("./browser/helpers");
startServer(Number(process.env.PORT) || 8080).then(s => console.log(`Serving the site at ${s.url}  (Ctrl+C to stop)`));
