// MIQ Study Assistant backend — admin upload + retrieval + modes (CommonJS)

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const OpenAI = require("openai");               // SDK v4 (CommonJS)
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const upload = multer({ dest: "/tmp" });

// ===== basic hardening & logging
process.on("unhandledRejection", (e) => {
  console.error("UNHANDLED REJECTION:", e);
});
process.on("uncaughtException", (e) => {
  console.error("UNCAUGHT EXCEPTION:", e);
});

// ===== config / env
const ORIGIN = process.env.ORIGIN || "https://apollo235298.github.io";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

app.use(cors({ origin: ORIGIN }));
app.use(bodyParser.json({ limit: "25mb" }));

// Persist vector store id (uses env if set; falls back to config.json on disk)
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

// ===== admin guard
function requireAdmin(req, res, next) {
  const token = req.query.token || req.headers["x-admin-token"] || (req.body && req.body.token);
  if (!ADMIN_TOKEN) return res.status(500).send("Admin not configured. Set ADMIN_TOKEN in Environment.");
  if (token !== ADMIN_TOKEN) return res.status(403).send("Forbidden: bad or missing token.");
  next();
}

// ===== admin UI (simple, no framework)
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

// create store
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

// upload PDFs (two-step: files.create → vectorStores.files.create)
// upload PDFs (two-step: files.create → vectorStores.files.create) with strict id checks
app.post('/admin/upload', requireAdmin, upload.array('files'), async (req, res) => {
  // Get and sanitize the vector store id
  const vsRaw = (getVectorStoreId && getVectorStoreId()) || process.env.VECTOR_STORE_ID || "";
  const vs = (typeof vsRaw === "string" ? vsRaw : (vsRaw && vsRaw.id) || "").toString().trim();

  // Validate it looks like an OpenAI vector store id
  if (!vs || !/^vs_[A-Za-z0-9_-]+$/.test(vs)) {
    return res
      .status(400)
      .send(`Vector store id is invalid. Got "${String(vsRaw)}". Make sure VECTOR_STORE_ID is a plain string like vs_abc123...`);
  }

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).send("No files received. Use the 'Choose Files' button, then click 'Upload PDFs'.");
    }

    const results = [];
    for (const f of req.files) {
      // 1) Upload the raw file to OpenAI
      const uploaded = await client.files.create({
        file: fs.createReadStream(f.path),
        purpose: "assistants"
      });

      // 2) Attach that file to the vector store
      await client.vectorStores.files.create({
        vector_store_id: vs,
        file_id: uploaded.id
      });

      results.push(`${f.originalname} → attached as ${uploaded.id}`);
      try { fs.unlinkSync(f.path); } catch {}
      console.log("UPLOAD OK:", f.originalname, "→", uploaded.id, "to", vs);
    }

    res.send("Uploaded:\n" + results.join("\n"));
  } catch (e) {
    console.error("UPLOAD ERROR:", e?.response?.data || e?.message || e);
    res.status(500).send("Upload failed: " + (e.message || e));
  }
});


// status
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("MIQ backend listening on :" + PORT));
