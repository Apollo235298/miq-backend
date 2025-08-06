// MIQ Study Assistant Backend — Step 3 (Admin upload + Retrieval + Modes)
// This version adds a simple admin page to create a vector store and upload PDFs
// — no local CLI needed. Protect it with ADMIN_TOKEN env var.
//
// Env vars to set on Render:
//   OPENAI_API_KEY   = your OpenAI key
//   ORIGIN           = https://apollo235298.github.io   (for the widget)
//   ADMIN_TOKEN      = a short passphrase you choose (to guard /admin)
// Optional:
//   VECTOR_STORE_ID  = vs_...  (if set, used instead of config file)
//
// Start command: node server.js

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const OpenAI = require('openai');

const app = express();
const upload = multer({ dest: '/tmp' });

const ORIGIN = process.env.ORIGIN || 'https://apollo235298.github.io';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors({ origin: ORIGIN }));
app.use(bodyParser.json({ limit: '10mb' }));

// --- tiny config helper (stores vectorStoreId if not in env) ---
const CONFIG_PATH = path.join(__dirname, 'config.json');
function getVectorStoreId() {
  if (process.env.VECTOR_STORE_ID) return process.env.VECTOR_STORE_ID;
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return cfg.vectorStoreId || null;
  } catch { return null; }
}
function setVectorStoreId(id) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ vectorStoreId: id }, null, 2));
  } catch (e) {
    console.error('Failed to write config.json:', e.message);
  }
}

// ------------------ Public endpoints ------------------
app.get('/', (req, res) => res.send('MIQ backend is running.'));

app.post('/api/ask', async (req, res) => {
  const { question = "", course = "ENGAGING-CULTURE", mode = "default" } = req.body || {};
  const vectorStoreId = getVectorStoreId();
  const haveStore = !!vectorStoreId;

  const system = `You are the MIQ Study Assistant for the course "${course}".
Answer ONLY from the retrieved course readings when available.
Always be concise and include citations when possible (chapter/page).
Modes:
- default: concise answer + 2–3 takeaways.
- socratic: begin with 1–2 guiding questions, then a brief sourced note.
- studyplan: 3–5 steps (read → reflect → practice) with citations.
If evidence is insufficient, say so and suggest where to look.`;

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
      request.attachments = [{ vector_store_id: vectorStoreId }];
    }

    const resp = await client.responses.create(request);
    const text = resp.output_text || "No answer returned.";

    // NOTE: For simplicity we return only text here.
    // In a later step we can parse tool outputs to surface per-chunk citations.
    res.json({ answer: text, citations: [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ answer: "Sorry—there was a server error.", citations: [] });
  }
});

// ------------------ Admin endpoints ------------------
function requireAdmin(req, res, next) {
  const token = req.query.token || req.headers['x-admin-token'] || (req.body && req.body.token);
  if (!ADMIN_TOKEN) return res.status(500).send("Admin not configured. Set ADMIN_TOKEN on the server.");
  if (token !== ADMIN_TOKEN) return res.status(403).send("Forbidden: bad or missing token.");
  next();
}

// simple admin UI
app.get('/admin', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<meta charset="utf-8">
<title>MIQ Admin</title>
<style>
  body{font-family:system-ui;margin:24px;line-height:1.5;max-width:880px}
  input,button{font:inherit;padding:8px 10px}
  .card{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0}
  .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  #log{white-space:pre-wrap;background:#f9fafb;border:1px solid #eee;border-radius:8px;padding:8px}
</style>
<h1>MIQ Admin</h1>
<p>Use this once per course to create a vector store and upload PDFs.</p>
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
app.post('/admin/create', requireAdmin, async (req, res) => {
  try {
    const created = await client.vectorStores.create({ name: "ENGAGING-CULTURE" });
    setVectorStoreId(created.id);
    res.send(`Vector store created: ${created.id}\n(Also add VECTOR_STORE_ID=${created.id} to your Render Environment for persistence.)`);
  } catch (e) {
    console.error(e);
    res.status(500).send('Failed to create store: ' + (e.message || e));
  }
});

// upload PDFs
app.post('/admin/upload', requireAdmin, upload.array('files'), async (req, res) => {
  const vs = getVectorStoreId();
  if (!vs) return res.status(400).send('No vector store set. Click "Create Vector Store" first.');
  try {
    const results = [];
    for (const f of req.files || []) {
      const up = await client.vectorStores.files.upload({
        vector_store_id: vs,
        file: fs.createReadStream(f.path)
      });
      results.push(`${f.originalname} -> uploaded (${up.id})`);
      try { fs.unlinkSync(f.path); } catch {}
    }
    res.send('Uploaded:\n' + results.join('\n'));
  } catch (e) {
    console.error(e);
    res.status(500).send('Upload failed: ' + (e.message || e));
  }
});

// status
app.get('/admin/status', requireAdmin, async (req, res) => {
  const vs = getVectorStoreId();
  if (!vs) return res.send('No vector store configured yet.');
  try {
    const list = await client.vectorStores.files.list(vs);
    res.send(`Vector store: ${vs}\nFiles: ${list.data.length}\n` + list.data.map(x => `- ${x.id} (${x.status})`).join('\n'));
  } catch (e) {
    console.error(e);
    res.status(500).send('Status error: ' + (e.message || e));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('MIQ backend (admin) listening on :' + PORT));
