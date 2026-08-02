import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { isOwner } from '../lib/roles'

// ── Shop config ──────────────────────────────────────────────────
const SHOP = {
  name:     'Mayur Masala Center',
  sub:      'and Pooja Bhandar',
  address:  'Shagun Chowk, Pimpri Area, Shastri Nagar',
  address2: 'Pimpri-Chinchwad, Maharashtra 411017',
  phone:    '',
  tagline:  'Quality Masala & Pooja Items',
}

// ── Bill number formatter ─────────────────────────────────────────
function billNo(id) {
  return 'MM-' + id.slice(-6).toUpperCase()
}

// ── Browser print (no download) ──────────────────────────────────
// Builds an 80mm receipt as an HTML string, opens a hidden iframe,
// triggers window.print(), then removes the iframe. Works perfectly
// with thermal printers set as the default/selected printer in
// Windows — paper size 80mm × continuous, no margins.
function printBillHTML(bill, items) {
  const dateStr = new Date(bill.created_at).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
  const subtotal   = Number(bill.total_amount) + Number(bill.discount_amount || 0)
  const discPct    = Number(bill.discount_percent || 0)
  const discAmt    = Number(bill.discount_amount  || 0)
  const total      = Number(bill.total_amount)

  const itemRows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.item_name}</td>
      <td style="text-align:center">${item.quantity}</td>
      <td style="text-align:right">${Number(item.item_price).toFixed(2)}</td>
      <td style="text-align:right">${(item.item_price * item.quantity).toFixed(2)}</td>
    </tr>`).join('')

  const discountRow = discPct > 0 ? `
    <tr class="discount-row">
      <td colspan="4" style="text-align:right">Discount (${discPct}%)</td>
      <td style="text-align:right">- ${discAmt.toFixed(2)}</td>
    </tr>` : ''

  const paidStamp = bill.status === 'paid'
    ? `<div class="paid-stamp">** PAID **</div>` : ''

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Bill ${billNo(bill.id)}</title>
<style>
  @page {
    size: 80mm auto;
    margin: 4mm 3mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 11px;
    width: 74mm;
    color: #000;
    background: #fff;
  }
  .header { text-align: center; margin-bottom: 6px; }
  .shop-name { font-size: 14px; font-weight: bold; letter-spacing: 0.5px; }
  .shop-sub  { font-size: 11px; font-weight: bold; }
  .shop-addr { font-size: 9.5px; color: #444; margin-top: 2px; }
  .shop-phone { font-size: 9.5px; color: #444; }

  .divider-solid { border: none; border-top: 1.5px solid #000; margin: 5px 0; }
  .divider-dash  { border: none; border-top: 1px dashed #999; margin: 4px 0; }

  .meta { font-size: 10px; margin-bottom: 4px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { font-size: 9.5px; font-weight: bold; padding: 2px 0; border-bottom: 1px dashed #999; }
  td { font-size: 10px; padding: 2.5px 0; vertical-align: top; }
  td:first-child { width: 14px; }
  td:nth-child(2) { padding-right: 4px; }
  td:nth-child(3) { width: 22px; }
  td:nth-child(4) { width: 34px; }
  td:nth-child(5) { width: 36px; }

  .subtotal-row td { padding-top: 4px; font-size: 10px; color: #333; }
  .discount-row td { color: #cc0000; font-size: 10px; }

  .total-row { border-top: 1.5px solid #000; margin-top: 2px; }
  .total-row td { font-size: 13px; font-weight: bold; padding-top: 5px; }

  .paid-stamp {
    text-align: center;
    font-size: 16px;
    font-weight: bold;
    color: #008060;
    letter-spacing: 1px;
    margin: 6px 0 2px;
  }
  .footer {
    text-align: center;
    font-size: 9px;
    color: #666;
    margin-top: 8px;
    line-height: 1.6;
  }
  .footer .tagline { font-size: 8.5px; color: #999; }
  .cut-line { text-align: center; font-size: 8px; color: #bbb; margin-top: 8px; letter-spacing: 2px; }
</style>
</head>
<body>
  <div class="header">
    <div class="shop-name">${SHOP.name}</div>
    <div class="shop-sub">${SHOP.sub}</div>
    <div class="shop-addr">${SHOP.address}</div>
    <div class="shop-addr">${SHOP.address2}</div>
    ${SHOP.phone ? `<div class="shop-phone">Ph: ${SHOP.phone}</div>` : ''}
  </div>

  <hr class="divider-solid">

  <div class="meta">
    <div class="meta-row">
      <span><b>Bill No:</b> ${billNo(bill.id)}</span>
      <span><b>Date:</b> ${dateStr}</span>
    </div>
    <div class="meta-row">
      <span><b>Customer:</b> ${bill.customer_name}</span>
    </div>
  </div>

  <hr class="divider-dash">

  <table>
    <thead>
      <tr>
        <th style="text-align:left">SN</th>
        <th style="text-align:left">Item</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Rate</th>
        <th style="text-align:right">Amt</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      <tr class="subtotal-row">
        <td colspan="4" style="text-align:right"><b>Subtotal</b></td>
        <td style="text-align:right"><b>${subtotal.toFixed(2)}</b></td>
      </tr>
      ${discountRow}
    </tbody>
  </table>

  <hr class="divider-solid">

  <table class="total-row">
    <tr>
      <td><b>TOTAL</b></td>
      <td style="text-align:right"><b>Rs. ${total.toFixed(2)}</b></td>
    </tr>
  </table>

  ${paidStamp}

  <div class="footer">
    Thank you for shopping with us!<br>
    <span class="tagline">${SHOP.tagline}</span>
  </div>

  <div class="cut-line">- - - - - - - - - - - - - -</div>
</body>
</html>`

  // Create hidden iframe, write bill HTML, print, then remove
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;'
  document.body.appendChild(iframe)

  iframe.contentDocument.open()
  iframe.contentDocument.write(html)
  iframe.contentDocument.close()

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 300)
  }
}

// ── Discount modal ────────────────────────────────────────────────
function DiscountModal({ bill, onClose, onSaved }) {
  const toast = useToast()
  const [pct, setPct] = useState(Number(bill.discount_percent || 0))
  const [saving, setSaving] = useState(false)

  const subtotal    = Number(bill.total_amount) + Number(bill.discount_amount || 0)
  const discountAmt = (subtotal * pct) / 100
  const newTotal    = subtotal - discountAmt

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('bills').update({
      discount_percent: pct,
      discount_amount:  discountAmt,
      total_amount:     newTotal,
    }).eq('id', bill.id)
    if (error) toast('Failed to apply discount', 'error')
    else { toast(`Discount of ${pct}% (₹${discountAmt.toFixed(2)}) applied!`); onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">Apply Discount</div>
        <div className="modal-subtitle">Discount for {bill.customer_name}</div>

        <div className="form-group">
          <label className="form-label">Discount %</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary" style={{ width: 44, padding: 0, flexShrink: 0 }}
              onClick={() => setPct(p => Math.max(0, p - 1))}>−</button>
            <input
              className="form-input"
              type="number" min="0" max="100" step="0.5"
              value={pct}
              onChange={e => setPct(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
              style={{ textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1.2rem' }}
            />
            <button className="btn btn-secondary" style={{ width: 44, padding: 0, flexShrink: 0 }}
              onClick={() => setPct(p => Math.min(100, p + 1))}>+</button>
          </div>
        </div>

        {/* Quick picks */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {[5, 10, 15, 20, 25].map(p => (
            <button key={p} className={`btn btn-sm ${pct === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setPct(p)}>{p}%</button>
          ))}
        </div>

        {/* Breakdown */}
        <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 6 }}>
            <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>₹{subtotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: 8 }}>
            <span style={{ color: 'var(--danger)' }}>Discount ({pct}%)</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: 'var(--danger)' }}>
              − ₹{discountAmt.toFixed(2)}
            </span>
          </div>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 8 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 700 }}>
            <span>Total to pay</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--teal-dark)' }}>₹{newTotal.toFixed(2)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-full" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Saving…' : 'Apply Discount'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bill detail modal ─────────────────────────────────────────────
function BillDetailModal({ bill: initialBill, onClose, onRefresh, isOwner }) {
  const [bill, setBill]           = useState(initialBill)
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [marking, setMarking]     = useState(false)
  const [showDiscount, setShowDiscount] = useState(false)
  const toast = useToast()

  const loadItems = useCallback(async () => {
    const { data } = await supabase.from('bill_items').select('*').eq('bill_id', bill.id)
    setItems(data || [])
    setLoading(false)
  }, [bill.id])

  const reloadBill = useCallback(async () => {
    const { data } = await supabase.from('bills').select('*').eq('id', bill.id).single()
    if (data) setBill(data)
    onRefresh()
  }, [bill.id, onRefresh])

  useEffect(() => { loadItems() }, [loadItems])

  const handleMarkPaid = async () => {
    setMarking(true)
    const { error } = await supabase.from('bills')
      .update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', bill.id)
    if (error) toast('Failed to update', 'error')
    else { toast(`₹${Number(bill.total_amount).toFixed(2)} received from ${bill.customer_name}!`); reloadBill(); onClose() }
    setMarking(false)
  }

  const handlePrint = () => {
    if (!loading) printBillHTML(bill, items)
  }

  const subtotal = Number(bill.total_amount) + Number(bill.discount_amount || 0)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        {/* Header */}
        <div style={{ background: 'var(--ink)', borderRadius: 'var(--radius)', padding: '18px 16px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Customer</div>
          <div style={{ color: 'var(--white)', fontSize: '1.3rem', fontWeight: 700, marginTop: 3 }}>{bill.customer_name}</div>
          <div style={{ color: 'var(--teal)', fontSize: '1.8rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: 6 }}>
            ₹{Number(bill.total_amount).toFixed(2)}
          </div>
          {Number(bill.discount_percent) > 0 && (
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.78rem', marginTop: 4 }}>
              After {bill.discount_percent}% discount (saved ₹{Number(bill.discount_amount).toFixed(2)})
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <span className={`badge badge-${bill.status}`}>{bill.status === 'paid' ? '✓ Paid' : '⏳ Pending'}</span>
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>Loading…</div>
          ) : items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{i + 1}. {item.item_name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                  ₹{Number(item.item_price).toFixed(2)} × {item.quantity}
                </div>
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.9rem' }}>
                ₹{(item.item_price * item.quantity).toFixed(2)}
              </div>
            </div>
          ))}

          {/* Totals */}
          <div style={{ paddingTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Subtotal</span>
              <span className="font-mono">₹{subtotal.toFixed(2)}</span>
            </div>
            {Number(bill.discount_percent) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--danger)', marginBottom: 4 }}>
                <span>Discount ({bill.discount_percent}%)</span>
                <span className="font-mono">− ₹{Number(bill.discount_amount).toFixed(2)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1rem', paddingTop: 8, borderTop: '1.5px solid var(--ink)' }}>
              <span>Total</span>
              <span className="font-mono" style={{ color: 'var(--teal-dark)' }}>₹{Number(bill.total_amount).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Meta */}
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div>Bill: {billNo(bill.id)} · {new Date(bill.created_at).toLocaleString()}</div>
          {bill.created_by && <div>Created by: <span style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>{bill.created_by.split('@')[0]}</span></div>}
          {bill.paid_at && <div>Paid: {new Date(bill.paid_at).toLocaleString()}</div>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bill.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Discount — any user */}
              <button className="btn btn-secondary btn-full btn-sm" onClick={() => setShowDiscount(true)}>
                🏷️ {Number(bill.discount_percent) > 0 ? `Discount (${bill.discount_percent}%)` : 'Add Discount'}
              </button>
              {/* Mark paid — owner only */}
              {isOwner ? (
                <button
                  className="btn btn-full btn-sm"
                  style={{ background: 'var(--success)', color: 'var(--white)' }}
                  onClick={handleMarkPaid} disabled={marking}
                >
                  {marking ? '⏳…' : '💰 Mark Paid'}
                </button>
              ) : (
                <div
                  title={`Only the owner (${OWNER_EMAIL}) can mark bills as paid`}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: 'var(--text-muted)', padding: '6px 8px', textAlign: 'center', cursor: 'not-allowed' }}
                >
                  🔒 Owner only
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-full btn-sm" onClick={onClose}>Close</button>
            <button className="btn btn-dark btn-full btn-sm" onClick={handlePrint} disabled={loading}>
              🖨️ Print Bill
            </button>
          </div>
        </div>
      </div>

      {showDiscount && (
        <DiscountModal bill={bill} onClose={() => setShowDiscount(false)} onSaved={reloadBill} />
      )}
    </div>
  )
}

// ── Dashboard page ────────────────────────────────────────────────
export default function DashboardPage() {
  const toast    = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()
  const owner = isOwner(user?.email)

  const [bills, setBills]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [filter, setFilter]         = useState('all')
  const [selectedBill, setSelectedBill] = useState(null)
  const [printingId, setPrintingId] = useState(null)

  const fetchBills = useCallback(async () => {
    const { data, error } = await supabase.from('bills').select('*').order('created_at', { ascending: false })
    if (error) toast('Failed to load bills', 'error')
    else setBills(data || [])
    setLoading(false)
  }, [toast])

  useEffect(() => {
    fetchBills()
    const channel = supabase.channel('bills-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, fetchBills)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [fetchBills])

  const handleQuickPrint = async (e, bill) => {
    e.stopPropagation()
    setPrintingId(bill.id)
    try {
      const { data: items } = await supabase.from('bill_items').select('*').eq('bill_id', bill.id)
      printBillHTML(bill, items || [])
    } catch {
      toast('Failed to print', 'error')
    }
    setPrintingId(null)
  }

  const handleQuickPaid = async (e, bill) => {
    e.stopPropagation()
    const { error } = await supabase.from('bills')
      .update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', bill.id)
    if (error) toast('Failed to update', 'error')
    else { toast(`₹${Number(bill.total_amount).toFixed(2)} received from ${bill.customer_name}!`); fetchBills() }
  }

  const filtered     = bills.filter(b => filter === 'all' ? true : b.status === filter)
  const totalPending = bills.filter(b => b.status === 'pending').reduce((s, b) => s + Number(b.total_amount), 0)
  const totalPaid    = bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.total_amount), 0)
  const pendingCount = bills.filter(b => b.status === 'pending').length

  return (
    <div className="page-wide">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Billing Dashboard</h1>
          <p className="page-subtitle">
            Manage bills, discounts and payments
            {owner && <span style={{ marginLeft: 8, background: 'var(--teal-glow)', color: 'var(--teal-dark)', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--teal)' }}>👑 Owner</span>}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/scan')}>+ New Bill</button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Bills</div>
          <div className="stat-value">{bills.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{pendingCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Amt</div>
          <div className="stat-value" style={{ color: 'var(--warning)', fontSize: '1.2rem' }}>₹{totalPending.toFixed(0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collected</div>
          <div className="stat-value teal" style={{ fontSize: '1.2rem' }}>₹{totalPaid.toFixed(0)}</div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'pending', 'paid'].map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-dark' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'pending' ? '⏳ Pending' : '✓ Paid'}
          </button>
        ))}
      </div>

      {/* Bills list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="empty-state"><div className="empty-state-icon">⏳</div><div className="empty-state-title">Loading…</div></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🧾</div>
            <div className="empty-state-title">{filter === 'all' ? 'No bills yet' : `No ${filter} bills`}</div>
            {filter === 'all' && <button className="btn btn-primary mt-3" onClick={() => navigate('/scan')}>+ Create First Bill</button>}
          </div>
        ) : (
          <div>
            {filtered.map((bill, idx) => (
              <div
                key={bill.id}
                onClick={() => setSelectedBill(bill)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '13px 16px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--paper)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Customer + time + creator */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.925rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bill.customer_name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {billNo(bill.id)} · {new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(bill.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {bill.created_by && (
                    <div style={{ fontSize: '0.68rem', marginTop: 2, color: 'var(--teal-dark)', opacity: 0.85 }}>
                      🧑 {bill.created_by.split('@')[0]}
                    </div>
                  )}
                </div>

                {/* Amount + discount badge */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.95rem' }}>
                    ₹{Number(bill.total_amount).toFixed(2)}
                  </div>
                  {Number(bill.discount_percent) > 0 && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--danger)' }}>-{bill.discount_percent}% off</div>
                  )}
                </div>

                {/* Status */}
                <div style={{ flexShrink: 0 }}>
                  <span className={`badge badge-${bill.status}`}>
                    {bill.status === 'paid' ? '✓' : '⏳'}
                  </span>
                </div>

                {/* Row actions */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {/* Print — everyone */}
                  <button
                    className="btn btn-sm btn-dark"
                    style={{ padding: '5px 9px', minHeight: 32 }}
                    title="Print bill"
                    onClick={e => handleQuickPrint(e, bill)}
                    disabled={printingId === bill.id}
                  >
                    {printingId === bill.id ? '⏳' : '🖨️'}
                  </button>

                  {/* Mark paid — owner only, pending only */}
                  {bill.status === 'pending' && (
                    owner ? (
                      <button
                        className="btn btn-sm"
                        style={{ padding: '5px 9px', minHeight: 32, background: 'var(--success)', color: 'var(--white)' }}
                        title="Mark as paid"
                        onClick={e => handleQuickPaid(e, bill)}
                      >💰</button>
                    ) : (
                      <div
                        title="Only the owner can mark bills as paid"
                        style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--border)', fontSize: '0.85rem', cursor: 'not-allowed' }}
                      >🔒</div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedBill && (
        <BillDetailModal
          bill={selectedBill}
          onClose={() => setSelectedBill(null)}
          onRefresh={fetchBills}
          isOwner={owner}
        />
      )}
    </div>
  )
}
