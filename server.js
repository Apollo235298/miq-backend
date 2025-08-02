// Minimal MIQ Study Assistant Backend (Step 2: demo response)
// After deploy, your endpoint will be: https://YOUR-RENDER-URL/api/ask
// The widget calls this with { question, course, mode }.

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Allow only your GitHub Pages origin by default.
// Change ORIGIN env var if you host the widget elsewhere.
const ORIGIN = process.env.ORIGIN || 'https://apollo235298.github.io';
app.use(cors({ origin: ORIGIN }));
app.use(bodyParser.json({ limit: '2mb' }));

// Health check
app.get('/', (req, res) => res.send('MIQ backend is running.'));

// Demo endpoint
app.post('/api/ask', async (req, res) => {
  const { question = '', course = 'ENGAGING-CULTURE', mode = 'default' } = req.body || {};

  // This is a placeholder response so you can confirm the end-to-end flow in Canvas.
  // In Step 3, we will replace this with retrieval + model call that returns citations.
  const bullets = mode === 'socratic'
    ? [
        "Question 1: Where in the chapter does the author reframe a familiar situation?",
        "Question 2: Which assumption is being challenged, and how does that change the response?"
      ]
    : mode === 'studyplan'
      ? [
          "Read: Chapter section most relevant to your question (10–15 min).",
          "Reflect: Write two sentences that connect the key idea to your context.",
          "Practice: Identify one conversation/setting this week to apply it."
        ]
      : [
          "Key idea stated in 1–2 sentences.",
          "Two concrete takeaways you can act on.",
          "Pointer to the most relevant section for deeper reading."
        ];

  const demo = {
    answer:
`You asked: "${question || '(no question)'}"
Course: ${course}
Mode: ${mode}

This is a demo answer from your backend. In Step 3, this will be replaced by a sourced answer with chapter/page citations.

Next actions:
— Confirm this response appears inside Canvas when you click Send.
— Then we will connect retrieval so the answer is drawn from your PDFs.`,
    citations: [
      { chapter: 1, page: 2, snippet: "Sample snippet placeholder (citations will come from your PDFs in Step 3)." }
    ],
    bullets
  };

  res.json(demo);
});

// Render/Heroku/Railway will set PORT for you.
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MIQ backend listening on port ${PORT}`);
});
