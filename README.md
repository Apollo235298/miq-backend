# MIQ Backend — Step 2 (Demo)

This gives you a working `/api/ask` endpoint so your Canvas iframe can receive a response.

## Deploy to Render (free tier)

1) Create a new GitHub repo (e.g., `miq-backend`). Upload **server.js** and **package.json** from this folder.
2) Go to https://render.com → New → **Web Service** → Connect your repo.
3) Settings during creation:
   - Runtime: **Node**
   - Build Command: *(leave blank — Render will run `npm install` automatically)*
   - Start Command: `node server.js`
   - Environment Variables:
     - `ORIGIN` = `https://apollo235298.github.io`   (allows your widget to call the API)
4) Click **Create Web Service**. Wait for the deploy to finish.
5) You’ll get a URL like `https://miq-backend-xyz.onrender.com`

## Test

Open your URL in a browser — you should see: “MIQ backend is running.”  
Your API endpoint is `https://YOUR-RENDER-URL/api/ask`.

## Connect the widget (Canvas iframe)

Edit your Canvas iframe to use your new endpoint:

```
<iframe
  src="https://apollo235298.github.io/miq-widget/widget.html?endpoint=REPLACE_WITH_YOUR_RENDER_URL/api/ask&course=ENGAGING-CULTURE&mode=default"
  width="100%"
  height="600"
  style="border:0; background:#f8f9fb;"
  title="MIQ Study Assistant">
</iframe>
```

Now type a question and click **Send** → you should see the demo response.

## Next (Step 3): Retrieval + Citations

After you confirm Step 2 works, we’ll:
- Ingest your PDFs into a managed vector store.
- Replace the demo handler with retrieval + model call that returns **citations** (chapter/page).
- Keep access locked to your Canvas students.
