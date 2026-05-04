import { useState, useCallback } from 'react'

export function useSecondaryCurrency() {
  const [secEnabled, setSecEnabled] = useState(
    () => localStorage.getItem('ft-sec-currency-enabled') === 'true'
  )
  const [secCurrency, setSecCurrencyState] = useState(
    () => localStorage.getItem('ft-sec-currency') || 'USD'
  )
  const [secRate, setSecRateState] = useState(
    () => parseFloat(localStorage.getItem('ft-sec-rate') || '0') || 0
  )

  const toggleSec = (val) => {
    setSecEnabled(val)
    localStorage.setItem('ft-sec-currency-enabled', val ? 'true' : 'false')
  }

  const setSecCurrency = (code) => {
    setSecCurrencyState(code)
    localStorage.setItem('ft-sec-currency', code)
  }

  const setSecRate = (rate) => {
    setSecRateState(rate)
    localStorage.setItem('ft-sec-rate', String(rate))
  }

  // Convert primary amount to secondary
  const convertToSec = useCallback((amount) => {
    if (!secEnabled || !secRate || secRate <= 0) return null
    return amount / secRate
  }, [secEnabled, secRate])

  return { secEnabled, toggleSec, secCurrency, setSecCurrency, secRate, setSecRate, convertToSec }
}
