# B'scrapp

Aplikasi web berbasis Node.js dan Express untuk mengekstrak (*scraping*) data halaman website secara instan dan terstruktur, lalu menyimpannya sebagai file `.txt`.

## Fitur Utama

- **Ekstraksi Data Website**: Mengambil informasi metadata halaman (`title`, `meta description`, `meta keywords`), daftar tautan internal unik, daftar URL gambar (`src`, `data-src`, `data-lazy-src`), serta konten teks bersih dari elemen `<body>`.
- **Statistik Hasil Scraping**: Menampilkan jumlah *Internal Links*, *Images*, dan *Characters* pada antarmuka web setelah proses selesai.
- **Ekspor Otomatis ke `.txt`**: Mengunduh hasil scraping yang sudah diformat rapi dalam file `.txt` (penamaan berdasarkan hostname target).
- **Validasi URL & Proteksi SSRF**: Memvalidasi protokol `http`/`https`, menolak URL dengan kredensial, memblokir alamat `localhost`/`.local`/`.internal` serta alamat IP privat maupun IPv6, membatasi ukuran konten maksimal 5 MB, timeout 15 detik, dan menolak *redirect*.
- **API Endpoint**: Menyediakan endpoint `GET /api/process?url=<target_url>` yang mengembalikan respons JSON berisi `fileName`, `fileContent`, dan `statistics`.
- **Siap Deploy ke Vercel**: Dilengkapi konfigurasi `vercel.json` menggunakan `@vercel/node`.

## Tech Stack

- **Runtime & Backend**: Node.js, Express (`^4.21.2`)
- **HTTP Client & HTML Parser**: Axios (`^1.7.9`), Cheerio (`^1.0.0`)
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Deployment**: Vercel (`vercel.json`)

## Struktur Proyek

```text
porto-scrap/
├── api/
│   └── index.js                # Handler Express versi alternatif di folder api/
├── public/
│   └── index.html              # Antarmuka web frontend B'scrapp
├── .gitignore                  # Daftar file/folder yang diabaikan Git
├── database_hasil_scrap.json   # File JSON lokal
├── index.js                    # Server Express utama, validasi SSRF, scraper, & endpoint API
├── package.json                # Konfigurasi proyek dan dependensi npm
├── package-lock.json           # Lockfile dependensi npm
└── vercel.json                 # Konfigurasi routing dan build Vercel
```

## Instalasi & Menjalankan Secara Lokal

### Prasyarat

- [Node.js](https://nodejs.org/) (disarankan versi LTS) dan npm

### Langkah-langkah

1. Clone repositori ini dan masuk ke direktori proyek:
   ```bash
   git clone https://github.com/BevandJanuartama/bscrap.git
   cd bscrap
   ```

2. Pasang dependensi:
   ```bash
   npm install
   ```

3. Jalankan server:
   ```bash
   npm start
   ```

4. Buka browser dan akses:
   ```text
   http://localhost:3000
   ```

   Atau panggil endpoint API secara langsung:
   ```text
   GET http://localhost:3000/api/process?url=https://example.com
   ```

## Konfigurasi Environment

Repositori ini tidak memiliki file `.env.example` dan tidak memerlukan variabel lingkungan khusus untuk dijalankan secara lokal. Aplikasi hanya membaca variabel opsional berikut:

- `PORT` — Port server lokal yang digunakan oleh `index.js` (default: `3000`).

File `.env` dan `.env.local` sudah tercantum di `.gitignore` apabila Anda ingin menambahkan konfigurasi lokal di kemudian hari.
