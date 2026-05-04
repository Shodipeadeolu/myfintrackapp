const SYMS = {
  NGN:'₦', USD:'$', EUR:'€', GBP:'£', GHS:'₵', KES:'KSh', ZAR:'R',
  EGP:'E£', AED:'AED', SAR:'SAR', CAD:'CA$', AUD:'A$', JPY:'¥', CNY:'¥',
  INR:'₹', BRL:'R$', MXN:'MX$', SGD:'S$', CHF:'CHF', HKD:'HK$', PHP:'₱',
  IDR:'Rp', MYR:'RM', THB:'฿', TRY:'₺', RUB:'₽', PLN:'zł', ILS:'₪',
  KRW:'₩', VND:'₫',
}

export const getSecSym = (code) => SYMS[code] || code

export function fmtSec(amount, secEnabled, secRate, secCurrency) {
  if (!secEnabled || !secRate || secRate <= 0 || amount == null) return null
  const converted = Math.abs(amount) / secRate
  const sym = getSecSym(secCurrency)
  if (converted >= 1_000_000) return `≈${sym}${(converted/1_000_000).toFixed(1)}M`
  if (converted >= 10_000)    return `≈${sym}${(converted/1_000).toFixed(0)}K`
  if (converted >= 1_000)     return `≈${sym}${(converted/1_000).toFixed(1)}K`
  return `≈${sym}${converted.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
