// MIQ Study Assistant backend — admin upload + retrieval + modes (CommonJS)

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const OpenAI = require("openai"); // OpenAI SDK v4 (CommonJS)

// --- OpenAI client
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();

// Save uploaded files to disk under /tmp (Render ephemeral disk)
const upload = multer({ dest: "/tmp" });

// Log unhandled errors to Render logs for easier debugging
process.on("unhandledRejection", (e) => console.error("UNHANDLED REJECTION:", e));
process.on("uncaughtException", (e) => console.error("UNCAUGHT EXCEPTION:", e));

// ===== config / env
const ORIGIN = process.env.ORIGIN || "https://apollo235298.github.io"; // or your Canvas domain
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // e.g., "miq-admin-2025"

app.use(cors({ origin: ORIGIN }));
app.use(bodyParser.json({ limit: "25mb" }));

// ===== tiny config store for VECTOR_STORE_ID (env wins)
const CONFIG_PATH = path.join(__dirname, "config.json");
function getVectorStoreId() {
  if (process.env.VECTOR_STORE_ID) return process.env.VECTOR_STORE_ID;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return cfg.vectorStoreId || null;
  } catch {
    return null;
  }
}
function setVectorStoreId(id) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ vectorStoreId: id }, null, 2));
  } catch (e) {
    console.error("Failed writing config.json:", e.message);
  }
}

// ===== health
app.get("/", (_req, res) => res.send("MIQ backend is running."));
app.get("/healthz", (_req, res) => res.json({ ok: true }));

// ===== user API (widget calls this)
app.post("/api/ask", async (req, res) => {
  const { question = "", course = "ENGAGING-CULTURE", mode = "default" } = req.body || {};
  const vs = getVectorStoreId();
  const haveStore = !!vs;

  const system = `
You are the MIQ Study Assistant for the course "${course}".
Answer ONLY from retrieved course readings when available. Be concise.
Always include citations when possible (chapter/page).
Modes:
- default: concise answer + 2–3 takeaways.
- socratic: begin with 1–2 guiding questions, then a brief sourced note.
- studyplan: 3–5 steps (read → reflect → practice) with citations.
If evidence is insufficient, say so and suggest where to look.
  `.trim();

  try {
    const request = {
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: `Mode: ${mode}\nQuestion: ${question}` }
      ]
    };

    if (haveStore) {
      request.tools = [{ type: "file_search" }];
      request.attachments = [{ vector_store_id: vs }];
    }

    const resp = await client.responses.create(request);
    const text = resp.output_text || "No answer returned.";
    res.json({ answer: text, citations: [] });
  } catch (err) {
    console.error("ASK ERROR:", err?.response?.data || err?.message || err);
    res.status(500).json({ answer: "Sorry—there was a server error.", citations: [] });
  }
});

// ===== admin auth guard
function requireAdmin(req, res, next) {
  const token = req.query.token || req.headers["x-admin-token"] || (req.body && req.body.token);
  if (!ADMIN_TOKEN) return res.status(500).send("Admin not configured. Set ADMIN_TOKEN in Environment.");
  if (token !== ADMIN_TOKEN) return res.status(403).send("Forbidden: bad or missing token.");
  next();
}

// ===== admin UI
app.get("/admin", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html>
<meta charset="utf-8">
<title>MIQ Admin</title>
<style>
  body{font-family:system-ui;margin:24px;line-height:1.5;max-width:920px}
  input,button{font:inherit;padding:8px 10px}
  .card{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  #log{white-space:pre-wrap;background:#f9fafb;border:1px solid #eee;border-radius:8px;padding:10px}
  button{background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px}
</style>
<h1>MIQ Admin</h1>
<p>Create your vector store and upload PDFs (no CLI needed).</p>
<div class="card">
  <div class="row">
    <label>Admin token <input id="token" placeholder="enter your admin token" /></label>
    <button onclick="createStore()">1) Create Vector Store</button>
  </div>
  <div class="row" style="margin-top:8px">
    <input type="file" id="files" multiple accept="application/pdf">
    <button onclick="uploadFiles()">2) Upload PDFs</button>
    <button onclick="statusStore()">Check Status</button>
  </div>
  <div id="log" style="margin-top:10px"></div>
</div>
<script>
const log = (m)=>{ document.getElementById('log').textContent += m + "\\n"; }
async function createStore(){
  const token = document.getElementById('token').value.trim();
  if(!token){ alert('Enter admin token'); return; }
  log('Creating vector store...');
  const r = await fetch('/admin/create?token='+encodeURIComponent(token), { method:'POST' });
  const t = await r.text(); log(t);
}
async function uploadFiles(){
  const token = document.getElementById('token').value.trim();
  if(!token){ alert('Enter admin token'); return; }
  const f = document.getElementById('files').files;
  if(!f.length){ alert('Choose one or more PDFs'); return; }
  const fd = new FormData();
  for(const x of f) fd.append('files', x);
  log('Uploading '+f.length+' file(s)...');
  const r = await fetch('/admin/upload?token='+encodeURIComponent(token), { method:'POST', body: fd });
  const t = await r.text(); log(t);
}
async function statusStore(){
  const token = document.getElementById('token').value.trim();
  if(!token){ alert('Enter admin token'); return; }
  const r = await fetch('/admin/status?token='+encodeURIComponent(token));
  const t = await r.text(); log(t);
}
</script>
`);
});

// ===== create vector store
app.post("/admin/create", requireAdmin, async (_req, res) => {
  try {
    const created = await client.vectorStores.create({ name: "ENGAGING-CULTURE" });
    setVectorStoreId(created.id);
    res.send(`Vector store created: ${created.id}
(Also add VECTOR_STORE_ID=${created.id} to Render → Environment for persistence.)`);
  } catch (e) {
    console.error("CREATE STORE ERROR:", e?.response?.data || e?.message || e);
    res.status(500).send("Failed to create store: " + (e.message || e));
  }
});

// ===== upload PDFs (per-file; read from /tmp; Files API -> attach to vector store)
app.post("/admin/upload", requireAdmin, upload.array("files"), async (req, res) => {
  const errText = (e) =>
    (e?.response?.data?.error?.message) ||
    (e?.response?.data && JSON.stringify(e.response.data)) ||
    e?.message ||
    String(e);

  try {
    // 1) Resolve/validate vector store id
    const vsRaw = (getVectorStoreId && getVectorStoreId()) || process.env.VECTOR_STORE_ID || "";
    const vs = (typeof vsRaw === "string" ? vsRaw : (vsRaw && vsRaw.id) || "").toString().trim();
    if (!/^vs_[A-Za-z0-9_-]+$/.test(vs)) {
      return res
        .status(400)
        .send(`Vector store id is invalid. Got "${String(vsRaw)}". Set VECTOR_STORE_ID to an id like vs_abc123...`);
    }

    // 2) Ensure files exist
    if (!req.files || !req.files.length) {
      return res.status(400).send("No files received. Use 'Choose Files' first, then click 'Upload PDFs'.");
    }

    const lines = [];

    // 3) Upload each file from its TEMP PATH, then attach to the vector store
    for (const f of req.files) {
      const tmp = f.path; // e.g., /tmp/xxxx
      const original = f.originalname || path.basename(tmp);

      try {
        if (!fs.existsSync(tmp)) {
          lines.push(`✗ "${original}" failed: temp file not found at ${tmp}`);
          continue;
        }

        // Always read from the temp path (fixes ENOENT)
        const stream = fs.createReadStream(tmp);

        // Step A: upload to Files API
        const uploadedFile = await client.files.create({
          file: stream,
          purpose: "assistants"
        });

        // Step B: attach to the vector store by file_id
        await client.vectorStores.files.create(vs, { file_id: uploadedFile.id });

        lines.push(`✓ Uploaded "${original}" → file_id=${uploadedFile.id}`);
      } catch (e) {
        lines.push(`✗ "${original}" failed: ${errText(e)}`);
      } finally {
        try { fs.unlinkSync(tmp); } catch {}
      }
    }

    // 4) Show current store contents
    try {
      const list = await client.vectorStores.files.list(vs);
      lines.push(`Store now has ${list.data.length} file(s).`);
      for (const x of list.data) lines.push(`- ${x.id} (${x.status})`);
    } catch (e) {
      lines.push(`(Could not list store files: ${errText(e)})`);
    }

    res.send(lines.join("\n"));
  } catch (e) {
    const msg = errText(e);
    console.error("UPLOAD ERROR (verbose):", msg);
    res.status(500).send("Upload failed: " + msg);
  }
});

// ===== status
app.get("/admin/status", requireAdmin, async (_req, res) => {
  const vs = getVectorStoreId();
  if (!vs) return res.send("No vector store configured yet.");
  try {
    const list = await client.vectorStores.files.list(vs);
    res.send(`Vector store: ${vs}
Files: ${list.data.length}
` + list.data.map(x => `- ${x.id} (${x.status})`).join("\n"));
  } catch (e) {
    console.error("STATUS ERROR:", e?.response?.data || e?.message || e);
    res.status(500).send("Status error: " + (e.message || e));
  }
});

// ===== quick diagnostics (prove key + store are usable)
app.get("/admin/diag", requireAdmin, async (_req, res) => {
  try {
    await client.models.list(); // simple call to verify key
    const vs = (getVectorStoreId && getVectorStoreId()) || process.env.VECTOR_STORE_ID || "";
    let filesLine = "n/a (no store)";
    if (vs) {
      const list = await client.vectorStores.files.list(vs);
      filesLine = `${list.data.length} file(s)`;
    }
    res.send(`OpenAI key: OK
Vector store: ${vs || "(none)"}
Files: ${filesLine}`);
  } catch (e) {
    const msg =
      e?.response?.data?.error?.message ||
      e?.response?.data ||
      e?.message ||
      String(e);
    res.status(500).send("Diag failed: " + msg);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MIQ backend listening on :" + PORT));

