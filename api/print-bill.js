// ── /api/print-bill.js ────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'

const SHOP = {
  name:    'Mayur Masala',
  sub:     '& Pooja Bhandar',
  address: 'Shagun Chowk, Pimpri',
  phone:   '+919359117213',
  tagline: 'Quality Masala & Pooja Items',
}

const billNo = (id) => 'MM-' + id.slice(-6).toUpperCase()

const pad = (str, len, right = false) => {
  const s = String(str).substring(0, len)
  return right ? s.padStart(len) : s.padEnd(len)
}

const text = (content, { bold = 0, align = 0, format = 0 } = {}) =>
  ({ type: 0, content, bold, align, format })

const SOLID  = '================================'
const BLANK  = { type: 0, content: ' ', bold: 0, align: 0, format: 0 }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing ?id= parameter' })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const supabase = createClient(supabaseUrl, serviceKey)

  const { data: bill, error: billErr } = await supabase
    .from('bills').select('*').eq('id', id).single()

  if (billErr || !bill) {
    return res.status(404).json({ error: 'Bill not found' })
  }

  const { data: items = [] } = await supabase
    .from('bill_items').select('*').eq('bill_id', id).order('created_at')

  const rows = []

  // Header
  rows.push(text(SHOP.name,    { bold: 1, align: 1, format: 2 }))
  rows.push(text(SHOP.sub,     { bold: 1, align: 1, format: 3 }))
  rows.push(text(SHOP.address, { align: 1, format: 0 }))
  rows.push(text(`Ph: ${SHOP.phone}`, { align: 1, format: 0 }))
  rows.push(text(SOLID))

  // Bill meta — IST timezone explicitly set
  const IST = { timeZone: 'Asia/Kolkata' }
  const dateStr = new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...IST })
  const timeStr = new Date(bill.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', ...IST })

  rows.push(text(`Bill: ${billNo(bill.id)}`, {  format: 0 }))
  rows.push(text(`Date: ${dateStr} ${timeStr}`, { format: 0 }))
  rows.push(text(`Cust: ${bill.customer_name}`, { format: 0 }))
  if (bill.created_by) {
    rows.push(text(`By  : ${bill.created_by.split('@')[0]}`, { format: 0 }))
  }
  rows.push(text(SOLID))

  rows.push(text('# Item       Qty  Rate    Amt', { bold: 1, format: 0 }))
  rows.push(text('------------------------------', { format: 0 }))

  let subtotal = 0
  ;(items || []).forEach((item, i) => {
    const rate = Number(item.item_price)
    const amt  = rate * Number(item.quantity)
    subtotal  += amt
    const num   = pad(i + 1, 1)
    const name  = pad(item.item_name, 10)
    const qty   = pad(item.quantity,   3, true)
    const rateS = pad(rate.toFixed(2), 6, true)
    const amtS  = pad(amt.toFixed(2),  7, true)
    rows.push(text(`${num} ${name} ${qty} ${rateS} ${amtS}`, { format: 0 }))
  })

  rows.push(text(SOLID))

  const discPct = Number(bill.discount_percent || 0)
  const discAmt = Number(bill.discount_amount  || 0)
  const total   = Number(bill.total_amount)

  rows.push(text(`Subtotal: Rs.${subtotal.toFixed(2)}`, { align: 2, format: 0 }))
  if (discPct > 0) {
    rows.push(text(`Disc(${discPct}%): -Rs.${discAmt.toFixed(2)}`, { align: 2, format: 0 }))
  }
  rows.push(text(SOLID))
  rows.push(text(`TOTAL Rs.${total.toFixed(2)}`, { bold: 1, align: 1, format: 3 }))
  rows.push(text(SOLID))

  if (bill.status === 'paid') {
    rows.push(BLANK)
    rows.push(text('** PAID **', { bold: 1, align: 1, format: 3 }))
  }

  rows.push(BLANK)
  rows.push(text('Thank you!', { bold: 1, align: 1, format: 3 }))
  rows.push(text('Shopping with us', { align: 1, format: 4 }))
  rows.push(text(SHOP.tagline, { align: 1, format: 0 }))
  rows.push(BLANK)
  rows.push(BLANK)

  const payload = {}
  rows.forEach((row, i) => { payload[i] = row })

  res.setHeader('Content-Type', 'application/json')
  return res.status(200).json(payload)
}
