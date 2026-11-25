/*
 * PageSync: saves a page's state to Supabase so it follows you across devices.
 * Needs the supabase-js UMD build loaded first:
 *   <script src="vendor/supabase-2.119.0.js"></script>
 *   <script src="sync.js?v=2"></script>
 *
 * Usage:
 *   PageSync.init({ page: "meal-plan", mount: el, onData: data => {...} });
 *   PageSync.save(data);   // call whenever state changes (debounced)
 *
 * Data lives in the public.page_state table (one row per user per page), and
 * row-level security limits each row to the user who owns it. The page keeps
 * working without sign-in or offline; it just doesn't sync.
 */
(function () {
  const SUPABASE_URL = "https://wgvauwookwivyaejuohf.supabase.co";
  const SUPABASE_KEY = "sb_publishable_zz-tRudNu-jSFcpIBa_bhQ_ZnFfhtgZ"; // public by design

  const css = `
  .ps{display:flex;flex-direction:column;gap:6px;font-size:13px}
  .ps form{display:flex;gap:6px;flex-wrap:wrap;max-width:480px}
  .ps form button{font:inherit;font-size:13px;font-weight:600;padding:7px 12px;border-radius:980px;border:1px solid var(--accent,#0071e3);background:var(--accent,#0071e3);color:var(--on-accent,#fff);cursor:pointer}
  .ps input{flex:1 1 160px;min-width:0;font:inherit;font-size:13px;padding:7px 10px;border-radius:8px;border:1px solid var(--line,#ccc);background:var(--bg,#fff);color:var(--fg,#111)}
  .ps .row{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}
  .ps .st{color:var(--muted,#666)}
  .ps .st.ok::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent,#2a7);margin-right:6px;vertical-align:1px}
  .ps .st.warn{color:var(--bad,#d70015)}
  .ps .link{background:none;border:0;padding:0;color:var(--accent,#2a7);font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline}`;

  let client = null, user = null, opts = null, ui = {}, timer = null, pending = null, lastSaved = null;
  const configured = !SUPABASE_URL.includes("YOUR-PROJECT") && window.supabase;

  function status(text, kind) { if (ui.st) { ui.st.textContent = text; ui.st.className = "st " + (kind || ""); } }

  function render() {
    const m = opts.mount; if (!m) return;
    if (!configured) {
      m.innerHTML = `<div class="ps"><span class="st warn">Sync couldn't start, so checkmarks are saved on this device only. Try refreshing the page.</span></div>`;
      return;
    }
    if (user) {
      m.innerHTML = `<div class="ps"><div class="row"><span class="st ok">Syncing as <b></b></span>
        <button class="link" type="button">Sign out</button></div></div>`;
      m.querySelector("b").textContent = user.email || "you";
      m.querySelector("button").onclick = async () => { await client.auth.signOut(); };
      ui.st = m.querySelector(".st");
    } else {
      m.innerHTML = `<div class="ps"><span class="st">Sign in to sync this page across your devices.</span>
        <form><input type="email" id="ps-email" required placeholder="Email address" autocomplete="email" aria-label="Email address">
        <button type="submit">Email me a link</button></form></div>`;
      ui.st = m.querySelector(".st");
      m.querySelector("form").onsubmit = async e => {
        e.preventDefault();
        const email = m.querySelector("input").value.trim();
        status("Sending…");
        const { error } = await client.auth.signInWithOtp({
          email, options: { emailRedirectTo: location.origin + location.pathname }
        });
        status(error ? "Couldn't send the link: " + error.message : "Check your email and open the link on this device.", error ? "warn" : "ok");
      };
    }
  }

  async function load() {
    if (!user) return;
    status("Loading…");
    const { data, error } = await client.from("page_state").select("data").eq("page", opts.page).maybeSingle();
    if (error) { status("Offline. Changes are saved on this device only.", "warn"); return; }
    if (data) { lastSaved = JSON.stringify(data.data); opts.onData && opts.onData(data.data); }
    else if (opts.initial) { await push(opts.initial()); } // first sign-in: upload what this device has
    status("Synced", "ok");
    render();
  }

  async function push(data) {
    if (!user) return;
    const json = JSON.stringify(data);
    if (json === lastSaved) return;
    status("Saving…");
    const { error } = await client.from("page_state").upsert(
      { user_id: user.id, page: opts.page, data, updated_at: new Date().toISOString() },
      { onConflict: "user_id,page" });
    if (error) { status("Couldn't save. Will retry on next change.", "warn"); return; }
    lastSaved = json;
    status("Saved", "ok");
    setTimeout(() => user && render(), 1200);
  }

  window.PageSync = {
    init(o) {
      opts = o;
      const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
      if (!configured) { render(); return; }
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      render();
      client.auth.onAuthStateChange((evt, session) => {
        const was = user && user.id; user = session ? session.user : null;
        if ((user && user.id) !== was) { lastSaved = null; render(); if (user) setTimeout(load, 0); }
      });
      // pick up changes made on another device when you come back to this tab
      document.addEventListener("visibilitychange", () => { if (!document.hidden && user) load(); });
    },
    save(data) {
      if (!client || !user) return;
      pending = data; clearTimeout(timer);
      timer = setTimeout(() => push(pending), 600);
    }
  };
})();
