const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Route utama untuk frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});

// Fungsi Scraper Utama
async function scrapeFullData(targetUrl) {
  try {
    const { data } = await axios.get(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      },
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

    // Hapus elemen yang tidak penting
    $("script, style, noscript, nav, footer, header, iframe").remove();
    const allText = $("body").text().replace(/\s\s+/g, "\n").trim();

    // Ekstraksi Gambar
    const images = new Set();
    $("img").each((i, el) => {
      const src = $(el).attr("src");
      if (src) {
        try {
          images.add(new URL(src, targetUrl).href);
        } catch (e) {}
      }
    });

    // Ekstraksi Link Internal
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

    return { fileName, fileContent };
  } catch (error) {
    throw new Error(`Gagal mengambil data dari URL: ${error.message}`);
  }
}

// Endpoint API dengan proteksi JSON Response
app.get("/api/process", async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({
      success: false,
      error:
        "Parameter URL wajib diisi! Contoh: /api/process?url=https://example.com",
    });
  }

  try {
    const result = await scrapeFullData(url);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// Middleware Global Error Handler
app.use((err, req, res, next) => {
  res.status(500).json({
    success: false,
    error: "Terjadi kesalahan internal pada server.",
  });
});

// Jalankan server lokal jika bukan di production
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () =>
    console.log(`🚀 Server bvscrapper running on port ${PORT}`),
  );
}

module.exports = app;
