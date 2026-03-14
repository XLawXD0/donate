# ☕ KopiDev — Web Donasi QRIS

Web donasi dengan QRIS otomatis, polling pembayaran real-time, dan leaderboard yang tersimpan di MongoDB Atlas.

---

## 🗂️ Struktur Project

```
kopidev/
├── api/
│   ├── generate-qris.js   ← buat QRIS + simpan order ke MongoDB
│   ├── check-payment.js   ← cek mutasi scrlxrd + konfirmasi bayar
│   └── donations.js       ← ambil data leaderboard & stats
├── lib/
│   └── mongo.js           ← koneksi MongoDB (reuse connection)
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── .env.example
├── vercel.json
└── package.json
```

---

## 🚀 Cara Deploy ke Vercel

### 1. Siapkan MongoDB Atlas (gratis)

1. Buka [mongodb.com/atlas](https://mongodb.com/atlas) → buat akun gratis
2. Buat cluster baru (M0 Free Tier)
3. Buat database user (username + password)
4. Di **Network Access** → tambahkan `0.0.0.0/0` (allow all IP, untuk Vercel)
5. Klik **Connect** → **Drivers** → copy connection string
   - Contoh: `mongodb+srv://user:pass@cluster0.abc123.mongodb.net/`

### 2. Deploy ke Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Clone / masuk ke folder project
cd kopidev

# Install dependencies
npm install

# Deploy (ikuti petunjuk di terminal)
vercel
```

### 3. Set Environment Variables di Vercel

Setelah deploy pertama, buka **Vercel Dashboard** → project kamu → **Settings** → **Environment Variables**, lalu tambahkan:

| Key | Value |
|-----|-------|
| `MONGODB_URI` | `mongodb+srv://user:pass@cluster...` |
| `SCRLXRD_API_KEY` | API key dari scrlxrd |
| `SCRLXRD_USERNAME` | Username scrlxrd kamu |
| `SCRLXRD_TOKEN` | Token format `id:token` |

Setelah itu klik **Redeploy**.

### 4. (Opsional) Custom Domain

Di Vercel Dashboard → **Domains** → tambahkan domain kamu.

---

## 🛠️ Development Lokal

```bash
# Buat file .env dari contoh
cp .env.example .env
# Edit .env dengan nilai asli

# Install Vercel CLI
npm i -g vercel

# Jalankan dev server
vercel dev
# Buka http://localhost:3000
```

---

## 🗄️ Koleksi MongoDB

Project ini otomatis membuat 2 koleksi di database `kopidev`:

### `orders`
Menyimpan order pending sementara.
```json
{
  "status": "pending | paid | expired",
  "amount": 25000,
  "qrisAmount": 25047,
  "randomAdd": 47,
  "qr_url": "https://...",
  "expiredSec": 300,
  "name": "Budi",
  "msg": "Semangat!",
  "createdAt": "2024-01-01T00:00:00Z",
  "expiredAt": "2024-01-01T00:05:00Z"
}
```

### `donations`
Menyimpan donasi yang sudah terkonfirmasi (permanen).
```json
{
  "name": "Budi",
  "msg": "Semangat terus!",
  "amount": 25000,
  "via": "GoPay",
  "paidAt": "2024-01-01T00:03:12Z",
  "createdAt": "2024-01-01T00:03:12Z"
}
```

---

## ⚙️ Cara Kerja Pembayaran

1. User pilih nominal → klik **Generate QRIS**
2. Frontend POST ke `/api/generate-qris`
3. Server hit `scrlxrd generateqr` → dapat `qr_url` + `expiredSec`
4. Order disimpan ke MongoDB (`status: pending`)
5. Frontend tampilkan QR image + timer
6. Frontend polling `/api/check-payment?orderId=...` tiap **15 detik**
7. Server cek mutasi scrlxrd, cocokkan nominal unik (`amount + randomAdd`)
8. Jika cocok → donasi disimpan ke `donations`, order di-update `paid`
9. Frontend tampilkan success modal, leaderboard direfresh

---

## 📝 Catatan

- Random add (1–999) memastikan setiap order punya nominal unik sehingga polling bisa mencocokkan pembayaran dengan tepat
- Data donatur tersimpan **permanen di MongoDB**, tidak hilang walau ganti browser/device
- Order expired otomatis setelah waktu habis (default 5 menit)
