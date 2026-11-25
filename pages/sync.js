/*
 * PageSync: saves a page's state to Supabase so it follows you across devices.
 * Needs the supabase-js UMD build loaded first:
 *   <script src="vendor/supabase-2.119.0.js"></script>
 *   <script src="sync.js?v=7"></script>
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
  .ps .link{justify-self:start;align-self:flex-start;background:none;border:0;padding:0;color:var(--accent,#2a7);font:inherit;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline}`;

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
        <span class="row"><button class="link" type="button" id="ps-pwbtn">Set password</button>
        <button class="link" type="button" id="ps-out">Sign out</button></span></div>
        <form id="ps-setpw" hidden><input type="password" id="ps-newpw" required minlength="8" placeholder="New password (8+ characters)" autocomplete="new-password" aria-label="New password">
        <button type="submit">Save password</button></form></div>`;
      m.querySelector("b").textContent = user.email || "you";
      ui.st = m.querySelector(".st"); ui.pw = m.querySelector("#ps-setpw");
      m.querySelector("#ps-out").onclick = async () => { await client.auth.signOut(); };
      m.querySelector("#ps-pwbtn").onclick = () => { ui.pw.hidden = !ui.pw.hidden; if (!ui.pw.hidden) m.querySelector("#ps-newpw").focus(); };
      // a password lets you sign in where you can't open your email (e.g. at work)
      ui.pw.onsubmit = async e => {
        e.preventDefault();
        status("Saving password…");
        const { error } = await client.auth.updateUser({ password: m.querySelector("#ps-newpw").value });
        if (error) { status("Couldn't set the password: " + error.message, "warn"); return; }
        ui.pw.hidden = true; m.querySelector("#ps-newpw").value = "";
        status("Password saved. Use it with your email to sign in on other devices.", "ok");
      };
    } else {
      m.innerHTML = `<div class="ps"><span class="st">Sign in to sync this page across your devices.</span>
        <form id="ps-send"><input type="email" id="ps-email" required placeholder="Email address" autocomplete="email" aria-label="Email address">
        <button type="submit">Email me a code</button></form>
        <form id="ps-verify" hidden><input id="ps-code" required inputmode="numeric" autocomplete="one-time-code" placeholder="Code from the email" aria-label="Sign-in code">
        <button type="submit">Sign in</button></form>
        <button class="link" type="button" id="ps-usepw">Have a password? Sign in with it</button>
        <form id="ps-pass" hidden><input type="password" id="ps-pw" required placeholder="Password" autocomplete="current-password" aria-label="Password">
        <button type="submit">Sign in</button></form></div>`;
      ui.st = m.querySelector(".st");
      const send = m.querySelector("#ps-send"), verify = m.querySelector("#ps-verify");
      let email = "";
      const pass = m.querySelector("#ps-pass"), usepw = m.querySelector("#ps-usepw");
      usepw.onclick = () => { pass.hidden = false; usepw.hidden = true; m.querySelector("#ps-email").focus(); };
      pass.onsubmit = async e => {
        e.preventDefault();
        const em = m.querySelector("#ps-email");
        if (!em.reportValidity()) return;
        status("Signing in…");
        const { error } = await client.auth.signInWithPassword({ email: em.value.trim(), password: m.querySelector("#ps-pw").value });
        if (error) status("Couldn't sign in: " + error.message, "warn");
      };
      send.onsubmit = async e => {
        e.preventDefault();
        email = m.querySelector("#ps-email").value.trim();
        status("Sending…");
        const { error } = await client.auth.signInWithOtp({
          email, options: { emailRedirectTo: location.origin + location.pathname }
        });
        if (error) { status("Couldn't send the email: " + error.message, "warn"); return; }
        status("Check your email (on any device). Type the code here, or open the link on this device.", "ok");
        verify.hidden = false; m.querySelector("#ps-code").focus();
      };
      // the code lets you sign in here while reading the email somewhere else (e.g. your phone)
      verify.onsubmit = async e => {
        e.preventDefault();
        const token = m.querySelector("#ps-code").value.replace(/\s/g, "");
        status("Checking code…");
        const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
        if (error) status("That code didn't work: " + error.message, "warn");
      };
    }
  }

  function refresh() { if (user && !(ui.pw && !ui.pw.hidden)) render(); }

  async function load() {
    if (!user) return;
    status("Loading…");
    const { data, error } = await client.from("page_state").select("data").eq("page", opts.page).maybeSingle();
    if (error) { status("Offline. Changes are saved on this device only.", "warn"); return; }
    if (data) { lastSaved = JSON.stringify(data.data); opts.onData && opts.onData(data.data); }
    else if (opts.initial) { await push(opts.initial()); } // first sign-in: upload what this device has
    status("Synced", "ok");
    refresh();
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
    setTimeout(refresh, 1200);
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
