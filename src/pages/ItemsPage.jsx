import { useState, useEffect, useRef, useCallback } from 'react'
import JsBarcode from 'jsbarcode'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'

function generateBarcodeCode(name, price) {
  const clean = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6).padEnd(4, '0')
  const priceCode = String(Math.round(price * 100)).padStart(6, '0').slice(0, 6)
  return `${clean}${priceCode}`
}

// Renders a barcode SVG into a canvas and returns a data URL
function barcodeToDataURL(code, width = 300, height = 120) {
  return new Promise((resolve) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, code, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 12,
      margin: 8,
      background: '#ffffff',
      lineColor: '#000000',
    })
    const xml = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)))
  })
}

async function generatePDF(items, copies, companyName = 'Mayur Masala') {
  // Dynamically import jsPDF so it doesn't bloat initial load
  const { jsPDF } = await import('jspdf')

  // Label dimensions in mm (like a sticker sheet)
  const LABEL_W = 62
  const LABEL_H = 38
  const MARGIN_X = 8
  const MARGIN_Y = 8
  const GAP_X = 4
  const GAP_Y = 4
  const PAGE_W = 210  // A4
  const PAGE_H = 297

  const cols = Math.floor((PAGE_W - MARGIN_X * 2 + GAP_X) / (LABEL_W + GAP_X))
  const rows = Math.floor((PAGE_H - MARGIN_Y * 2 + GAP_Y) / (LABEL_H + GAP_Y))
  const perPage = cols * rows

  // Build flat list: each item repeated `copies` times
  const labels = []
  for (const item of items) {
    for (let i = 0; i < copies; i++) {
      labels.push(item)
    }
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.setFont('helvetica')

  for (let i = 0; i < labels.length; i++) {
    const item = labels[i]
    const pagePos = i % perPage
    if (i > 0 && pagePos === 0) doc.addPage()

    const col = pagePos % cols
    const row = Math.floor(pagePos / cols)
    const x = MARGIN_X + col * (LABEL_W + GAP_X)
    const y = MARGIN_Y + row * (LABEL_H + GAP_Y)

    // Label border
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, LABEL_W, LABEL_H, 2, 2)

    // Company name
    doc.setFontSize(7)
    doc.setTextColor(100, 100, 100)
    doc.setFont('helvetica', 'bold')
    doc.text(companyName.toUpperCase(), x + LABEL_W / 2, y + 5, { align: 'center' })

    // Item name (truncate if long)
    doc.setFontSize(8.5)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    const maxChars = 24
    const displayName = item.name.length > maxChars ? item.name.slice(0, maxChars - 1) + '…' : item.name
    doc.text(displayName, x + LABEL_W / 2, y + 10.5, { align: 'center' })

    // Price
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 150, 120)
    doc.text(`Rs. ${Number(item.price).toFixed(2)}`, x + LABEL_W / 2, y + 16, { align: 'center' })

    // Barcode image
    try {
      const dataUrl = await barcodeToDataURL(item.barcode, 400, 130)
      doc.addImage(dataUrl, 'PNG', x + 4, y + 18, LABEL_W - 8, 16)
    } catch (e) {
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text(item.barcode, x + LABEL_W / 2, y + 26, { align: 'center' })
    }
  }

  return doc
}

// ── Barcode preview card ──────────────────────────────
function BarcodeImage({ code, name, price }) {
  const svgRef = useRef()
  useEffect(() => {
    if (svgRef.current && code) {
      try {
        JsBarcode(svgRef.current, code, {
          format: 'CODE128', width: 2, height: 55,
          displayValue: true, fontSize: 10, margin: 5,
          background: '#ffffff', lineColor: '#0f1923',
        })
      } catch (e) {}
    }
  }, [code])

  return (
    <div className="barcode-card">
      <svg ref={svgRef} style={{ maxWidth: '100%' }} />
      <div className="barcode-name">{name}</div>
      <div className="barcode-price">₹{Number(price).toFixed(2)}</div>
    </div>
  )
}

// ── Print modal (shared for single item and all items) ──
function PrintModal({ items, title, onClose }) {
  const [copies, setCopies] = useState(1)
  const [generating, setGenerating] = useState(false)
  const toast = useToast()

  const handleGenerate = async () => {
    if (copies < 1) return toast('Enter at least 1 copy', 'error')
    setGenerating(true)
    try {
      const doc = await generatePDF(items, copies)
      const filename = items.length === 1
        ? `barcode-${items[0].name.replace(/\s+/g, '-').toLowerCase()}-x${copies}.pdf`
        : `mayur-masala-barcodes-x${copies}.pdf`
      doc.save(filename)
      toast(`PDF downloaded — ${items.length} item${items.length > 1 ? 's' : ''} × ${copies} cop${copies > 1 ? 'ies' : 'y'}`)
      onClose()
    } catch (e) {
      toast('Failed to generate PDF', 'error')
    }
    setGenerating(false)
  }

  const total = items.length * copies

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">🖨️ {title}</div>
        <div className="modal-subtitle">
          {items.length === 1
            ? `Printing barcode for: ${items[0].name}`
            : `${items.length} items — labels per item`}
        </div>

        {/* Item preview chips */}
        {items.length > 1 && items.length <= 6 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {items.map(i => (
              <span key={i.id} style={{ background: 'var(--paper)', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600 }}>
                {i.name}
              </span>
            ))}
          </div>
        )}
        {items.length > 6 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            {items.slice(0, 5).map(i => i.name).join(', ')} +{items.length - 5} more
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Number of copies per item</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className="btn btn-secondary"
              style={{ width: 44, padding: 0, flexShrink: 0 }}
              onClick={() => setCopies(c => Math.max(1, c - 1))}
            >−</button>
            <input
              className="form-input"
              type="number" min="1" max="500"
              value={copies}
              onChange={e => setCopies(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
              style={{ textAlign: 'center', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1.1rem' }}
            />
            <button
              className="btn btn-secondary"
              style={{ width: 44, padding: 0, flexShrink: 0 }}
              onClick={() => setCopies(c => Math.min(500, c + 1))}
            >+</button>
          </div>
        </div>

        {/* Summary */}
        <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total labels in PDF</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '1.1rem', color: 'var(--ink)' }}>
            {total} label{total !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-full" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary btn-full"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? '⏳ Generating PDF…' : `⬇️ Download PDF`}
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 10 }}>
          A4 sheet · 3×7 label grid · 62×38mm per label
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────
export default function ItemsPage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', price: '' })
  const [saving, setSaving] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  // printTarget: null | 'all' | item object
  const [printTarget, setPrintTarget] = useState(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('items').select('*').order('created_at', { ascending: false })
    if (error) toast('Failed to load items', 'error')
    else setItems(data || [])
    setLoading(false)
  }, [toast])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleAdd = async () => {
    if (!form.name.trim() || !form.price) return toast('Please fill all fields', 'error')
    const price = parseFloat(form.price)
    if (isNaN(price) || price <= 0) return toast('Enter a valid price', 'error')
    setSaving(true)
    const barcode = generateBarcodeCode(form.name, price)
    const { error } = await supabase.from('items').insert({ name: form.name.trim(), price, barcode })
    if (error) {
      if (error.code === '23505') toast('Item with similar code exists, try a different name', 'error')
      else toast('Failed to save item', 'error')
    } else {
      toast(`Item "${form.name}" added!`)
      setForm({ name: '', price: '' })
      setShowForm(false)
      fetchItems()
    }
    setSaving(false)
  }

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return
    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) toast('Failed to delete', 'error')
    else { toast(`"${name}" deleted`); fetchItems() }
  }

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(searchQ.toLowerCase()) ||
    i.barcode.includes(searchQ)
  )

  // Resolve what to pass to PrintModal
  const printItems = printTarget === 'all'
    ? filtered
    : printTarget
      ? [printTarget]
      : null

  return (
    <div className="page-wide">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Items & Barcodes</h1>
          <p className="page-subtitle">Manage products and print barcode labels</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            className="btn btn-secondary"
            onClick={() => items.length > 0 ? setPrintTarget('all') : toast('No items to print', 'error')}
            disabled={items.length === 0}
          >
            🖨️ Print All
          </button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Add
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          placeholder="Search items or barcodes…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="empty-state">
          <div className="empty-state-icon">⏳</div>
          <div className="empty-state-title">Loading items…</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">{searchQ ? 'No items match' : 'No items yet'}</div>
          {!searchQ && <button className="btn btn-primary mt-3" onClick={() => setShowForm(true)}>+ Add First Item</button>}
        </div>
      ) : (
        <div className="barcode-grid">
          {filtered.map(item => (
            <div key={item.id} style={{ position: 'relative' }}>
              <BarcodeImage code={item.barcode} name={item.name} price={item.price} />

              {/* Action buttons overlay */}
              <div style={{
                position: 'absolute', top: 8, right: 8,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <button
                  className="btn btn-dark btn-sm"
                  style={{ padding: '4px 8px', minHeight: 30, fontSize: '0.75rem' }}
                  title="Print this item"
                  onClick={() => setPrintTarget(item)}
                >🖨️</button>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ padding: '4px 8px', minHeight: 30, fontSize: '0.75rem' }}
                  title="Delete item"
                  onClick={() => handleDelete(item.id, item.name)}
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Item Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <div className="modal-title">Add New Item</div>
            <div className="modal-subtitle">A unique barcode will be generated automatically</div>

            <div className="form-group">
              <label className="form-label">Item Name</label>
              <input
                className="form-input"
                placeholder="e.g. Basmati Rice 5kg"
                value={form.name}
                autoFocus
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Price (₹)</label>
              <input
                className="form-input"
                type="number" min="0" step="0.01"
                placeholder="e.g. 299.00"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>

            {form.name && form.price && (
              <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 3 }}>Barcode preview</div>
                <div className="mono" style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.08em' }}>
                  {generateBarcodeCode(form.name, parseFloat(form.price) || 0)}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-full" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" onClick={handleAdd} disabled={saving}>
                {saving ? 'Saving…' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printItems && (
        <PrintModal
          items={printItems}
          title={printTarget === 'all' ? 'Print All Labels' : 'Print Label'}
          onClose={() => setPrintTarget(null)}
        />
      )}
    </div>
  )
}