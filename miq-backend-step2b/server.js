// MIQ Study Assistant Backend — Step 2b (Real AI answers, no PDFs yet)
// Works with Manual Deploy on Render via ZIP upload.
// Start command: node server.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const OpenAI = require('openai');

const app = express();

// Allow only your widget origin (GitHub Pages) to call this API.
const ORIGIN = process.env.ORIGIN || 'https://apollo235298.github.io';
app.use(cors({ origin: ORIGIN }));
app.use(bodyParser.json({ limit: '2mb' }));

// OpenAI client (key must be set as an Environment Variable on Render)
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get('/', (req, res) => res.send('MIQ backend is running.'));

app.post('/api/ask', async (req, res) => {
  const { question = "", course = "ENGAGING-CULTURE", mode = "default" } = req.body || {};

  const system = `You are the MIQ Study Assistant. Be concise, clear, and helpful.
If context from readings is missing, say what is needed and ask a short follow-up.
(Next step will add retrieval from course PDFs.)`;

  try {
    const resp = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: `Course: ${course}\nMode: ${mode}\nQuestion: ${question}` }
      ]
    });

    const text = resp.output_text || "No answer returned.";
    res.json({ answer: text, citations: [] });
  } catch (err) {
    console.error(err);
    const msg = (err && err.message) ? err.message : "Unknown server error";
    res.status(500).json({ answer: "Sorry—there was a server error: " + msg, citations: [] });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('MIQ backend listening on :' + PORT));
