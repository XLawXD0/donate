// api/check-payment.js
const clientPromise = require('../lib/mongo')
const { ObjectId }  = require('mongodb')
const API_BASE = 'https://api.scrlxrd.pp.ua/api/orderkuota'

// Parse tanggal dari scrlxrd — format: "DD/MM/YYYY HH:MM:SS" atau ISO
function parseTanggal(str) {
  if (!str) return new Date()
  // Coba format DD/MM/YYYY HH:MM:SS
  const match = str.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, dd, mm, yyyy, hh, mi, ss] = match
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+07:00`)
    if (!isNaN(d)) return d
  }
  // Coba parse langsung
  const d = new Date(str)
  if (!isNaN(d)) return d
  // Fallback ke sekarang
  return new Date()
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { orderId } = req.query
  if (!orderId) return res.status(400).json({ error: 'orderId required' })

  try {
    const client = await clientPromise
    const db     = client.db('kopidev')

    let order
    try {
      order = await db.collection('orders').findOne({ _id: new ObjectId(orderId) })
    } catch {
      return res.status(400).json({ error: 'orderId tidak valid' })
    }

    if (!order) return res.status(404).json({ error: 'Order tidak ditemukan' })
    if (order.status === 'paid') return res.status(200).json({ paid: true, alreadyPaid: true })

    if (new Date() > order.expiredAt) {
      await db.collection('orders').updateOne({ _id: order._id }, { $set: { status: 'expired' } })
      return res.status(200).json({ paid: false, expired: true })
    }

    const apiKey   = process.env.SCRLXRD_API_KEY
    const username = process.env.SCRLXRD_USERNAME
    const token    = process.env.SCRLXRD_TOKEN

    const mutasiRes  = await fetch(`${API_BASE}/mutasi?apikey=${apiKey}&username=${username}&token=${token}`)
    const mutasiJson = await mutasiRes.json()

    if (!mutasiJson.status || !mutasiJson.result?.success)
      return res.status(200).json({ paid: false })

    const history = mutasiJson.result.qris_history?.results || []
    const match   = history.find(h => {
      if (h.status !== 'IN') return false
      return parseInt((h.kredit || '').replace(/\./g, ''), 10) === order.qrisAmount
    })

    if (!match) return res.status(200).json({ paid: false })

    const via    = match.brand?.name || 'QRIS'
    const paidAt = parseTanggal(match.tanggal)  // ← parse dengan aman

    await db.collection('donations').insertOne({
      name:      order.name,
      msg:       order.msg,
      amount:    order.amount,
      via,
      paidAt,
      createdAt: new Date()
    })

    await db.collection('orders').updateOne(
      { _id: order._id },
      { $set: { status: 'paid', paidAt } }
    )

    return res.status(200).json({
      paid:     true,
      donation: { name: order.name, msg: order.msg, amount: order.amount, via, paidAt: paidAt.toISOString() }
    })

  } catch (err) {
    console.error('CHECK-PAYMENT ERROR:', err.message)
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
