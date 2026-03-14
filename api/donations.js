// api/donations.js
// GET /api/donations?tab=top|new&limit=15
// Return: { stats: { count, total }, donations: [...] }

const clientPromise = require('../lib/mongo')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const client = await clientPromise
    const db     = client.db('kopidev')
    const coll   = db.collection('donations')

    const tab   = req.query.tab   || 'new'
    const limit = Math.min(parseInt(req.query.limit) || 15, 50)

    // Stats total
    const statsAgg = await coll.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]).toArray()
    const stats = statsAgg[0]
      ? { total: statsAgg[0].total, count: statsAgg[0].count }
      : { total: 0, count: 0 }

    let donations = []

    if (tab === 'new') {
      const docs = await coll.find({}).sort({ paidAt: -1 }).limit(limit).toArray()
      donations  = docs.map(d => ({ name: d.name, msg: d.msg, amount: d.amount, via: d.via, paidAt: d.paidAt }))
    } else {
      const docs = await coll.aggregate([
        { $group: { _id: '$name', total: { $sum: '$amount' }, count: { $sum: 1 }, lastMsg: { $last: '$msg' }, lastPaid: { $last: '$paidAt' }, via: { $last: '$via' } } },
        { $sort: { total: -1 } },
        { $limit: limit }
      ]).toArray()
      donations = docs.map(d => ({ name: d._id, msg: d.lastMsg, amount: d.total, count: d.count, via: d.via, paidAt: d.lastPaid }))
    }

    return res.status(200).json({ stats, donations })

  } catch (err) {
    console.error('DONATIONS ERROR:', err.message)
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
