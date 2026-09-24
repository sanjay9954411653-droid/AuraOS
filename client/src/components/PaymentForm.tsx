import React, { useState, useEffect } from 'react'
import api, { getErrorMessage } from '../api'
import { Payment, PaymentStatus, PaymentMethod } from '../types/payment'
import { Order } from '../types/order'
import Modal from './Modal'
import Button from './Button'
import Input from './Input'
import { formatCurrency } from '../lib/utils'
import toast from 'react-hot-toast'

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'UPI', 'ONLINE']
const STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'REFUNDED']

interface PaymentFormProps {
  orderId: string
  onClose: () => void
  onPaymentSuccess: (payment: Payment) => void
}

interface SplitPaymentRow {
  id: number
  method: PaymentMethod
  amount: number
  reference: string
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  orderId: initialOrderId,
  onClose,
  onPaymentSuccess,
}) => {
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState(initialOrderId)

  const [orderTotal, setOrderTotal] = useState(0)
  const [alreadyPaid, setAlreadyPaid] = useState(0)

  // Normal payment
  const [amount, setAmount] = useState(0)
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [status, setStatus] = useState<PaymentStatus>('PAID')
  const [reference, setReference] = useState('')

  // Split payment
  const [splitMode, setSplitMode] = useState(false)
  const [splitPayments, setSplitPayments] = useState<SplitPaymentRow[]>([
    {
      id: 1,
      method: 'CASH',
      amount: 0,
      reference: '',
    },
    {
      id: 2,
      method: 'UPI',
      amount: 0,
      reference: '',
    },
  ])

  const [saving, setSaving] = useState(false)
  const [_loadingOrders, setLoadingOrders] = useState(!initialOrderId)

  // Fetch active orders if no orderId provided
  useEffect(() => {
    if (!initialOrderId) {
      api.get('/orders', { params: { limit: 100 } })
        .then((res) => {
          const active = (res.data.data?.items || []).filter(
            (o: Order) => !['COMPLETED', 'CANCELLED'].includes(o.status)
          )

          setOrders(active)
        })
        .catch((err) => toast.error(getErrorMessage(err)))
        .finally(() => setLoadingOrders(false))
    }
  }, [initialOrderId])

  // Load order total and already paid amount
  useEffect(() => {
    if (!selectedOrderId) return

    let cancelled = false

    Promise.all([
      api.get(`/orders/${selectedOrderId}`),
      api.get('/payments', { params: { limit: 500 } }),
    ])
      .then(([orderRes, paymentsRes]) => {
        if (cancelled) return

        const ord = orderRes.data.data?.order ?? orderRes.data.data
        const total = Number(ord?.total_amount || 0)

        setOrderTotal(total)

        const allPayments: Payment[] =
          paymentsRes.data.data?.items || []

        const paid = allPayments
          .filter(
            (p) =>
              p.order_id === selectedOrderId &&
              p.status === 'PAID'
          )
          .reduce((sum, p) => sum + Number(p.amount), 0)

        setAlreadyPaid(paid)

        const remaining = Math.max(0, total - paid)

        setAmount(remaining)

        // Reset split payments with the entire balance in the first row
        setSplitPayments([
          {
            id: 1,
            method: 'CASH',
            amount: remaining,
            reference: '',
          },
          {
            id: 2,
            method: 'UPI',
            amount: 0,
            reference: '',
          },
        ])
      })
      .catch((err) => toast.error(getErrorMessage(err)))

    return () => {
      cancelled = true
    }
  }, [selectedOrderId])

  const balance = Math.max(0, orderTotal - alreadyPaid)

  const isFullyPaid =
    orderTotal > 0 && alreadyPaid >= orderTotal

  // Split payment calculations
  const splitTotal = splitPayments.reduce(
    (sum, payment) => sum + (Number(payment.amount) || 0),
    0
  )

  const splitRemaining = Math.max(
    0,
    balance - splitTotal
  )

  const splitOverpaid = Math.max(
    0,
    splitTotal - balance
  )

  const updateSplitPayment = (
    id: number,
    field: keyof SplitPaymentRow,
    value: string | number
  ) => {
    setSplitPayments((current) =>
      current.map((payment) =>
        payment.id === id
          ? {
              ...payment,
              [field]: value,
            }
          : payment
      )
    )
  }

  const addSplitPayment = () => {
    const newId =
      splitPayments.length > 0
        ? Math.max(...splitPayments.map((p) => p.id)) + 1
        : 1

    setSplitPayments((current) => [
      ...current,
      {
        id: newId,
        method: 'CASH',
        amount: 0,
        reference: '',
      },
    ])
  }

  const removeSplitPayment = (id: number) => {
    if (splitPayments.length <= 1) {
      toast.error('At least one payment is required')
      return
    }

    setSplitPayments((current) =>
      current.filter((payment) => payment.id !== id)
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedOrderId) {
      toast.error('Please select an order')
      return
    }

    if (isFullyPaid) {
      toast.error('This order is already fully paid')
      return
    }

    if (splitMode) {
      await handleSplitPayment()
      return
    }

    if (amount <= 0) {
      toast.error('Amount must be greater than 0')
      return
    }

    if (amount > balance) {
      toast.error('Payment cannot exceed the remaining balance')
      return
    }

    if (
      (method === 'CARD' ||
        method === 'UPI' ||
        method === 'ONLINE') &&
      !reference
    ) {
      toast.error('Reference / transaction ID is required')
      return
    }

    setSaving(true)

    try {
      const res = await api.post('/payments', {
        order_id: selectedOrderId,
        amount,
        method,
        status,
        reference_number: reference || undefined,
      })

      const payment = res.data.data

      const newPaid = alreadyPaid + amount

      if (
        newPaid >= orderTotal &&
        orderTotal > 0 &&
        status === 'PAID'
      ) {
        try {
          await api.patch(`/orders/${selectedOrderId}`, {
            status: 'COMPLETED',
          })
        } catch {
          // Backend may already have completed the order
        }
      }

      onPaymentSuccess(payment)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleSplitPayment = async () => {
    if (splitPayments.length === 0) {
      toast.error('Add at least one payment')
      return
    }

    const validPayments = splitPayments.filter(
      (payment) => Number(payment.amount) > 0
    )

    if (validPayments.length === 0) {
      toast.error('Enter at least one payment amount')
      return
    }

    if (splitOverpaid > 0) {
      toast.error(
        `Split payment exceeds balance by ${formatCurrency(splitOverpaid)}`
      )
      return
    }

    if (splitRemaining > 0) {
      toast.error(
        `Remaining balance: ${formatCurrency(splitRemaining)}`
      )
      return
    }

    for (const payment of validPayments) {
      if (
        (payment.method === 'CARD' ||
          payment.method === 'UPI' ||
          payment.method === 'ONLINE') &&
        !payment.reference.trim()
      ) {
        toast.error(
          `Reference / transaction ID required for ${payment.method}`
        )
        return
      }
    }

    setSaving(true)

    try {
      let lastPayment: Payment | null = null

      for (const payment of validPayments) {
        const res = await api.post('/payments', {
          order_id: selectedOrderId,
          amount: Number(payment.amount),
          method: payment.method,
          status: 'PAID',
          reference_number:
            payment.reference.trim() || undefined,
        })

        lastPayment = res.data.data
      }

      // Complete order after all split payments are recorded
      try {
        await api.patch(`/orders/${selectedOrderId}`, {
          status: 'COMPLETED',
        })
      } catch {
        // Backend may already have completed the order
      }

      toast.success('Split payment completed successfully')

      if (lastPayment) {
        onPaymentSuccess(lastPayment)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={splitMode ? 'Split Payment' : 'Record Payment'}
      size="sm"
      footer={
        <div className="flex gap-3">
          <Button
            type="submit"
            form="payment-form"
            variant="primary"
            fullWidth
            isLoading={saving}
            disabled={
              isFullyPaid ||
              (splitMode &&
                (splitRemaining > 0 || splitOverpaid > 0))
            }
          >
            {splitMode
              ? 'Complete Split Payment'
              : 'Record Payment'}
          </Button>

          <Button
            variant="outline"
            fullWidth
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      }
    >
      <form
        id="payment-form"
        onSubmit={handleSubmit}
        className="space-y-4"
      >
        {/* Order selector */}
        {!initialOrderId ? (
          <div>
            <label className="form-label">
              Order <span className="text-red-500">*</span>
            </label>

            <select
              value={selectedOrderId}
              onChange={(e) =>
                setSelectedOrderId(e.target.value)
              }
              className="form-select w-full"
              required
            >
              <option value="">
                Select an order…
              </option>

              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_number} —{' '}
                  {formatCurrency(
                    Number(o.total_amount)
                  )}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600 border border-slate-200">
            <div className="flex justify-between">
              <span>Order total</span>

              <span className="font-semibold text-slate-900">
                {formatCurrency(orderTotal)}
              </span>
            </div>

            {alreadyPaid > 0 && (
              <div className="flex justify-between mt-1 text-emerald-700">
                <span>Already paid</span>

                <span className="font-semibold">
                  − {formatCurrency(alreadyPaid)}
                </span>
              </div>
            )}

            {orderTotal > 0 && (
              <div className="flex justify-between mt-1 pt-1 border-t border-slate-200 font-semibold">
                <span
                  className={
                    balance === 0
                      ? 'text-emerald-700'
                      : 'text-slate-900'
                  }
                >
                  {balance === 0
                    ? '✓ Fully paid'
                    : 'Balance due'}
                </span>

                <span
                  className={
                    balance === 0
                      ? 'text-emerald-700'
                      : 'text-slate-900'
                  }
                >
                  {formatCurrency(balance)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Already fully paid */}
        {isFullyPaid ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="text-emerald-700 font-semibold text-sm">
              ✓ This order is already fully paid
            </p>

            <p className="text-emerald-600 text-xs mt-1">
              No further payment is needed.
            </p>
          </div>
        ) : (
          <>
            {/* Payment mode switch */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSplitMode(false)}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  !splitMode
                    ? 'bg-white text-brand-600 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Single Payment
              </button>

              <button
                type="button"
                onClick={() => {
                  setSplitMode(true)

                  setSplitPayments([
                    {
                      id: 1,
                      method: 'CASH',
                      amount: balance,
                      reference: '',
                    },
                    {
                      id: 2,
                      method: 'UPI',
                      amount: 0,
                      reference: '',
                    },
                  ])
                }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  splitMode
                    ? 'bg-white text-brand-600 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Split Payment
              </button>
            </div>

            {!splitMode ? (
              <>
                <Input
                  label={`Amount${
                    balance > 0
                      ? ` (balance: ${formatCurrency(
                          balance
                        )})`
                      : ''
                  }`}
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={
                    balance > 0
                      ? balance
                      : undefined
                  }
                  value={amount || ''}
                  onChange={(e) =>
                    setAmount(
                      parseFloat(e.target.value) || 0
                    )
                  }
                  leftIcon={
                    <span className="text-slate-400 text-sm">
                      ₹
                    </span>
                  }
                  required
                  fullWidth
                />

                <div>
                  <label className="form-label">
                    Payment Method
                  </label>

                  <div className="grid grid-cols-4 gap-2">
                    {METHODS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                          method === m
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="form-label">
                    Status
                  </label>

                  <div className="grid grid-cols-3 gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStatus(s)}
                        className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                          status === s
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {(method === 'CARD' ||
                  method === 'ONLINE' ||
                  method === 'UPI') && (
                  <Input
                    label={`Reference / Transaction ID${
                      method === 'CARD'
                        ? ' *'
                        : ''
                    }`}
                    placeholder="e.g. TXN123456"
                    value={reference}
                    onChange={(e) =>
                      setReference(e.target.value)
                    }
                    required={method === 'CARD'}
                    fullWidth
                  />
                )}
              </>
            ) : (
              <>
                {/* Split payment summary */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">
                      Balance to pay
                    </span>

                    <span className="font-bold text-slate-900">
                      {formatCurrency(balance)}
                    </span>
                  </div>

                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-slate-600">
                      Split total
                    </span>

                    <span className="font-semibold">
                      {formatCurrency(splitTotal)}
                    </span>
                  </div>

                  <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between">
                    <span
                      className={
                        splitRemaining === 0 &&
                        splitOverpaid === 0
                          ? 'text-emerald-700 font-semibold'
                          : 'text-slate-600 font-semibold'
                      }
                    >
                      {splitOverpaid > 0
                        ? 'Overpayment'
                        : splitRemaining > 0
                        ? 'Remaining'
                        : '✓ Ready to pay'}
                    </span>

                    <span
                      className={
                        splitOverpaid > 0
                          ? 'text-red-600 font-bold'
                          : splitRemaining > 0
                          ? 'text-orange-600 font-bold'
                          : 'text-emerald-700 font-bold'
                      }
                    >
                      {formatCurrency(
                        splitOverpaid > 0
                          ? splitOverpaid
                          : splitRemaining
                      )}
                    </span>
                  </div>
                </div>

                {/* Split payment rows */}
                <div className="space-y-3">
                  {splitPayments.map(
                    (payment, index) => (
                      <div
                        key={payment.id}
                        className="border border-slate-200 rounded-xl p-3 bg-white"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-slate-700">
                            Payment {index + 1}
                          </span>

                          {splitPayments.length >
                            1 && (
                            <button
                              type="button"
                              onClick={() =>
                                removeSplitPayment(
                                  
