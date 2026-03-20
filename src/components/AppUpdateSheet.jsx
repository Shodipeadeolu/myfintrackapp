import './AppUpdateSheet.css'

export default function AppUpdateSheet({ onClose, update }) {
  const {
    updateAvailable, autoUpdate, toggleAutoUpdate,
    checkForUpdates, applyUpdate,
    checking, lastChecked, version
  } = update

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
          <span className="sheet-title">App Update</span>
          <span style={{ width: 40 }} />
        </div>
        <div className="sheet-body">

          {/* Version card */}
          <div className="update-version-card">
            <div className="update-app-icon">💸</div>
            <div className="update-app-name">FinTrack</div>
            <div className="update-version-badge">v{version}</div>
            <div className={`update-status-dot ${updateAvailable ? 'available' : 'current'}`} />
            <div className="update-status-text">
              {updateAvailable ? 'Update available' : 'You\'re up to date'}
            </div>
          </div>

          {/* Update available banner */}
          {updateAvailable && (
            <div className="update-banner">
              <div className="update-banner-text">
                <span className="update-banner-title">New version ready</span>
                <span className="update-banner-desc">Tap below to apply the update now</span>
              </div>
              <button className="btn btn-primary update-apply-btn" onClick={applyUpdate}>
                Update Now
              </button>
            </div>
          )}

          {/* Auto-update toggle */}
          <div className="update-setting-row">
            <div className="update-setting-info">
              <div className="update-setting-label">Auto Update</div>
              <div className="update-setting-desc">
                Automatically apply updates when available
              </div>
            </div>
            <button
              className={`toggle-btn ${autoUpdate ? 'on' : 'off'}`}
              onClick={() => toggleAutoUpdate(!autoUpdate)}
              aria-label="Toggle auto update"
            >
              <div className="toggle-knob" />
            </button>
          </div>

          {/* Last checked */}
          <div className="update-last-checked">
            Last checked: {lastChecked}
          </div>

          {/* Check now button */}
          <button
            className="btn btn-secondary btn-full"
            onClick={checkForUpdates}
            disabled={checking}
            style={{ marginTop: 8 }}
          >
            {checking ? (
              <><span className="spinner" style={{ width: 16, height: 16, marginRight: 8 }} /> Checking…</>
            ) : (
              '🔍 Check for Updates'
            )}
          </button>

        </div>
      </div>
    </>
  )
}
