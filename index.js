const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const dns = require("dns");
const net = require("net");
const http = require("http");
const https = require("https");

const app = express();

app.use(express.static(path.join(__dirname, "public")));

const MAX_CONTENT_LENGTH = 5 * 1024 * 1024;
const REQUEST_TIMEOUT = 15000;

// ================================
// VALIDASI IP
// ================================

function isPrivateIPv4(ip) {
  if (net.isIP(ip) !== 4) return true;

  const parts = ip.split(".").map(Number);
  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0)
  );
}

function isSafeIP(ip) {
  const version = net.isIP(ip);

  if (version === 4) {
    return !isPrivateIPv4(ip);
  }

  // Untuk versi ini, IPv6 tidak diizinkan.
  return false;
}

// ================================
// VALIDASI URL
// ================================

async function validateUrl(input) {
  let parsed;

  try {
    parsed = new URL(input);
  } catch {
    throw new Error("URL tidak valid.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Hanya URL HTTP dan HTTPS yang diperbolehkan.");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL dengan username atau password tidak diperbolehkan.");
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Alamat tujuan tidak diperbolehkan.");
  }

  if (net.isIP(hostname)) {
    if (!isSafeIP(hostname)) {
      throw new Error("Alamat IP privat tidak diperbolehkan.");
    }
  } else {
    const addresses = await dns.promises.lookup(hostname, {
      all: true,
      verbatim: true,
      family: 4,
    });

    if (!addresses.length) {
      throw new Error("Domain tidak dapat ditemukan.");
    }

    for (const address of addresses) {
      if (!isSafeIP(address.address)) {
        throw new Error(
          "Domain mengarah ke alamat IP yang tidak diperbolehkan.",
        );
      }
    }
  }

  return parsed;
}

// ================================
// DNS LOOKUP AMAN
// ================================

function safeLookup(hostname, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  dns.lookup(
    hostname,
    {
      ...options,
      family: 4,
      all: false,
    },
    (error, address, family) => {
      if (error) {
        return callback(error);
      }

      if (!isSafeIP(address)) {
        return callback(new Error("Alamat IP tujuan tidak diperbolehkan."));
      }

      callback(null, address, family);
    },
  );
}

const httpAgent = new http.Agent({
  lookup: safeLookup,
});

const httpsAgent = new https.Agent({
  lookup: safeLookup,
});

// ================================
// SCRAPING
// ================================

async function scrapeFullData(inputUrl) {
  const url = await validateUrl(inputUrl);

  let response;

  try {
    response = await axios.get(url.href, {
      timeout: REQUEST_TIMEOUT,
      maxContentLength: MAX_CONTENT_LENGTH,
      maxBodyLength: MAX_CONTENT_LENGTH,
      maxRedirects: 0,
      responseType: "text",
      responseEncoding: "utf8",
      httpAgent,
      httpsAgent,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      validateStatus: (status) => status >= 200 && status < 300,
    });
  } catch (error) {
    if (error.response) {
      throw new Error(`Website mengembalikan HTTP ${error.response.status}.`);
    }

    if (error.code === "ECONNABORTED") {
      throw new Error("Website terlalu lama merespons.");
    }

    if (
      error.code === "ERR_FR_TOO_MANY_REDIRECTS" ||
      error.response?.status >= 300
    ) {
      throw new Error(
        "Website melakukan redirect. Gunakan URL tujuan akhirnya.",
      );
    }

    throw new Error(error.message || "Gagal mengambil halaman website.");
  }

  const contentType = response.headers["content-type"] || "";

  if (!contentType.includes("text/html")) {
    throw new Error("URL tersebut tidak mengarah ke halaman HTML.");
  }

  const html = response.data;

  if (typeof html !== "string" || !html.trim()) {
    throw new Error("Website tidak mengembalikan konten HTML.");
  }

  const $ = cheerio.load(html);

  // ================================
  // INFORMASI WEBSITE
  // ================================

  const title = $("title").first().text().trim() || "Tidak tersedia";

  const description =
    $('meta[name="description"]').attr("content")?.trim() || "Tidak tersedia";

  const keywords =
    $('meta[name="keywords"]').attr("content")?.trim() || "Tidak tersedia";

  // ================================
  // HAPUS ELEMEN TIDAK DIPERLUKAN
  // ================================

  $("script, style, noscript, iframe, svg, canvas, template").remove();

  // ================================
  // EKSTRAKSI TEKS
  // ================================

  const allText = $("body")
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  // ================================
  // EKSTRAKSI LINK INTERNAL
  // ================================

  const links = new Set();

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) return;

    try {
      const absoluteUrl = new URL(href, url);

      if (
        absoluteUrl.hostname === url.hostname &&
        ["http:", "https:"].includes(absoluteUrl.protocol)
      ) {
        links.add(absoluteUrl.href);
      }
    } catch {
      // Lewati URL yang tidak valid.
    }
  });

  // ================================
  // EKSTRAKSI GAMBAR
  // ================================

  const images = new Set();

  $("img").each((_, element) => {
    const src =
      $(element).attr("src") ||
      $(element).attr("data-src") ||
      $(element).attr("data-lazy-src");

    if (!src) return;

    try {
      const absoluteUrl = new URL(src, url);

      if (["http:", "https:"].includes(absoluteUrl.protocol)) {
        images.add(absoluteUrl.href);
      }
    } catch {
      // Lewati URL gambar yang tidak valid.
    }
  });

  // ================================
  // FORMAT FILE TXT
  // ================================

  const date = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
  });

  const fileContent = `
B'SCRAPP - WEBSITE SCRAPER
========================================

SOURCE: ${url.href}
DATE: ${date}

========================================
INFORMASI WEBSITE
========================================

TITLE:
${title}

DESCRIPTION:
${description}

KEYWORDS:
${keywords}

========================================
DAFTAR URL INTERNAL (${links.size})
========================================

${[...links].join("\n") || "Tidak ditemukan."}

========================================
DAFTAR GAMBAR (${images.size})
========================================

${[...images].join("\n") || "Tidak ditemukan."}

========================================
KONTEN TEKS
========================================

${allText || "Tidak ditemukan."}

========================================
END OF SCRAPING
========================================
`.trim();

  const hostname = url.hostname
    .replace(/[^a-zA-Z0-9.-]/g, "-")
    .replace(/\./g, "-");

  const fileName = `${hostname}.txt`;

  return {
    fileName,
    fileContent,
    statistics: {
      links: links.size,
      images: images.size,
      characters: allText.length,
    },
  };
}

// ================================
// API ENDPOINT
// ================================

app.get("/api/process", async (req, res) => {
  try {
    const inputUrl = req.query.url;

    if (!inputUrl || typeof inputUrl !== "string") {
      return res.status(400).json({
        success: false,
        error: "Masukkan URL website terlebih dahulu.",
      });
    }

    const result = await scrapeFullData(inputUrl);

    return res.status(200).json({
      success: true,
      fileName: result.fileName,
      fileContent: result.fileContent,
      statistics: result.statistics,
    });
  } catch (error) {
    console.error("SCRAPING ERROR:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message || "Terjadi kesalahan saat scraping.",
    });
  }
});

// ================================
// HALAMAN UTAMA
// ================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================================
// 404 HANDLER
// ================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint tidak ditemukan.",
  });
});

// ================================
// SERVER
// ================================

if (require.main === module) {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, () => {
    console.log(`B'Scrapp berjalan di http://localhost:${PORT}`);
  });
}

module.exports = app;
