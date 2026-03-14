// public/js/app.js — KopiDev Donation Page
// Data disimpan ke MongoDB Atlas via serverless API

const CHECK_INTERVAL = 15000

let selectedAmt = 0
let currentTab  = 'top'
let timerInt    = null
let pollInt     = null
let activeOrder = null

// Init
loadDonations()

// ─── Nominal ───────────────────────────────────
function pickNominal(btn) {
  document.querySelectorAll('.nominal-btn').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  const a = btn.dataset.amount
  if (a === 'custom') { document.getElementById('customWrap').classList.add('show'); selectedAmt = 0 }
  else { document.getElementById('customWrap').classList.remove('show'); selectedAmt = parseInt(a) }
}

// ─── Generate QRIS ─────────────────────────────
async function doGenerate() {
  if (selectedAmt === 0) {
    const cv = parseInt(document.getElementById('customAmt').value)
    if (!cv || cv < 1) { showToast('❌ Masukkan nominal yang valid', true); return }
    selectedAmt = cv
  }

  const name = document.getElementById('inputName').value.trim() || 'Anonymous'
  const msg  = document.getElementById('inputMsg').value.trim()
  const btn  = document.getElementById('btnGen')

  btn.disabled = true; btn.classList.add('loading')

  try {
    const res  = await fetch('/api/generate-qris', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ amount: selectedAmt, name, msg })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Gagal generate QRIS')

    activeOrder = {
      orderId:    json.orderId,
      qr_url:     json.qr_url,
      qrisAmount: json.qrisAmount,
      randomAdd:  json.randomAdd,
      expiredSec: json.expiredSec,
      amount:     selectedAmt,
      name,
      msg: msg || '—'
    }
    openQris()
  } catch (e) {
    showToast('❌ ' + (e.message || 'Gagal membuat QRIS'), true)
  } finally {
    btn.disabled = false; btn.classList.remove('loading')
  }
}

// ─── QRIS Sheet ────────────────────────────────
function openQris() {
  const o = activeOrder
  document.getElementById('qrisAmt').textContent    = formatRp(o.qrisAmount)
  document.getElementById('qrisRandom').textContent = `harga asli ${formatRp(o.amount)} + Rp ${o.randomAdd} unik`
  document.getElementById('qrisImg').src            = o.qr_url
  document.getElementById('sheetSub').textContent   = `Bayar TEPAT ${formatRp(o.qrisAmount)} — jangan lebih/kurang`
  setPoll('checking', 'Menunggu pembayaran · cek otomatis tiap 15 detik...')
  document.getElementById('qrisOverlay').classList.add('open')
  document.body.style.overflow = 'hidden'
  startTimer(o.expiredSec)
  startPolling(o.orderId)
}

// ─── Timer ─────────────────────────────────────
function startTimer(secs) {
  clearInterval(timerInt)
  let rem = secs
  const el = document.getElementById('timerEl')
  tick()
  timerInt = setInterval(() => { if (--rem <= 0) { clearInterval(timerInt); onExpired() } tick() }, 1000)
  function tick() {
    el.textContent = `${String(Math.floor(rem/60)).padStart(2,'0')}:${String(rem%60).padStart(2,'0')}`
    el.className   = 'timer-circle' + (rem < 60 ? ' danger' : '')
  }
}
function onExpired() { clearInterval(pollInt); setPoll('expired', '⌛ Waktu habis! Silakan generate QRIS baru.') }

// ─── Polling ───────────────────────────────────
function startPolling(orderId) {
  clearInterval(pollInt)
  let n = 0
  pollInt = setInterval(async () => {
    n++; setPoll('checking', `⏳ Mengecek pembayaran... (ke-${n})`)
    try {
      const res  = await fetch(`/api/check-payment?orderId=${orderId}`)
      const json = await res.json()
      if (json.expired) { clearInterval(pollInt); onExpired(); return }
      if (json.paid)    { clearInterval(pollInt); clearInterval(timerInt); onPaid(json.donation) }
    } catch (e) { console.error('POLL ERR:', e) }
  }, CHECK_INTERVAL)
}

// ─── Paid ──────────────────────────────────────
function onPaid(donation) {
  const o = activeOrder
  closeQris(); loadDonations(); resetForm()
  document.getElementById('successMsg').textContent =
    donation.name !== 'Anonymous'
      ? `${donation.name} baru traktir kami ${formatRp(donation.amount)} kopi ☕`
      : `Seseorang baru traktir kami ${formatRp(donation.amount)} kopi ☕`
  document.getElementById('successDetail').innerHTML = `
    <div class="s-row"><span class="s-key">Nama</span><span class="s-val">${esc(donation.name)}</span></div>
    <div class="s-row"><span class="s-key">Nominal</span><span class="s-val">${formatRp(donation.amount)}</span></div>
    <div class="s-row"><span class="s-key">Dibayar</span><span class="s-val">${formatRp(o.qrisAmount)}</span></div>
    <div class="s-row"><span class="s-key">Via</span><span class="s-val">${esc(donation.via)}</span></div>
    <div class="s-row"><span class="s-key">Pesan</span><span class="s-val">${esc(donation.msg||'—')}</span></div>
    <div class="s-row"><span class="s-key">Waktu</span><span class="s-val">${new Date(donation.paidAt).toLocaleString('id-ID')}</span></div>`
  document.getElementById('successOverlay').classList.add('open')
  document.body.style.overflow = 'hidden'
}

function cancelOrder() { clearInterval(timerInt); clearInterval(pollInt); closeQris() }
function closeQris()    { document.getElementById('qrisOverlay').classList.remove('open'); document.body.style.overflow = '' }
function closeSuccess() {
  document.getElementById('successOverlay').classList.remove('open')
  document.body.style.overflow = ''
  setTimeout(() => document.getElementById('lb').scrollIntoView({ behavior:'smooth' }), 200)
}

// ─── Poll UI ───────────────────────────────────
function setPoll(type, text) {
  const el = document.getElementById('pollStatus')
  el.className = 'poll-status ' + type
  el.querySelector('.poll-dot').className = 'poll-dot' + (type === 'checking' ? ' blink' : '')
  document.getElementById('pollText').textContent = text
}

// ─── Load Donations ────────────────────────────
async function loadDonations() {
  try {
    const res  = await fetch(`/api/donations?tab=${currentTab}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    renderStats(json.stats)
    renderLB(json.donations)
  } catch (e) {
    document.getElementById('lb').innerHTML = `<div class="lb-empty"><div class="ico">⚠️</div>Gagal memuat. Coba refresh.</div>`
  }
}

function setTab(tab, btn) {
  currentTab = tab
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  document.getElementById('lb').innerHTML = '<div class="lb-loading">☕ Memuat...</div>'
  loadDonations()
}

function renderStats(s) {
  document.getElementById('statCount').textContent = s.count.toLocaleString('id-ID')
  document.getElementById('statTotal').textContent = formatRp(s.total)
}

function renderLB(list) {
  const el = document.getElementById('lb')
  if (!list || !list.length) {
    el.innerHTML = `<div class="lb-empty"><div class="ico">☕</div>Belum ada donatur. Jadilah yang pertama!</div>`
    return
  }
  el.innerHTML = list.map((d, i) => {
    const r = i + 1, rc = r <= 3 ? ` r${r}` : ''
    const med = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r
    const sub = currentTab === 'new' ? timeAgo(d.paidAt) : (d.count > 1 ? `${d.count}x donasi` : 'Donatur')
    return `<div class="lb-item${rc}">
      <div class="lb-rank${rc}">${med}</div>
      <div class="lb-avatar">${getAvatar(d.name)}</div>
      <div class="lb-info">
        <div class="lb-name">${esc(d.name)}</div>
        <div class="lb-msg">${esc(d.msg||'—')}</div>
        <div class="lb-sub">${sub}</div>
      </div>
      <div class="lb-amt">${formatRp(d.amount)}</div>
    </div>`
  }).join('')
}

function resetForm() {
  document.querySelectorAll('.nominal-btn').forEach(b => b.classList.remove('active'))
  document.getElementById('inputName').value = ''
  document.getElementById('inputMsg').value  = ''
  document.getElementById('cc').textContent  = '0'
  document.getElementById('customAmt').value = ''
  document.getElementById('customWrap').classList.remove('show')
  selectedAmt = 0
}

// ─── Helpers ───────────────────────────────────
const formatRp = n => 'Rp ' + Number(n).toLocaleString('id-ID')
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function getAvatar(name) {
  const e = ['☕','🦊','🐨','🦁','🐸','🐼','🦋','🌟','🎸','🍕','🚀','🌈','🎯','💎','🔥']
  let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % e.length; return e[h]
}
function timeAgo(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime()) || date.getFullYear() < 2000) return ''
  const d = Date.now() - date.getTime()
  if (d < 0)        return 'Baru saja'
  if (d < 60000)    return 'Baru saja'
  if (d < 3600000)  return Math.floor(d/60000) + ' menit lalu'
  if (d < 86400000) return Math.floor(d/3600000) + ' jam lalu'
  if (d < 2592000000) return Math.floor(d/86400000) + ' hari lalu'
  return date.toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
}
function showToast(msg, isErr = false) {
  const t = document.getElementById('toast')
  t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '')
  setTimeout(() => t.className = 'toast', 3200)
}
