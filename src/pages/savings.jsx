import { useState, useRef } from "react";

const fmt = (n) =>
  "₦" + Number(n || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const usd = (n) => "≈$" + (Number(n || 0) / 1380).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const ICONS = {
  savings: (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="8" fill="#2a2010" />
      <text x="14" y="20" textAnchor="middle" fontSize="16">🏦</text>
    </svg>
  ),
};

const initialHistory = [
  { id: 1, label: "Piggybank", type: "Savings", date: "2026-05-01", amount: 900000, isWithdrawal: false },
  { id: 2, label: "Withdraw", type: "Savings", date: "2026-05-01", amount: 900000, isWithdrawal: true },
  { id: 3, label: "April Ajo", type: "Contributions", date: "2026-04-01", amount: 500000, isWithdrawal: false },
];

function EditModal({ title, fields, onSave, onClose }) {
  const [vals, setVals] = useState(fields.reduce((acc, f) => ({ ...acc, [f.key]: f.value }), {}));
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center"
    }}>
      <div style={{
        background: "#1c1c2e", width: "100%", maxWidth: 430, borderRadius: "20px 20px 0 0",
        padding: "24px 20px 36px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</label>
            <input
              type={f.type || "text"}
              value={vals[f.key]}
              onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
              style={{
                width: "100%", background: "#2a2a40", border: "1px solid #3a3a55",
                borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15,
                outline: "none", boxSizing: "border-box"
              }}
              placeholder={f.placeholder || ""}
            />
          </div>
        ))}
        <button
          onClick={() => { onSave(vals); onClose(); }}
          style={{
            width: "100%", marginTop: 8, padding: "14px", borderRadius: 12,
            background: "linear-gradient(135deg, #f5a623, #e07b00)", border: "none",
            color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer"
          }}>
          Save
        </button>
      </div>
    </div>
  );
}

function AddEntryModal({ onSave, onClose }) {
  const [vals, setVals] = useState({ label: "", type: "Savings", amount: "", date: new Date().toISOString().split("T")[0], isWithdrawal: false });
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center"
    }}>
      <div style={{
        background: "#1c1c2e", width: "100%", maxWidth: 430, borderRadius: "20px 20px 0 0",
        padding: "24px 20px 36px", boxShadow: "0 -8px 40px rgba(0,0,0,0.5)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>Add Entry</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#aaa", fontSize: 22, cursor: "pointer" }}>×</button>
        </div>
        {[
          { key: "label", label: "Name", placeholder: "e.g. Monthly Savings" },
          { key: "type", label: "Category", placeholder: "e.g. Savings" },
          { key: "amount", label: "Amount (₦)", type: "number", placeholder: "0.00" },
          { key: "date", label: "Date", type: "date" },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</label>
            <input
              type={f.type || "text"}
              value={vals[f.key]}
              onChange={e => setVals(v => ({ ...v, [f.key]: e.target.value }))}
              style={{
                width: "100%", background: "#2a2a40", border: "1px solid #3a3a55",
                borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15,
                outline: "none", boxSizing: "border-box"
              }}
              placeholder={f.placeholder || ""}
            />
          </div>
        ))}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Transaction Type</label>
          <div style={{ display: "flex", gap: 10 }}>
            {["Deposit", "Withdrawal"].map(t => (
              <button key={t}
                onClick={() => setVals(v => ({ ...v, isWithdrawal: t === "Withdrawal" }))}
                style={{
                  flex: 1, padding: "10px", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 14,
                  background: (vals.isWithdrawal ? t === "Withdrawal" : t === "Deposit") ? "linear-gradient(135deg,#f5a623,#e07b00)" : "#2a2a40",
                  border: "1px solid #3a3a55", color: "#fff"
                }}>{t}</button>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            if (!vals.label || !vals.amount) return;
            onSave({ ...vals, id: Date.now(), amount: parseFloat(vals.amount) });
            onClose();
          }}
          style={{
            width: "100%", padding: "14px", borderRadius: 12,
            background: "linear-gradient(135deg, #f5a623, #e07b00)", border: "none",
            color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer"
          }}>
          Add Entry
        </button>
      </div>
    </div>
  );
}

export default function SavingsScreen() {
  const [openingBalance, setOpeningBalance] = useState(900000);
  const [savingsName, setSavingsName] = useState("Savings");
  const [history, setHistory] = useState(initialHistory);
  const [modal, setModal] = useState(null); // null | "opening" | "rename" | "add" | {editId}
  const [swipeItem, setSwipeItem] = useState(null);
  const touchStartX = useRef(null);

  const totalDeposited = history.filter(h => !h.isWithdrawal).reduce((s, h) => s + h.amount, 0);
  const totalWithdrawn = history.filter(h => h.isWithdrawal).reduce((s, h) => s + h.amount, 0);
  const balance = openingBalance + totalDeposited - totalWithdrawn;

  const handleSwipeStart = (e, id) => { touchStartX.current = e.touches[0].clientX; };
  const handleSwipeEnd = (e, id) => {
    if (touchStartX.current - e.changedTouches[0].clientX > 50) setSwipeItem(id);
    else setSwipeItem(null);
    touchStartX.current = null;
  };

  return (
    <div style={{
      background: "#12121f", minHeight: "100vh", maxWidth: 430, margin: "0 auto",
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "#fff", position: "relative", overflowX: "hidden"
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "52px 20px 16px"
      }}>
        <button style={{ background: "none", border: "none", color: "#aaa", fontSize: 22, cursor: "pointer" }}>×</button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>💰</span>
          <span
            onClick={() => setModal("rename")}
            style={{ fontWeight: 700, fontSize: 18, cursor: "pointer", borderBottom: "1px dashed #555" }}
          >{savingsName}</span>
          <span style={{ fontSize: 11, color: "#f5a623", background: "#2a1f00", padding: "2px 8px", borderRadius: 20 }}>✏️ tap to rename</span>
        </div>
        <button
          onClick={() => setModal("add")}
          style={{
            background: "linear-gradient(135deg, #f5a623, #e07b00)", border: "none",
            color: "#fff", width: 32, height: 32, borderRadius: "50%", fontSize: 20,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center"
          }}>+</button>
      </div>

      {/* Balance Card */}
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{
          background: "linear-gradient(135deg, #f5a623 0%, #e07b00 100%)",
          borderRadius: 20, padding: "24px 20px 20px", position: "relative", overflow: "hidden"
        }}>
          <div style={{
            position: "absolute", right: -20, top: -20, width: 120, height: 120,
            background: "rgba(255,255,255,0.12)", borderRadius: "50%"
          }} />
          <div style={{
            position: "absolute", right: 20, top: 30, width: 70, height: 70,
            background: "rgba(255,255,255,0.1)", borderRadius: "50%"
          }} />
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "1px", color: "rgba(255,255,255,0.75)", marginBottom: 8 }}>SAVINGS BALANCE</p>
          <p style={{ fontSize: 34, fontWeight: 800, margin: "0 0 4px", color: "#fff" }}>{fmt(balance)}</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 20 }}>{usd(balance)}</p>

          {/* Opening Balance row */}
          <div
            onClick={() => setModal("opening")}
            style={{
              background: "rgba(0,0,0,0.18)", borderRadius: 12, padding: "10px 14px",
              marginBottom: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center"
            }}>
            <div>
              <p style={{ fontSize: 10, letterSpacing: "0.8px", color: "rgba(255,255,255,0.7)", margin: 0 }}>OPENING BALANCE</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "2px 0 0" }}>{fmt(openingBalance)}</p>
            </div>
            <span style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>✏️</span>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "TOTAL DEPOSITED", val: fmt(totalDeposited) },
              { label: "TOTAL WITHDRAWN", val: fmt(totalWithdrawn) },
            ].map(item => (
              <div key={item.label} style={{
                flex: 1, background: "rgba(0,0,0,0.18)", borderRadius: 12, padding: "10px 12px"
              }}>
                <p style={{ fontSize: 10, letterSpacing: "0.6px", color: "rgba(255,255,255,0.7)", margin: "0 0 4px" }}>{item.label}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#fff", margin: 0 }}>{item.val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* History */}
      <div style={{ padding: "8px 16px 20px" }}>
        <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>History ({history.length})</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {history.map(item => (
            <div
              key={item.id}
              style={{ position: "relative", overflow: "hidden", borderRadius: 14 }}
              onTouchStart={e => handleSwipeStart(e, item.id)}
              onTouchEnd={e => handleSwipeEnd(e, item.id)}
            >
              {/* swipe action buttons */}
              <div style={{
                position: "absolute", right: 0, top: 0, bottom: 0,
                display: "flex", alignItems: "center", gap: 0,
                transform: swipeItem === item.id ? "translateX(0)" : "translateX(100%)",
                transition: "transform 0.25s ease"
              }}>
                <button
                  onClick={() => { setModal({ editId: item.id }); setSwipeItem(null); }}
                  style={{ background: "#3a6cf5", color: "#fff", border: "none", padding: "0 18px", height: "100%", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Edit</button>
                <button
                  onClick={() => { setHistory(h => h.filter(x => x.id !== item.id)); setSwipeItem(null); }}
                  style={{ background: "#e53e3e", color: "#fff", border: "none", padding: "0 18px", height: "100%", cursor: "pointer", fontSize: 13, fontWeight: 600, borderRadius: "0 14px 14px 0" }}>Del</button>
              </div>

              <div style={{
                background: "#1c1c2e", borderRadius: 14, padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 14,
                transform: swipeItem === item.id ? "translateX(-112px)" : "translateX(0)",
                transition: "transform 0.25s ease"
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: item.isWithdrawal ? "#2a1010" : "#1a2a10",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0
                }}>🏦</div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 15 }}>{item.label}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#888" }}>
                    {item.isWithdrawal ? "🔴" : "🟢"} {item.type} · {item.date}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: "0 0 2px", fontWeight: 700, fontSize: 16, color: item.isWithdrawal ? "#e07b00" : "#f5a623" }}>
                    {item.isWithdrawal ? "-" : "+"}{fmt(item.amount)}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#666" }}>{usd(item.amount)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        {history.length === 0 && (
          <div style={{ textAlign: "center", color: "#555", padding: "40px 0", fontSize: 14 }}>
            No transactions yet. Tap + to add one.
          </div>
        )}
      </div>

      {/* Swipe hint */}
      <p style={{ textAlign: "center", color: "#444", fontSize: 12, paddingBottom: 20 }}>← Swipe left on an entry to edit or delete</p>

      {/* Modals */}
      {modal === "opening" && (
        <EditModal
          title="Edit Opening Balance"
          fields={[
            { key: "amount", label: "Opening Balance (₦)", type: "number", value: openingBalance, placeholder: "0.00" }
          ]}
          onSave={v => setOpeningBalance(parseFloat(v.amount) || 0)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "rename" && (
        <EditModal
          title="Rename Savings"
          fields={[{ key: "name", label: "Savings Name", value: savingsName, placeholder: "e.g. Emergency Fund" }]}
          onSave={v => setSavingsName(v.name || savingsName)}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "add" && (
        <AddEntryModal
          onSave={entry => setHistory(h => [entry, ...h])}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.editId && (() => {
        const item = history.find(h => h.id === modal.editId);
        return (
          <EditModal
            title="Edit Entry"
            fields={[
              { key: "label", label: "Name", value: item.label },
              { key: "type", label: "Category", value: item.type },
              { key: "amount", label: "Amount (₦)", type: "number", value: item.amount },
              { key: "date", label: "Date", type: "date", value: item.date },
            ]}
            onSave={v => setHistory(h => h.map(x => x.id === item.id
              ? { ...x, label: v.label, type: v.type, amount: parseFloat(v.amount) || x.amount, date: v.date }
              : x
            ))}
            onClose={() => setModal(null)}
          />
        );
      })()}
    </div>
  );
}
