// api/generate-qris.js
// POST /api/generate-qris
// Body : { amount, name, msg }
// Return: { orderId, qr_url, qrisAmount, randomAdd, expiredSec }

const clientPromise = require('../lib/mongo')
const API_BASE = 'https://api.scrlxrd.pp.ua/api/orderkuota'

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { amount, name = 'Anonymous', msg = '' } = req.body

    if (!amount || isNaN(amount) || Number(amount) < 1)
      return res.status(400).json({ error: 'Nominal tidak valid' })

    const apiKey   = process.env.SCRLXRD_API_KEY
    const username = process.env.SCRLXRD_USERNAME
    const token    = process.env.SCRLXRD_TOKEN

    if (!apiKey || !username || !token)
      return res.status(500).json({ error: 'Konfigurasi API belum diset di server (cek env vars)' })

    // Random add 1–100 supaya nominal unik (mode testing)
    const randomAdd   = Math.floor(Math.random() * 100) + 1
    const finalAmount = Number(amount) + randomAdd

    // Hit scrlxrd generateqr
    const apiUrl  = `${API_BASE}/generateqr?apikey=${apiKey}&username=${username}&token=${token}&amount=${finalAmount}`
    const apiRes  = await fetch(apiUrl)
    const apiJson = await apiRes.json()

    if (!apiJson.status || !apiJson.result?.qr_url) {
      console.error('SCRLXRD ERROR:', JSON.stringify(apiJson))
      return res.status(502).json({ error: apiJson.message || 'Gagal generate QRIS dari provider' })
    }

    const qr_url     = apiJson.result.qr_url
    const expiredSec = apiJson.result.expired || 300

    // Simpan order pending ke MongoDB
    const client = await clientPromise
    const db     = client.db('kopidev')

    const { insertedId } = await db.collection('orders').insertOne({
      status:     'pending',
      amount:     Number(amount),
      qrisAmount: finalAmount,
      randomAdd,
      qr_url,
      expiredSec,
      name:       String(name).trim().slice(0, 30) || 'Anonymous',
      msg:        String(msg).trim().slice(0, 200),
      createdAt:  new Date(),
      expiredAt:  new Date(Date.now() + expiredSec * 1000)
    })

    return res.status(200).json({
      orderId: insertedId.toString(),
      qr_url,
      qrisAmount: finalAmount,
      randomAdd,
      expiredSec
    })

  } catch (err) {
    console.error('GENERATE-QRIS ERROR:', err.message)
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
