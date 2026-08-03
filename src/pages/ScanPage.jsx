import { useState, useEffect, useRef, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
function ManualItemRow({ onAdd }) {
  const [name, setName]   = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty]     = useState(1)
  const [open, setOpen]   = useState(false)
  const toast = useToast()

  const handleAdd = () => {
    if (!name.trim())              return toast('Enter item name', 'error')
    const p = parseFloat(price)
    if (!price || isNaN(p) || p <= 0) return toast('Enter a valid price', 'error')
    onAdd({ name: name.trim(), price: p, qty })
    setName(''); setPrice(''); setQty(1); setOpen(false)
    toast(`"${name.trim()}" added manually`)
  }

  return (
    <div style={{
      background: 'var(--white)',
      border: '1.5px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
    }}>
      {/* Toggle header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.1rem' }}>✏️</span>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--ink)' }}>Add item manually</span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: '1.1rem', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▾
        </span>
      </button>

      {/* Expandable form */}
      {open && (
        <div style={{ padding: '0 14px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Name */}
            <div>
              <label className="form-label">Item Name</label>
              <input
                className="form-input"
                placeholder="e.g. Loose Haldi 100g"
                value={name}
                autoFocus
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Price + Qty in a row */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label className="form-label">Price (₹)</label>
                <input
                  className="form-input"
                  type="number" min="0" step="0.50"
                  placeholder="0.00"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div style={{ width: 90 }}>
                <label className="form-label">Qty</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: 32, padding: 0, flexShrink: 0 }}
                    onClick={() => setQty(q => Math.max(1, q - 1))}
                  >−</button>
                  <input
                    className="form-input"
                    type="number" min="1"
                    value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ textAlign: 'center', padding: '12px 4px', fontWeight: 700 }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: 32, padding: 0, flexShrink: 0 }}
                    onClick={() => setQty(q => q + 1)}
                  >+</button>
                </div>
              </div>
            </div>

            {/* Preview */}
            {name && price && !isNaN(parseFloat(price)) && (
              <div style={{ background: 'var(--paper)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{name} × {qty}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink)' }}>
                  ₹{(parseFloat(price) * qty).toFixed(2)}
                </span>
              </div>
            )}

            <button className="btn btn-primary btn-full" onClick={handleAdd}>
              + Add to Bill
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// Steps: 'start' | 'scanning' | 'result' | 'overview'
export default function ScanPage() {
  const toast = useToast()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [step, setStep] = useState('start')
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState([]) // [{item, qty}]
  const [scannedItem, setScannedItem] = useState(null) // {name, price, barcode}
  const [scanning, setScanning] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notFound, setNotFound] = useState(false)

  const videoRef = useRef(null)
  const readerRef = useRef(null)
  const scanLockRef = useRef(false)

  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      try { readerRef.current.reset() } catch (e) {}
    }
    setScanning(false)
  }, [])

  const startScanner = useCallback(async () => {
    setScanning(true)
    setNotFound(false)
    setScannedItem(null)
    scanLockRef.current = false

    try {
      const codeReader = new BrowserMultiFormatReader()
      readerRef.current = codeReader

      await codeReader.decodeFromVideoDevice(null, videoRef.current, async (result, err) => {
        if (result && !scanLockRef.current) {
          scanLockRef.current = true
          const code = result.getText()

          // Look up in Supabase
          const { data, error: dbErr } = await supabase
            .from('items')
            .select('*')
            .eq('barcode', code)
            .single()

          if (dbErr || !data) {
            setNotFound(true)
            toast(`Barcode "${code}" not found in items`, 'error')
            setTimeout(() => {
              scanLockRef.current = false
              setNotFound(false)
            }, 2500)
          } else {
            stopScanner()
            setScannedItem(data)
            setStep('result')
          }
        }
      })
    } catch (e) {
      setScanning(false)
      if (e.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access and try again.')
      } else {
        setError('Could not start camera: ' + e.message)
      }
    }
  }, [stopScanner, toast])

  // Start scanning when entering scanning step
  useEffect(() => {
    if (step === 'scanning') {
      startScanner()
    }
    return () => {
      if (step === 'scanning') stopScanner()
    }
  }, [step])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopScanner()
  }, [stopScanner])

  const handleNext = () => {
    // Add scanned item to cart
    setCart(prev => {
      const existing = prev.find(c => c.item.barcode === scannedItem.barcode)
      if (existing) {
        return prev.map(c => c.item.barcode === scannedItem.barcode
          ? { ...c, qty: c.qty + 1 }
          : c
        )
      }
      return [...prev, { item: scannedItem, qty: 1 }]
    })
    setStep('scanning')
  }

  const handleRetake = () => {
    setScannedItem(null)
    setStep('scanning')
  }

  const handleDone = () => {
    stopScanner()
    setStep('overview')
  }

  const handleRemoveCartItem = (barcode) => {
    setCart(prev => {
      const item = prev.find(c => c.item.barcode === barcode)
      if (item.qty > 1) {
        return prev.map(c => c.item.barcode === barcode ? { ...c, qty: c.qty - 1 } : c)
      }
      return prev.filter(c => c.item.barcode !== barcode)
    })
  }

  const handleSubmit = async () => {
    if (cart.length === 0) return toast('Cart is empty', 'error')
    setSubmitting(true)

    const total = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0)

    const { data: bill, error: billErr } = await supabase
      .from('bills')
      .insert({ customer_name: customerName.trim(), total_amount: total, status: 'pending', created_by: user?.email ?? '' })
      .select()
      .single()

    if (billErr) {
      toast('Failed to create bill', 'error')
      setSubmitting(false)
      return
    }

    const billItems = cart.map(c => ({
      bill_id: bill.id,
      item_id: c.item.id,
      item_name: c.item.name,
      item_price: c.item.price,
      quantity: c.qty,
    }))

    const { error: itemsErr } = await supabase.from('bill_items').insert(billItems)

    if (itemsErr) {
      toast('Bill created but items failed to save', 'error')
    } else {
      toast(`Bill submitted for ${customerName}!`)
      navigate('/dashboard')
    }
    setSubmitting(false)
  }

  const cartTotal = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0)
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0)

  // ─── Step: Start ───────────────────────────────────
  if (step === 'start') {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'var(--ink)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '3.5rem', marginBottom: '12px' }}>🧾</div>
          <h1 style={{ color: 'var(--white)', fontSize: '1.75rem', fontWeight: 700 }}>New Bill</h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: '6px', fontSize: '0.9rem' }}>
            Enter customer name to start scanning
          </p>
        </div>

        <div style={{ width: '100%', maxWidth: '360px' }}>
          <div className="form-group">
            <label className="form-label" style={{ color: 'rgba(255,255,255,0.5)' }}>Customer Name</label>
            <input
              className="form-input"
              style={{ background: 'var(--ink-mid)', border: '1.5px solid rgba(255,255,255,0.1)', color: 'var(--white)', fontSize: '1.05rem' }}
              placeholder="e.g. Ravi Kumar"
              value={customerName}
              autoFocus
              onChange={e => setCustomerName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && customerName.trim() && setStep('scanning')}
            />
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            style={{ marginTop: '8px' }}
            disabled={!customerName.trim()}
            onClick={() => setStep('scanning')}
          >
            Start Scanning →
          </button>

          <button
            className="btn btn-ghost btn-full"
            style={{ marginTop: '10px', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }}
            onClick={() => navigate('/')}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    )
  }

  // ─── Step: Scanning ────────────────────────────────
  if (step === 'scanning') {
    return (
      <div className="scanner-shell">
        <div className="scanner-nav">
          <div>
            <div className="scanner-title">📷 Scanning</div>
            <div className="scanner-subtitle">{customerName} · {cartCount} item{cartCount !== 1 ? 's' : ''} · ₹{cartTotal.toFixed(2)}</div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDone}
            disabled={cart.length === 0}
          >
            Done ({cartCount})
          </button>
        </div>

        <div className="scanner-body">
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '12px' }}>
            Point camera at barcode
          </p>

          {error ? (
            <div style={{ background: '#3b1a1a', border: '1px solid var(--danger)', borderRadius: 'var(--radius)', padding: '20px', color: '#fca5a5', textAlign: 'center', maxWidth: 400, width: '100%' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>📵</div>
              <div>{error}</div>
              <button className="btn btn-secondary btn-sm mt-3" onClick={() => { setError(''); startScanner() }}>
                Try Again
              </button>
            </div>
          ) : (
            <div className="video-wrapper">
              <video ref={videoRef} autoPlay playsInline muted />
              <div className="scan-overlay">
                <div className="scan-frame">
                  <div className="scan-line" />
                </div>
              </div>
              {notFound && (
                <div style={{
                  position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center',
                  color: '#fca5a5', background: 'rgba(239,68,68,0.15)', padding: '8px', fontSize: '0.8rem'
                }}>
                  ✕ Barcode not found — try again
                </div>
              )}
            </div>
          )}

          {/* Mini cart */}
          {cart.length > 0 && (
            <div className="scanner-cart">
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Cart ({cartCount} items)
              </div>
              {cart.slice(-4).map(c => (
                <div key={c.item.barcode} className="cart-item-row">
                  <span className="cart-item-name">{c.item.name}</span>
                  <span className="cart-item-qty">×{c.qty}</span>
                  <span className="cart-item-price">₹{(c.item.price * c.qty).toFixed(2)}</span>
                </div>
              ))}
              {cart.length > 4 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textAlign: 'center', padding: '4px' }}>
                  +{cart.length - 4} more items
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Step: Result ──────────────────────────────────
  if (step === 'result') {
    return (
      <div className="scanner-shell">
        <div className="scanner-nav">
          <div>
            <div className="scanner-title">✅ Item Found</div>
            <div className="scanner-subtitle">{customerName} · {cartCount} item{cartCount !== 1 ? 's' : ''} in cart</div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDone}
            disabled={cart.length === 0}
          >
            Done
          </button>
        </div>

        <div className="scanner-body" style={{ justifyContent: 'center', gap: '16px' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', textAlign: 'center' }}>
            Scanned item
          </div>

          <div className="result-card">
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🏷️</div>
            <div className="result-item-name">{scannedItem?.name}</div>
            <div className="result-item-price">₹{Number(scannedItem?.price).toFixed(2)}</div>
            <div className="result-barcode">{scannedItem?.barcode}</div>
          </div>

          <div className="scan-actions">
            <button className="btn btn-ghost btn-full btn-lg" style={{ color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)' }} onClick={handleRetake}>
              🔄 Retake
            </button>
            <button className="btn btn-primary btn-full btn-lg" onClick={handleNext}>
              ✓ Next →
            </button>
          </div>

          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: 'center' }}>
            <strong>Next</strong> adds item · <strong>Retake</strong> discards · <strong>Done</strong> to review
          </div>

          {cart.length > 0 && (
            <div className="scanner-cart" style={{ marginTop: '8px' }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>
                Cart so far
              </div>
              {cart.slice(-3).map(c => (
                <div key={c.item.barcode} className="cart-item-row">
                  <span className="cart-item-name">{c.item.name}</span>
                  <span className="cart-item-qty">×{c.qty}</span>
                  <span className="cart-item-price">₹{(c.item.price * c.qty).toFixed(2)}</span>
                </div>
              ))}
              {cart.length > 3 && (
                <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', textAlign: 'center', padding: '4px' }}>
                  +{cart.length - 3} more
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Step: Overview ────────────────────────────────
  if (step === 'overview') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--paper)' }}>

        {/* Dark header */}
        <div style={{
          background: 'var(--ink)',
          padding: `calc(20px + var(--sat, 0px)) 20px 20px`,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Customer</div>
          <div style={{ color: 'var(--white)', fontSize: '1.5rem', fontWeight: 700, marginTop: 4 }}>{customerName}</div>
          <div style={{ color: 'var(--teal)', fontSize: '2.2rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', marginTop: 6 }}>
            ₹{cartTotal.toFixed(2)}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.825rem', marginTop: 4 }}>
            {cartCount} item{cartCount !== 1 ? 's' : ''} · {cart.length} product{cart.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ padding: '16px', maxWidth: 520, margin: '0 auto' }}>

          {/* ── Manual item add card ── */}
          <ManualItemRow onAdd={(item) => {
            setCart(prev => {
              const key = `manual-${item.name.toLowerCase().trim()}`
              const existing = prev.find(c => c.item.barcode === key)
              if (existing) return prev.map(c => c.item.barcode === key ? { ...c, qty: c.qty + item.qty } : c)
              return [...prev, { item: { ...item, barcode: key, id: key }, qty: item.qty }]
            })
          }} />

          {/* ── Cart items ── */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 12 }}>
            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px' }}>
                <div className="empty-state-icon">🛒</div>
                <div className="empty-state-title">Cart is empty</div>
                <div className="empty-state-text">Scan items or add manually above</div>
              </div>
            ) : cart.map((c, i) => (
              <div key={c.item.barcode} style={{
                display: 'flex', alignItems: 'center',
                padding: '12px 14px',
                borderBottom: i < cart.length - 1 ? '1px solid var(--border)' : 'none',
                gap: 10,
              }}>
                {/* Manual item indicator */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.item.name}
                    </div>
                    {String(c.item.barcode).startsWith('manual-') && (
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>
                        MANUAL
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
                    ₹{Number(c.item.price).toFixed(2)} × {c.qty}
                  </div>
                </div>

                {/* Qty controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => handleRemoveCartItem(c.item.barcode)}
                  >−</button>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, minWidth: 22, textAlign: 'center', fontSize: '0.95rem' }}>{c.qty}</span>
                  <button
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setCart(prev => prev.map(cc => cc.item.barcode === c.item.barcode ? { ...cc, qty: cc.qty + 1 } : cc))}
                  >+</button>
                </div>

                {/* Line total */}
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.9rem', minWidth: 72, textAlign: 'right' }}>
                  ₹{(Number(c.item.price) * c.qty).toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* ── Actions ── */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-secondary btn-full" onClick={() => setStep('scanning')}>
              📷 Scan More
            </button>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleSubmit}
              disabled={submitting || cart.length === 0}
            >
              {submitting ? '⏳ Submitting…' : '✓ Submit Bill'}
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: 10, color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            Adjust quantities · Add items manually · Submit when ready
          </div>
        </div>
      </div>
    )
  }

  return null
}