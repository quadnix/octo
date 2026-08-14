/**
 * The report's entire stylesheet, inlined.
 *
 * Inlined on purpose: the previous reporter pulled Tailwind and jsondiffpatch CSS from CDNs, so the
 * report did not render offline, in CI, or on a locked-down network — exactly where a change report
 * is most needed. Everything here must stay self-contained.
 */
export const REPORT_STYLES = `
:root {
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface-2: #f0f2f5;
  --border: #d9dde3;
  --text: #1c2024;
  --text-dim: #626b76;
  --create: #1a7f37;
  --create-bg: #dafbe1;
  --update: #9a6700;
  --update-bg: #fff8c5;
  --delete: #cf222e;
  --delete-bg: #ffebe9;
  --recreate: #8250df;
  --recreate-bg: #f3eefd;
  --other: #626b76;
  --other-bg: #eef1f4;
  --accent: #0969da;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface-2: #1c232c;
    --border: #30363d;
    --text: #e6edf3;
    --text-dim: #9198a1;
    --create: #3fb950;
    --create-bg: #12261a;
    --update: #d29922;
    --update-bg: #2b2413;
    --delete: #f85149;
    --delete-bg: #2d1618;
    --recreate: #a371f7;
    --recreate-bg: #21193a;
    --other: #9198a1;
    --other-bg: #21262d;
    --accent: #58a6ff;
  }
}

* { box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
  padding: 24px 16px 64px;
}

.wrap { margin: 0 auto; max-width: 1100px; }

code, .mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12.5px;
}

/* ---- top strip ---- */

.strip {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 20px;
  overflow: hidden;
}
.strip-top {
  align-items: baseline;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 14px 18px;
}
.strip-app { font-size: 17px; font-weight: 650; }
.strip-meta { color: var(--text-dim); font-size: 12.5px; }
.strip-body { padding: 16px 18px; }
.headline { font-size: 16px; font-weight: 500; margin: 0 0 14px; }

.counters { display: flex; flex-wrap: wrap; gap: 8px; }
.counter {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  display: inline-flex;
  font-weight: 600;
  gap: 6px;
  padding: 4px 12px;
}
.counter .n { font-size: 15px; }
.counter.create { background: var(--create-bg); color: var(--create); }
.counter.update { background: var(--update-bg); color: var(--update); }
.counter.recreate { background: var(--recreate-bg); color: var(--recreate); }
.counter.delete { background: var(--delete-bg); color: var(--delete); border-color: var(--delete); }
.counter.other { background: var(--other-bg); color: var(--other); }
.counter.drift { background: var(--delete-bg); color: var(--delete); border-color: var(--delete); }
.counter.zero { background: var(--surface-2); color: var(--text-dim); font-weight: 500; }

.badge {
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .5px;
  padding: 2px 8px;
  text-transform: uppercase;
}
.badge.clean { background: var(--create-bg); color: var(--create); }
.badge.changes { background: var(--update-bg); color: var(--update); }
.badge.drift, .badge.failed { background: var(--delete-bg); color: var(--delete); }
.badge.exact { background: var(--create-bg); color: var(--create); }
.badge.approximate { background: var(--update-bg); color: var(--update); }
.badge.sdk { background: var(--recreate-bg); color: var(--recreate); }

.note-approx {
  background: var(--update-bg);
  border-radius: 8px;
  color: var(--update);
  font-size: 12.5px;
  margin-top: 14px;
  padding: 10px 12px;
}

/* ---- controls ---- */

.controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.controls input {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  flex: 1 1 260px;
  font-size: 13px;
  padding: 7px 11px;
}
.controls button {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  cursor: pointer;
  font-size: 12.5px;
  padding: 7px 12px;
}
.controls button:hover { background: var(--surface-2); }

/* ---- sections ---- */

h2 {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .8px;
  margin: 26px 0 10px;
  text-transform: uppercase;
  color: var(--text-dim);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 9px;
  margin-bottom: 10px;
  overflow: hidden;
}
.card[hidden] { display: none; }

details > summary { cursor: pointer; list-style: none; }
details > summary::-webkit-details-marker { display: none; }

.story-head {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 15px;
}
.story-head:hover { background: var(--surface-2); }
.story-title { font-weight: 600; }
.story-ctx { color: var(--text-dim); }
.story-mod { color: var(--text-dim); font-size: 12px; margin-left: auto; }
.chev { color: var(--text-dim); font-size: 11px; }
details[open] .chev { transform: rotate(90deg); }
.chev { display: inline-block; transition: transform .12s; }

.mini { display: inline-flex; gap: 5px; }
.mini span {
  border-radius: 4px;
  font-size: 11.5px;
  font-weight: 700;
  padding: 1px 6px;
}
.mini .create { background: var(--create-bg); color: var(--create); }
.mini .update { background: var(--update-bg); color: var(--update); }
.mini .recreate { background: var(--recreate-bg); color: var(--recreate); }
.mini .delete { background: var(--delete-bg); color: var(--delete); }
.mini .other { background: var(--other-bg); color: var(--other); }

.why {
  background: var(--surface-2);
  border-left: 3px solid var(--accent);
  color: var(--text-dim);
  font-size: 12.5px;
  margin: 0 15px 12px;
  padding: 8px 11px;
}
.why b { color: var(--text); font-weight: 600; }

.story-body { border-top: 1px solid var(--border); padding: 12px 15px; }

.res { border-left: 2px solid var(--border); margin-bottom: 14px; padding-left: 12px; }
.res:last-child { margin-bottom: 0; }
.res-head { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; }
.res-name { font-weight: 600; }
.res-none { color: var(--text-dim); font-size: 12.5px; font-style: italic; padding: 3px 0 0 18px; }

.sym {
  display: inline-block;
  font-weight: 700;
  text-align: center;
  width: 13px;
}
.sym.create { color: var(--create); }
.sym.update { color: var(--update); }
.sym.recreate { color: var(--recreate); }
.sym.delete { color: var(--delete); }
.sym.other { color: var(--other); }

.tf { margin-top: 6px; }
.tf-row { padding: 2px 0 2px 18px; }
.tf-addr { word-break: break-all; }
.tf-why {
  color: var(--text-dim);
  font-size: 12px;
  padding: 0 0 3px 49px;
}
.tf-why::before { content: "↳ "; }

.sdk {
  background: var(--recreate-bg);
  border-radius: 6px;
  color: var(--recreate);
  font-size: 12.5px;
  margin: 6px 0 0 18px;
  padding: 6px 10px;
}
.sdk .err { color: var(--delete); font-weight: 600; }

.zone-row { padding: 7px 15px; }
.zone-row + .zone-row { border-top: 1px solid var(--border); }
.zone-why { color: var(--text-dim); font-size: 12px; padding: 2px 0 0 31px; }
.zone-mod { color: var(--text-dim); font-size: 12px; }

.guidance {
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  font-size: 12.5px;
  padding: 11px 15px;
}
.guidance b { display: block; margin-bottom: 4px; }
.guidance ul { margin: 0; padding-left: 18px; }

table { border-collapse: collapse; font-size: 12.5px; width: 100%; }
th, td { border-bottom: 1px solid var(--border); padding: 7px 15px; text-align: left; }
th { color: var(--text-dim); font-size: 11px; letter-spacing: .5px; text-transform: uppercase; }
tr:last-child td { border-bottom: none; }

.scroll-x { overflow-x: auto; }
.empty { color: var(--text-dim); font-style: italic; padding: 11px 15px; }
.footer { color: var(--text-dim); font-size: 12px; margin-top: 32px; text-align: center; }
`;
