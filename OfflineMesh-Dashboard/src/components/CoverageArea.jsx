import './CoverageArea.css';

const STATUS_COLOR = {
  ACTIVE:  '#ef4444',
  STANDBY: '#f59e0b',
};

export default function CoverageArea({ coverageArea }) {
  if (!coverageArea) return null;

  return (
    <div className="coverage-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Coverage / Incident Area</h2>
          <p className="panel-sub-text">{coverageArea.name}</p>
        </div>
        {coverageArea.isDemo && (
          <span className="demo-badge">⚠ Demo Data</span>
        )}
      </div>

      {coverageArea.isDemo && (
        <div className="coverage-demo-notice">
          📌 Location data is approximate — no real GPS coordinates are used in this demo.
        </div>
      )}

      <div className="coverage-areas">
        {coverageArea.subAreas.map((area) => {
          const color = STATUS_COLOR[area.status] || '#6b7280';
          return (
            <div key={area.name} className="coverage-area-row">
              <div className="coverage-area-left">
                <span className="coverage-dot" style={{ background: color }} />
                <div>
                  <p className="coverage-area-name">{area.name}</p>
                  <p className="coverage-area-devices">
                    ~{area.devicesEstimate} device{area.devicesEstimate !== 1 ? 's' : ''} estimated
                  </p>
                </div>
              </div>
              <span
                className="coverage-status-badge"
                style={{ color, background: `${color}15`, borderColor: `${color}35` }}
              >
                {area.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
