import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { APP_NAME, APP_FULL } from '../hooks/useAppUpdate'
import CategoryManager from '../components/CategoryManager'
import HouseholdManager from '../components/HouseholdManager'
import ImportSheet from '../components/ImportSheet'
import BankImportSheet from '../components/BankImportSheet'
import CurrencyPicker from '../components/CurrencyPicker'
import AppUpdateSheet from '../components/AppUpdateSheet'
import SecondaryCurrencySheet from '../components/SecondaryCurrencySheet'
import './Profile.css'

const CURRENCY_NAMES = {
  NGN:'Nigerian Naira', USD:'US Dollar', EUR:'Euro', GBP:'British Pound',
  GHS:'Ghanaian Cedi', KES:'Kenyan Shilling', ZAR:'South African Rand',
  EGP:'Egyptian Pound', AED:'UAE Dirham', CAD:'Canadian Dollar',
  AUD:'Australian Dollar', JPY:'Japanese Yen', CNY:'Chinese Yuan',
  INR:'Indian Rupee', BRL:'Brazilian Real', SGD:'Singapore Dollar',
}
const SYMS = { NGN:'₦', USD:'$', EUR:'€', GBP:'£', GHS:'₵', KES:'KSh', ZAR:'R', AED:'AED', SAR:'SAR', CAD:'CA$', AUD:'A$', JPY:'¥', CNY:'¥', INR:'₹', BRL:'R$', SGD:'S$', CHF:'CHF' }

export default function Profile() {
  const { user, profile, household, userRole, logout, currency, householdId, balanceRollover, setBalanceRollover, secEnabled, setSecEnabled, secCurrency, setSecCurrency, secRate, setSecRate, appUpdate: update } = useApp()
  const [activeSheet, setActiveSheet] = useState(null)

  const initials = (profile?.displayName || user?.email || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const currencyLabel = CURRENCY_NAMES[currency] || currency
  const secSym = SYMS[secCurrency] || secCurrency

  const menuItems = [
    { id: 'currency',     icon: '💱', label: 'Currency',             desc: `${currency} · ${currencyLabel}` },
    { id: 'sec-currency', icon: '🔁', label: 'Secondary Currency',    desc: secEnabled ? `On · ${secCurrency} (${secSym})` : 'Off — show only primary currency' },
    { id: 'types',        icon: '⊞', label: 'Transaction Types',     desc: 'Manage categories & subcategories' },
    { id: 'household',    icon: '🏠', label: 'Household',             desc: household ? household.name : 'Create or join a household' },
    { id: 'bank-import',   icon: '🏦', label: 'Import Bank Statement', desc: 'Upload CSV, XLSX or PDF from your bank' },
    { id: 'import',        icon: '📥', label: 'Import (XLSX Export)',  desc: 'Re-import a FinTrack export file' },
    { id: 'rollover',      icon: '🔄', label: 'Balance Rollover',      desc: balanceRollover ? 'On — closing balance carries forward' : 'Off — each month starts fresh', toggle: true, toggleValue: balanceRollover, onToggle: () => setBalanceRollover(!balanceRollover) },
    { id: 'update',       icon: '🔃', label: 'App Update',            desc: update.updateAvailable ? '🟢 Update available!' : `v${update.version} · Last checked ${update.lastChecked}`, badge: update.updateAvailable },
  ]

  return (
    <div className="screen">
      <div className="scroll-area">
        <div className="profile-header">
          <div className="avatar">{initials}</div>
          <div className="profile-info">
            <div className="profile-name">{profile?.displayName || 'You'}</div>
            <div className="profile-email">{user?.email}</div>
            {household && <div className="profile-badge">{userRole === 'owner' ? '👑 Owner' : `🏠 ${userRole}`}</div>}
          </div>
        </div>

        <div className="menu-section">
          {menuItems.map(item => (
            item.toggle ? (
              <div key={item.id} className="menu-row">
                <div className="menu-icon-wrap">{item.icon}</div>
                <div className="menu-text">
                  <div className="menu-label">{item.label}</div>
                  <div className="menu-desc">{item.desc}</div>
                </div>
                <button className={`profile-toggle ${item.toggleValue ? 'on' : 'off'}`} onClick={item.onToggle}>
                  <div className="profile-toggle-knob" />
                </button>
              </div>
            ) : (
              <button key={item.id} className="menu-row" onClick={() => setActiveSheet(item.id)}>
                <div className="menu-icon-wrap">{item.icon}</div>
                <div className="menu-text">
                  <div className="menu-label">{item.label}</div>
                  <div className={`menu-desc ${item.badge ? 'menu-desc-accent' : ''}`}>{item.desc}</div>
                </div>
                <span className="menu-arrow">›</span>
              </button>
            )
          ))}
        </div>

        <div className="menu-section">
          <button className="menu-row danger-row" onClick={logout}>
            <div className="menu-icon-wrap">🚪</div>
            <div className="menu-text"><div className="menu-label">Sign Out</div></div>
          </button>
        </div>

        <div className="profile-footer">
          <p>{APP_NAME} · {APP_FULL}</p>
          <p>Built with ♥ · v{update.version}</p>
        </div>
      </div>

      {activeSheet === 'currency'     && <CurrencyPicker onClose={() => setActiveSheet(null)} />}
      {activeSheet === 'types'        && <CategoryManager onClose={() => setActiveSheet(null)} />}
      {activeSheet === 'household'    && <HouseholdManager onClose={() => setActiveSheet(null)} />}
      {activeSheet === 'import'       && <ImportSheet onClose={() => setActiveSheet(null)} />}
      {activeSheet === 'bank-import'  && <BankImportSheet onClose={() => setActiveSheet(null)} />}
      {activeSheet === 'update'       && <AppUpdateSheet onClose={() => setActiveSheet(null)} update={update} />}
      {activeSheet === 'sec-currency' && <SecondaryCurrencySheet onClose={() => setActiveSheet(null)} secEnabled={secEnabled} toggleSec={setSecEnabled} secCurrency={secCurrency} setSecCurrency={setSecCurrency} secRate={secRate} setSecRate={setSecRate} primaryCurrency={currency} />}
    </div>
  )
}
