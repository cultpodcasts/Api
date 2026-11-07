/** The demo search page: Auth0 SPA login + D1 FTS5 search UI. Config injected from Worker vars. */
export function renderPage(cfg: { domain: string; clientId: string; audience: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"> <!-- pragma: allowlist secret -->
<title>Cult Podcasts — D1 search demo</title> <!-- pragma: allowlist secret -->
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 system-ui, sans-serif; background: #111418; color: #e6e9ee; }
  header { display: flex; gap: 12px; align-items: center; padding: 14px 20px; background: #191e24; border-bottom: 1px solid #2a3139; position: sticky; top: 0; }
  header h1 { font-size: 16px; margin: 0 8px 0 0; white-space: nowrap; }
  header h1 span { color: #f6b73c; }
  #q { flex: 1; max-width: 560px; padding: 9px 13px; border-radius: 8px; border: 1px solid #3a434e; background: #0d1014; color: inherit; font-size: 15px; }
  button { padding: 8px 14px; border-radius: 8px; border: 1px solid #3a434e; background: #232a32; color: inherit; cursor: pointer; }
  button:hover { background: #2c343e; }
  #user { margin-left: auto; font-size: 13px; color: #9aa4b0; }
  main { display: grid; grid-template-columns: 240px 1fr; gap: 20px; padding: 20px; max-width: 1200px; margin: 0 auto; }
  @media (max-width: 800px) { main { grid-template-columns: 1fr; } }
  #status { grid-column: 1 / -1; font-size: 13px; color: #9aa4b0; }
  .facet h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #9aa4b0; margin: 16px 0 6px; }
  .facet a { display: flex; justify-content: space-between; gap: 8px; color: #cdd5de; text-decoration: none; padding: 3px 6px; border-radius: 6px; font-size: 13px; } /* pragma: allowlist secret */
  .facet a:hover, .facet a.on { background: #232a32; color: #fff; }
  .facet a span { color: #77828e; }
  .card { display: flex; gap: 14px; padding: 14px; border: 1px solid #262d35; border-radius: 10px; margin-bottom: 12px; background: #161b20; }
  .card img { width: 72px; height: 72px; border-radius: 8px; object-fit: cover; background: #0d1014; flex: none; }
  .card h2 { font-size: 15px; margin: 0 0 2px; }
  .card .meta { font-size: 12.5px; color: #9aa4b0; margin-bottom: 6px; }
  .card .meta b { color: #f6b73c; font-weight: 600; }
  .card p { margin: 0; font-size: 13.5px; color: #b9c2cc; }
  .card p b { color: #ffd66e; }
  .chips { margin-top: 6px; }
  .chips i { display: inline-block; font-style: normal; font-size: 11.5px; background: #20272f; border-radius: 999px; padding: 2px 8px; margin: 2px 4px 0 0; color: #9fb2c5; }
  #pager { display: flex; gap: 10px; align-items: center; margin: 14px 0 40px; }
  #gate { padding: 60px 20px; text-align: center; }
  #gate p { color: #9aa4b0; }
</style>
</head>
<body>
<header>
  <h1>Cult<span>Podcasts</span> · D1 demo</h1> <!-- pragma: allowlist secret -->
  <input id="q" type="search" placeholder="Search 89,245 playables — full descriptions, guests, subjects…" disabled> <!-- pragma: allowlist secret -->
  <button id="go" disabled>Search</button>
  <span id="user"></span>
  <button id="login" hidden>Sign in</button>
  <button id="logout" hidden>Sign out</button>
</header>
<div id="gate"><p>Checking session…</p></div>
<main id="app" hidden>
  <div id="status"></div>
  <aside>
    <div class="facet"><h3>Kind</h3><div id="f-kind"></div></div>
    <div class="facet"><h3>Subjects</h3><div id="f-subjects"></div></div> <!-- pragma: allowlist secret -->
    <div class="facet"><h3>Language</h3><div id="f-lang"></div></div>
  </aside>
  <section>
    <div id="results"></div>
    <div id="pager" hidden>
      <button id="prev">← Prev</button><span id="page"></span><button id="next">Next →</button>
    </div>
  </section>
</main>
<script src="https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js"></script>
<script>
const CFG = ${JSON.stringify(cfg)};
const TOP = 20;
let auth0c, skip = 0, filters = { kind: null, subject: null, lang: null };

function expandImage(image, youtubeId) {
  if (!image || image.startsWith("http")) return image;
  const p = image.slice(1);
  switch (image[0]) {
    case "y": {
      const q = { x: "maxresdefault", s: "sddefault", h: "hqdefault", m: "mqdefault", d: "default" }[p];
      return q && youtubeId ? \`https://i.ytimg.com/vi/\${youtubeId}/\${q}.jpg\` : "";
    }
    case "s": return \`https://i.scdn.co/image/\${p}\`;
    case "a": return \`https://is\${p[0]}-ssl.mzstatic.com/image/thumb/\${p.slice(1)}\`;
    default: return "";
  }
}
const esc = (s) => (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const allowSnippet = (s) => esc(s).replaceAll("&lt;b&gt;", "<b>").replaceAll("&lt;/b&gt;", "</b>");

async function search() {
  const q = document.getElementById("q").value.trim();
  const params = new URLSearchParams({ top: TOP, skip, facets: "true" });
  if (q) params.set("q", q);
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const token = await auth0c.getTokenSilently({ authorizationParams: { audience: CFG.audience } });
  const t0 = performance.now();
  const res = await fetch("/search?" + params, { headers: { authorization: "Bearer " + token } });
  if (!res.ok) {
    document.getElementById("status").textContent = \`\${res.status}: \${await res.text()}\`;
    return;
  }
  const body = await res.json();
  const ms = Math.round(performance.now() - t0);
  const count = body["@odata.count"];
  document.getElementById("status").textContent =
    \`\${count.toLocaleString()} results · server \${body.elapsedMs} ms · round-trip \${ms} ms\` +
    (Object.values(filters).some(Boolean) ? " · filters: " + Object.entries(filters).filter(([, v]) => v).map(([k, v]) => k + "=" + v).join(", ") : "");
  document.getElementById("results").innerHTML = body.value.map((v) => {
    const img = expandImage(v.image, v.youtubeId);
    return \`<div class="card">
      \${img ? \`<img loading="lazy" src="\${esc(img)}" alt="">\` : \`<img alt="">\`}
      <div>
        <h2>\${esc(v.title)}</h2>
        <div class="meta"><b>\${esc(v.seriesName ?? v.contentKind)}</b> · \${esc(v.contentKind)} · \${v.release.slice(0, 10)} · \${esc(v.duration)}\${v.lang ? " · " + esc(v.lang) : ""}</div> <!-- pragma: allowlist secret -->
        <p>\${allowSnippet(v.description)}</p>
        <div class="chips">\${(v.subjects ?? []).map((s) => \`<i>\${esc(s)}</i>\`).join("")}</div> <!-- pragma: allowlist secret -->
      </div>
    </div>\`;
  }).join("") || "<p>No results.</p>";
  const facet = (rows, key) => (rows ?? []).map((r) =>
    \`<a href="#" data-k="\${key}" data-v="\${esc(r.value)}" class="\${filters[key] === r.value ? "on" : ""}"><em>\${esc(r.value)}</em><span>\${r.count.toLocaleString()}</span></a>\`).join("");
  const f = body["@search.facets"] ?? {};
  document.getElementById("f-kind").innerHTML = facet(f.contentKind, "kind"); // pragma: allowlist secret
  document.getElementById("f-subjects").innerHTML = facet(f.subjects, "subject"); // pragma: allowlist secret
  document.getElementById("f-lang").innerHTML = facet(f.lang, "lang");
  const pager = document.getElementById("pager");
  pager.hidden = count <= TOP;
  document.getElementById("page").textContent = \`\${skip + 1}–\${Math.min(skip + TOP, count)} of \${count.toLocaleString()}\`;
  document.getElementById("prev").disabled = skip === 0;
  document.getElementById("next").disabled = skip + TOP >= count;
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-k]");
  if (!a) return;
  e.preventDefault();
  const k = a.dataset.k;
  filters[k] = filters[k] === a.dataset.v ? null : a.dataset.v;
  skip = 0;
  search();
});
document.getElementById("go").onclick = () => { skip = 0; filters = { kind: null, subject: null, lang: null }; search(); };
document.getElementById("q").addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("go").click(); });
document.getElementById("prev").onclick = () => { skip = Math.max(0, skip - TOP); search(); };
document.getElementById("next").onclick = () => { skip += TOP; search(); };

(async () => {
  auth0c = await auth0.createAuth0Client({
    domain: CFG.domain,
    clientId: CFG.clientId,
    cacheLocation: "localstorage",
    useRefreshTokens: true,
    authorizationParams: {
      redirect_uri: location.origin,
      audience: CFG.audience,
      scope: "openid profile email offline_access curate admin submit",
    },
  });
  if (location.search.includes("code=") && location.search.includes("state=")) {
    try {
      await auth0c.handleRedirectCallback();
    } catch (e) {
      // The zone's bot challenge can replay the callback navigation; the second
      // pass finds the one-time auth transaction already consumed and throws
      // "Invalid state". Tokens from the first pass are already cached, so
      // clean the URL and let isAuthenticated() decide.
      console.warn("redirect callback failed (continuing):", e);
    }
    history.replaceState({}, "", "/");
  }
  const authed = await auth0c.isAuthenticated();
  const gate = document.getElementById("gate");
  document.getElementById("login").hidden = authed;
  document.getElementById("logout").hidden = !authed;
  document.getElementById("login").onclick = () => auth0c.loginWithRedirect();
  document.getElementById("logout").onclick = () => auth0c.logout({ logoutParams: { returnTo: location.origin } });
  if (!authed) {
    gate.innerHTML = "<p>Sign in with your Cult Podcasts Auth0 account to search.</p>"; // pragma: allowlist secret
    return;
  }
  const user = await auth0c.getUser();
  document.getElementById("user").textContent = user?.email ?? user?.name ?? "";
  gate.hidden = true;
  document.getElementById("app").hidden = false;
  document.getElementById("q").disabled = false;
  document.getElementById("go").disabled = false;
  search();
})();
</script>
</body>
</html>`;
}
