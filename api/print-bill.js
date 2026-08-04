// ── /api/print-bill.js ────────────────────────────────────────────
// Vercel serverless function — fetches a bill + its items from Supabase
// and returns them as a JSON object in the format expected by the
// "Bluetooth Print" Android app (mate.bluetoothprint):
//   https://play.google.com/store/apps/details?id=mate.bluetoothprint
//
// The app fetches this URL when a link like:
//   my.bluetoothprint.scheme://https://your-domain.com/api/print-bill?id=<BILL_ID>
// is tapped in Android Chrome.
//
// Required Vercel env vars (set in Project → Settings → Environment Variables):
//   SUPABASE_URL             – your project URL  (same as VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY – service-role secret (bypasses RLS safely server-side)

import { createClient } from '@supabase/supabase-js'

// ── Shop config (keep in sync with DashboardPage.jsx) ─────────────
const SHOP = {
  name:    'Mayur Masala',
  sub:     '& Pooja Bhandar',
  address: 'Shagun Chowk, Pimpri',
  phone:   '+919359117213',
  tagline: 'Quality Masala & Pooja Items',
}

// ── Helpers ────────────────────────────────────────────────────────
const billNo = (id) => 'MM-' + id.slice(-6).toUpperCase()

/** Pad / truncate a string to exactly `len` chars */
const pad = (str, len, right = false) => {
  const s = String(str).substring(0, len)
  return right ? s.padStart(len) : s.padEnd(len)
}

/** Build a printer-ready text entry */
const text = (content, { bold = 0, align = 0, format = 0 } = {}) =>
  ({ type: 0, content, bold, align, format })

/** Divider lines */
const SOLID  = '================================'
const DASHED = '- - - - - - - - - - - - - - - -'
const BLANK  = { type: 0, content: ' ', bold: 0, align: 0, format: 0 }

// ── Handler ────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS — the BT Print app fetches this URL directly
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'Missing ?id= parameter' })

  // ── Supabase (server-side — uses service role key to bypass RLS) ─
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

  // ── Build print payload ────────────────────────────────────────
  const rows = []

  // Header
  rows.push(text(SHOP.name,    { bold: 1, align: 1, format: 2 }))  // double height+width
  rows.push(text(SHOP.sub,     { bold: 1, align: 1, format: 3 }))  // double width
  rows.push(text(SHOP.address, { align: 1, format: 4 }))            // small
  rows.push(text(SHOP.address2,{ align: 1, format: 4 }))
  rows.push(text(`Ph: ${SHOP.phone}`, { align: 1, format: 4 }))
  rows.push(text(SOLID))

  // Bill meta
  const dateStr = new Date(bill.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric'
  })
  const timeStr = new Date(bill.created_at).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
  })

  rows.push(text(`Bill No : ${billNo(bill.id)}`, { bold: 1 }))
  rows.push(text(`Date    : ${dateStr}  ${timeStr}`, { format: 4 }))
  rows.push(text(`Customer: ${bill.customer_name}`, { format: 4 }))
  if (bill.created_by) {
    rows.push(text(`Staff   : ${bill.created_by.split('@')[0]}`, { format: 4 }))
  }
  rows.push(text(SOLID))

  // Items column header (58mm ≈ 32 chars at normal size)
  //  #   Name             Qty   Amt
  //  1   Jeera            2   24.00
  rows.push(text('#  Item             Qty    Amt', { bold: 1, format: 4 }))
  rows.push(text(DASHED, { format: 4 }))

  let subtotal = 0
  ;(items || []).forEach((item, i) => {
    const amt   = Number(item.item_price) * Number(item.quantity)
    subtotal   += amt
    const num   = pad(i + 1, 2)
    const name  = pad(item.item_name, 15)
    const qty   = pad(item.quantity,  3, true)
    const amtS  = pad(amt.toFixed(2), 7, true)
    rows.push(text(`${num} ${name} ${qty} ${amtS}`, { format: 4 }))
  })

  rows.push(text(SOLID))

  // Totals
  const discPct = Number(bill.discount_percent || 0)
  const discAmt = Number(bill.discount_amount  || 0)
  const total   = Number(bill.total_amount)

  rows.push(text(`Subtotal : Rs. ${subtotal.toFixed(2)}`, { align: 2 }))
  if (discPct > 0) {
    rows.push(text(`Discount (${discPct}%) : -Rs. ${discAmt.toFixed(2)}`, { align: 2 }))
  }
  rows.push(text(SOLID))
  rows.push(text(`TOTAL: Rs.${total.toFixed(2)}`, { align: 1, format: 3 }))
  rows.push(text(SOLID))

  if (bill.status === 'paid') {
    rows.push(BLANK)
    rows.push(text('** PAID **', { bold: 1, align: 1, format: 3 }))
  }

  rows.push(BLANK)
  rows.push(text('Thank you for shopping with us!', { align: 1 }))
  rows.push(text(SHOP.tagline, { align: 1, format: 4 }))
  rows.push(BLANK)
  rows.push(BLANK)

  // ── Respond — the app expects JSON_FORCE_OBJECT style (numeric keys) ──
  // Convert array → { "0": {...}, "1": {...}, ... }
  const payload = {}
  rows.forEach((row, i) => { payload[i] = row })

  res.setHeader('Content-Type', 'application/json')
  return res.status(200).json(payload)
}