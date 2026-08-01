import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'

// ── Shop config — edit this to update all bills ──────────────────
const SHOP = {
  name:    'Mayur Masala Center',
  sub:     'and Pooja Bhandar',
  address: 'Shagun Chowk, Pimpri Area, Shastri Nagar',
  address2: 'Pimpri-Chinchwad, Maharashtra 411017',
  phone:   '',      // add phone number here if needed
  tagline: 'Quality Masala & Pooja Items',
}

// ── Bill number formatter ─────────────────────────────────────────
function billNo(id) {
  return 'MM-' + id.slice(-6).toUpperCase()
}

// ── PDF bill generator ────────────────────────────────────────────
async function printBillPDF(bill, items) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: [80, 220], orientation: 'portrait' })

  const PW = 80
  let y = 6

  const center = (text, size, bold = false, color = [0,0,0]) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    doc.text(text, PW / 2, y, { align: 'center' })
    y += size * 0.42
  }
  const left = (text, size, bold = false, color = [0,0,0]) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    doc.text(text, 4, y)
    y += size * 0.42
  }
  const right = (text, size, bold = false, color = [0,0,0]) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(...color)
    doc.text(text, PW - 4, y, { align: 'right' })
  }
  const row = (leftText, rightText, size = 8, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(0, 0, 0)
    doc.text(leftText, 4, y)
    doc.text(rightText, PW - 4, y, { align: 'right' })
    y += size * 0.42
  }
  const dashes = () => {
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([1, 1], 0)
    doc.line(4, y, PW - 4, y)
    doc.setLineDashPattern([], 0)
    y += 3
  }
  const solidLine = () => {
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.4)
    doc.line(4, y, PW - 4, y)
    y += 3
  }
  const gap = (mm = 2) => { y += mm }

  // ── Header ──
  center(SHOP.name, 11, true)
  center(SHOP.sub, 8)
  gap(1)
  center(SHOP.address, 7.5, false, [80, 80, 80])
  if (SHOP.address2) center(SHOP.address2, 7.5, false, [80, 80, 80])
  if (SHOP.phone) center('Ph: ' + SHOP.phone, 7.5, false, [80, 80, 80])
  gap(1)
  solidLine()

  // ── Bill meta ──
  const dateStr = new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  row('Bill No: ' + billNo(bill.id), 'Date: ' + dateStr, 7.5)
  gap(1)
  row('Customer:', bill.customer_name, 7.5, false)
  gap(2)
  dashes()

  // ── Column headers ──
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('SN', 4, y)
  doc.text('Item', 11, y)
  doc.text('Qty', 44, y, { align: 'center' })
  doc.text('Rate', 58, y, { align: 'right' })
  doc.text('Amt', PW - 4, y, { align: 'right' })
  y += 3.5
  dashes()

  // ── Line items ──
  let subtotal = 0
  items.forEach((item, i) => {
    const lineTotal = Number(item.item_price) * Number(item.quantity)
    subtotal += lineTotal

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)

    // SN
    doc.text(String(i + 1), 4, y)

    // Item name — wrap if long
    const nameLines = doc.splitTextToSize(item.item_name, 28)
    doc.text(nameLines, 11, y)

    // Qty, rate, amount on first line
    doc.text(String(item.quantity), 44, y, { align: 'center' })
    doc.text(Number(item.item_price).toFixed(2), 58, y, { align: 'right' })
    doc.text(lineTotal.toFixed(2), PW - 4, y, { align: 'right' })

    y += nameLines.length * 3.8 + 1
  })

  dashes()

  // ── Subtotal ──
  row('Subtotal', 'Rs. ' + subtotal.toFixed(2), 8, false)
  gap(1)

  // ── Discount ──
  const discPct  = Number(bill.discount_percent || 0)
  const discAmt  = Number(bill.discount_amount  || 0)
  if (discPct > 0) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 60, 60)
    doc.text(`Discount (${discPct}%)`, 4, y)
    doc.text('- Rs. ' + discAmt.toFixed(2), PW - 4, y, { align: 'right' })
    y += 4
    gap(1)
  }

  solidLine()

  // ── Total ──
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('TOTAL', 4, y)
  doc.setTextColor(0, 130, 100)
  doc.text('Rs. ' + Number(bill.total_amount).toFixed(2), PW - 4, y, { align: 'right' })
  y += 5
  solidLine()

  // ── Status stamp ──
  if (bill.status === 'paid') {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 160, 120)
    doc.text('** PAID **', PW / 2, y + 4, { align: 'center' })
    y += 9
  }

  // ── Footer ──
  gap(2)
  center('Thank you for shopping with us!', 7.5, false, [100, 100, 100])
  gap(1)
  center(SHOP.tagline, 7, false, [140, 140, 140])
  gap(2)
  center('- - - - - - - - - -', 7, false, [200, 200, 200])

  // Resize page to content
  const finalH = Math.min(Math.max(y + 8, 100), 297)
  const resized = new jsPDF({ unit: 'mm', format: [80, finalH], orientation: 'portrait' })
  resized.deletePage(1)
  resized.addPage([80, finalH])

  // Re-draw on correctly-sized page — just save the original doc which auto-sizes
  doc.save(`bill-${billNo(bill.id)}-${bill.customer_name.replace(/\s+/g, '-')}.pdf`)
}

// ── Discount modal ────────────────────────────────────────────────
function DiscountModal({ bill, onClose, onSaved }) {
  const toast = useToast()
  const [pct, setPct] = useState(Number(bill.discount_percent || 0))
  const [saving, setSaving] = useState(false)

  const subtotal = Number(bill.total_amount) + Number(bill.discount_amount || 0)
  const discountAmt = (subtotal * pct) / 100
  const newTotal = subtotal - discountAmt

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('bills').update({
      discount_percent: pct,
      discount_amount: discountAmt,
      total_amount: newTotal,
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
function BillDetailModal({ bill: initialBill, onClose, onRefresh }) {
  const [bill, setBill] = useState(initialBill)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [printing, setPrinting] = useState(false)
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
    const { error } = await supabase.from('bills').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', bill.id)
    if (error) toast('Failed to update', 'error')
    else { toast(`₹${Number(bill.total_amount).toFixed(2)} received from ${bill.customer_name}!`); reloadBill(); onClose() }
    setMarking(false)
  }

  const handlePrint = async () => {
    setPrinting(true)
    try { await printBillPDF(bill, items) }
    catch (e) { toast('Failed to generate PDF', 'error') }
    setPrinting(false)
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

          {/* Subtotal / discount / total */}
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
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>
          <div>Bill: {billNo(bill.id)} · {new Date(bill.created_at).toLocaleString()}</div>
          {bill.paid_at && <div>Paid: {new Date(bill.paid_at).toLocaleString()}</div>}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {bill.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-full btn-sm"
                onClick={() => setShowDiscount(true)}>
                🏷️ {Number(bill.discount_percent) > 0 ? `Discount (${bill.discount_percent}%)` : 'Add Discount'}
              </button>
              <button className="btn btn-full btn-sm"
                style={{ background: 'var(--success)', color: 'var(--white)' }}
                onClick={handleMarkPaid} disabled={marking}>
                {marking ? '⏳…' : '💰 Mark Paid'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-full btn-sm" onClick={onClose}>Close</button>
            <button className="btn btn-dark btn-full btn-sm" onClick={handlePrint} disabled={printing || loading}>
              {printing ? '⏳ Generating…' : '🖨️ Print Bill'}
            </button>
          </div>
        </div>
      </div>

      {showDiscount && (
        <DiscountModal
          bill={bill}
          onClose={() => setShowDiscount(false)}
          onSaved={reloadBill}
        />
      )}
    </div>
  )
}

// ── Dashboard page ────────────────────────────────────────────────
export default function DashboardPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
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
      await printBillPDF(bill, items || [])
    } catch (err) {
      toast('Failed to generate PDF', 'error')
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

  const filtered = bills.filter(b => filter === 'all' ? true : b.status === filter)
  const totalPending = bills.filter(b => b.status === 'pending').reduce((s, b) => s + Number(b.total_amount), 0)
  const totalPaid    = bills.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.total_amount), 0)
  const pendingCount = bills.filter(b => b.status === 'pending').length

  return (
    <div className="page-wide">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Billing Dashboard</h1>
          <p className="page-subtitle">Manage bills, discounts and payments</p>
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

      {/* Bills */}
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
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--paper)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Customer + time */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.925rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bill.customer_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    {billNo(bill.id)} · {new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} {new Date(bill.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* Amount + discount */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.95rem' }}>
                    ₹{Number(bill.total_amount).toFixed(2)}
                  </div>
                  {Number(bill.discount_percent) > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>
                      -{bill.discount_percent}% off
                    </div>
                  )}
                </div>

                {/* Status badge */}
                <div style={{ flexShrink: 0 }}>
                  <span className={`badge badge-${bill.status}`}>
                    {bill.status === 'paid' ? '✓ Paid' : '⏳'}
                  </span>
                </div>

                {/* Row actions */}
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {/* Print */}
                  <button
                    className="btn btn-sm btn-dark"
                    style={{ padding: '5px 9px', minHeight: 32 }}
                    title="Print bill"
                    onClick={e => handleQuickPrint(e, bill)}
                    disabled={printingId === bill.id}
                  >
                    {printingId === bill.id ? '⏳' : '🖨️'}
                  </button>

                  {/* Mark paid (only if pending) */}
                  {bill.status === 'pending' && (
                    <button
                      className="btn btn-sm"
                      style={{ padding: '5px 9px', minHeight: 32, background: 'var(--success)', color: 'var(--white)' }}
                      title="Mark as paid"
                      onClick={e => handleQuickPaid(e, bill)}
                    >
                      💰
                    </button>
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
        />
      )}
    </div>
  )
}