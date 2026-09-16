const express = require("express");
const path = require("path");

const app = express();
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`vibe-check listening on ${port}`));
