/**
 * Cash balance: income in, expense out,
 * savings deposit out / withdraw in,
 * loans borrow in / repay out
 */
export function calcCashBalance(transactions) {
  return transactions.reduce((total, t) => {
    const amt = t.amount || 0
    if (t.type === 'income')  return total + amt
    if (t.type === 'expense') return total - amt
    if (t.type === 'savings') return t.subtype === 'withdraw' ? total + amt : total - amt
    if (t.type === 'loans')   return t.subtype === 'borrow'   ? total + amt : total - amt
    return total
  }, 0)
}

/** Current savings pool balance */
export function calcSavingsBalance(transactions) {
  return transactions.filter(t => t.type === 'savings').reduce((total, t) =>
    t.subtype === 'withdraw' ? total - t.amount : total + t.amount, 0)
}

/** Current outstanding loan balance */
export function calcLoanBalance(transactions) {
  return transactions.filter(t => t.type === 'loans').reduce((total, t) =>
    t.subtype === 'repay' ? total - t.amount : total + t.amount, 0)
}
