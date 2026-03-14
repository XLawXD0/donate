// lib/mongo.js — reuse koneksi MongoDB di semua serverless function
const { MongoClient } = require('mongodb')

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI belum diset!')

let clientPromise

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri)
    global._mongoClientPromise = client.connect()
  }
  clientPromise = global._mongoClientPromise
} else {
  const client = new MongoClient(uri)
  clientPromise = client.connect()
}

module.exports = clientPromise
