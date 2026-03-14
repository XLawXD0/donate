// api/check-payment.js
// GET /api/check-payment?orderId=xxx
// Return: { paid: bool, expired?: bool, donation?: {...} }

const clientPromise = require('../lib/mongo')
const { ObjectId }  = require('mongodb')
const API_BASE = 'https://api.scrlxrd.pp.ua/api/orderkuota'

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

    // Sudah paid sebelumnya
    if (order.status === 'paid') return res.status(200).json({ paid: true, alreadyPaid: true })

    // Expired
    if (new Date() > order.expiredAt) {
      await db.collection('orders').updateOne({ _id: order._id }, { $set: { status: 'expired' } })
      return res.status(200).json({ paid: false, expired: true })
    }

    // Cek mutasi scrlxrd
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

    // ✅ Match ditemukan — simpan ke donations
    const via    = match.brand?.name || 'QRIS'
    const paidAt = match.tanggal ? new Date(match.tanggal) : new Date()

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
      paid: true,
      donation: { name: order.name, msg: order.msg, amount: order.amount, via, paidAt: paidAt.toISOString() }
    })

  } catch (err) {
    console.error('CHECK-PAYMENT ERROR:', err.message)
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
