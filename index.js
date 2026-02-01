const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000; // 1. Gunakan process.env.PORT agar Vercel bisa mengatur port-nya

// Menggunakan path absolut agar Vercel tidak bingung mencari folder public
app.use(express.static(path.join(__dirname, "public")));

// Tambahkan ini agar saat akses domain utama langsung muncul index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function scrapeFullData(targetUrl) {
  console.log(`[LOG] Memulai scraping untuk: ${targetUrl}`);
  try {
    const { data } = await axios.get(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 10000,
    });
    const $ = cheerio.load(data);
    const originUrl = new URL(targetUrl).origin;

    let rawName = targetUrl.replace(/^https?:\/\//, "");
    let fileName =
      rawName
        .replace(/[^a-z0-9]/gi, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") + ".txt";

    $("script, style, noscript, nav, footer").remove();
    const allText = $("body").text().replace(/\s\s+/g, "\n").trim();

    const images = new Set();
    $("img").each((i, el) => {
      const src = $(el).attr("src");
      if (src) {
        try {
          images.add(new URL(src, targetUrl).href);
        } catch (e) {}
      }
    });

    const links = new Set();
    $("a").each((i, el) => {
      const href = $(el).attr("href");
      if (href) {
        try {
          const fullUrl = new URL(href, targetUrl).href;
          if (fullUrl.startsWith(originUrl)) links.add(fullUrl);
        } catch (e) {}
      }
    });

    let fileContent = `SOURCE: ${targetUrl}\nDATE: ${new Date().toLocaleString()}\n\n`;
    fileContent += `=== DAFTAR URL INTERNAL ===\n${Array.from(links).join("\n")}\n\n`;
    fileContent += `=== DAFTAR GAMBAR ===\n${Array.from(images).join("\n")}\n\n`;
    fileContent += `=== KONTEN TEKS ===\n${allText}`;

    console.log(`[LOG] Berhasil memproses ${fileName}`);
    return { fileName, fileContent };
  } catch (error) {
    console.error(`[ERROR] Gagal scrape: ${error.message}`);
    throw error;
  }
}

app.get("/api/process", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    const result = await scrapeFullData(url);
    res.json(result);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Server gagal mengambil data: " + err.message });
  }
});

// 2. Bungkus app.listen agar tidak mengganggu proses Serverless di Vercel
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`\n🚀 Server Scraper Bepann siap!`);
    console.log(`👉 Akses di: http://localhost:${PORT}`);
  });
}

// 3. WAJIB: Export app untuk Vercel
module.exports = app;
