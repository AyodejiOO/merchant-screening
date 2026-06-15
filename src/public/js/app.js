/* ── Utilities ──────────────────────────────────────────────────────────── */
async function parseError(r) {
  try {
    const data = await r.json();
    return data.error || data.message || r.statusText;
  } catch (_) {
    return r.statusText || `HTTP ${r.status}`;
  }
}

const api = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await parseError(r));
    return r.json();
  },
  async post(url, body) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await parseError(r));
    return r.json();
  },
  async put(url, body) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await parseError(r));
    return r.json();
  },
  async postForm(url, formData) {
    const r = await fetch(url, { method: 'POST', body: formData });
    if (!r.ok) throw new Error(await parseError(r));
    return r.json();
  },
};

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function fmtDate(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString();
}

function fmtStatus(status) {
  const map = {
    confirmed_match: '<span class="badge badge-danger">Confirmed Match</span>',
    potential_match: '<span class="badge badge-warn">Potential Match</span>',
    review:          '<span class="badge badge-info">Review</span>',
    clear:           '<span class="badge badge-success">Clear</span>',
    pending:         '<span class="badge badge-neutral">Pending</span>',
    running:         '<span class="badge badge-info">Running</span>',
    completed:       '<span class="badge badge-success">Completed</span>',
    failed:          '<span class="badge badge-danger">Failed</span>',
    never:           '<span class="badge badge-neutral">Never synced</span>',
    success:         '<span class="badge badge-success">OK</span>',
  };
  return map[status] || `<span class="badge badge-neutral">${status}</span>`;
}

function scoreClass(score) {
  if (score >= 85) return 'score-high';
  if (score >= 70) return 'score-medium';
  return 'score-low';
}

// Confidence visualization helpers
function gaugeZone(score) {
  if (score == null || score === 0) return 'none';
  if (score >= 85) return 'high';
  if (score >= 70) return 'medium';
  return 'low';
}

function renderScoreGauge(score) {
  const zone = gaugeZone(score);
  if (zone === 'none') {
    return `<span class="score-gauge is-none">
      <span class="score-gauge-track"></span>
      <span class="score-gauge-num is-none">—</span>
    </span>`;
  }
  const pct = Math.max(0, Math.min(100, score));
  return `<span class="score-gauge">
    <span class="score-gauge-track" aria-hidden="true">
      <span class="score-gauge-marker is-${zone}" style="left:${pct}%"></span>
    </span>
    <span class="score-gauge-num is-${zone}">${score}%</span>
  </span>`;
}

function renderDistribution(byStatus, totalRecords, activeFilter) {
  // Normalise: byStatus is [{status, count}, ...]
  const counts = { confirmed_match: 0, potential_match: 0, review: 0, clear: 0 };
  for (const row of (byStatus || [])) counts[row.status] = row.count;

  const total = totalRecords || Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return `<div class="distribution">
      <div class="distribution-bar"><div class="distribution-bar-segment is-empty">No results yet</div></div>
    </div>`;
  }

  const segments = [
    { key: 'confirmed_match', cls: 'is-confirmed', label: 'confirmed', count: counts.confirmed_match },
    { key: 'potential_match', cls: 'is-potential', label: 'potential', count: counts.potential_match },
    { key: 'review',          cls: 'is-review',    label: 'review',    count: counts.review },
    { key: 'clear',           cls: 'is-clear',     label: 'clear',     count: counts.clear },
  ];

  const filterCls = activeFilter && activeFilter !== 'all' ? `filter-${activeFilter}` : '';
  const summaryParts = [
    `<span class="total">${total.toLocaleString()} merchants</span>`,
    ...segments.filter(s => s.count > 0).map(s =>
      `<span class="stat"><span class="stat-num">${s.count.toLocaleString()}</span> ${s.label}</span>`
    ),
  ];

  const barHtml = segments
    .filter(s => s.count > 0)
    .map(s => {
      const pct = (s.count / total) * 100;
      const showLabel = pct >= 12;          // hide label below ~12% width
      const labelHtml = showLabel ? ` <span class="seg-label">${s.label}</span>` : '';
      return `<div class="distribution-bar-segment ${s.cls}" style="flex: ${s.count} ${s.count} 0%" title="${s.count.toLocaleString()} ${s.label}">${s.count}${labelHtml}</div>`;
    })
    .join('');

  return `<div class="distribution">
    <div class="distribution-summary">${summaryParts.join('')}</div>
    <div class="distribution-bar ${filterCls}">${barHtml}</div>
  </div>`;
}

/* ── Tab navigation ─────────────────────────────────────────────────────── */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');

    if (btn.dataset.tab === 'dashboard') Dashboard.refresh();
    if (btn.dataset.tab === 'jobs')      Jobs.load();
    if (btn.dataset.tab === 'settings')  Settings.load();
  });
});

/* ── Modal ──────────────────────────────────────────────────────────────── */
const Modal = {
  open(title, html) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-overlay').classList.remove('hidden');
  },
  close() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },
};

/* ── Header stats ────────────────────────────────────────────────────────── */
async function refreshHeaderStats() {
  try {
    const h = await api.get('/api/health');
    document.getElementById('total-badge').className = 'badge badge-info';
    document.getElementById('total-badge').textContent =
      `${h.totalEntries.toLocaleString()} sanction entries loaded`;
  } catch (_) {}
}

/* ── Progress chip (global batch job indicator) ──────────────────────────── */
const Progress = {
  POLL_ACTIVE: 5000,
  POLL_IDLE:   30000,
  pollTimer:   null,
  errorDismissedAt: 0,

  start() { this.tick(); },

  // Called when a new batch is submitted, to skip the idle wait.
  kick() {
    clearTimeout(this.pollTimer);
    this.tick();
  },

  // Called when the user clicks the chip — switch to Jobs tab and dismiss any error state.
  openJobsTab() {
    this.errorDismissedAt = Date.now();
    const jobsTab = document.querySelector('.tab[data-tab="jobs"]');
    if (jobsTab) jobsTab.click();
    const chip = document.getElementById('progress-chip');
    if (chip) chip.classList.add('hidden');
  },

  async tick() {
    let nextDelay = this.POLL_IDLE;
    try {
      const data = await api.get('/api/screening/jobs/active');
      const visible = this.render(data);
      if (visible) nextDelay = this.POLL_ACTIVE;
    } catch (_) { /* silent — not critical */ }

    clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => this.tick(), nextDelay);
  },

  render({ running = [], recentlyCompleted = [] }) {
    const chip = document.getElementById('progress-chip');
    if (!chip) return false;

    const failed    = recentlyCompleted.filter(j => j.status === 'failed');
    const succeeded = recentlyCompleted.filter(j => j.status === 'completed');

    chip.classList.remove('is-completed', 'is-error');

    // Priority: running > failed > completed > hidden
    if (running.length > 0) {
      const job = running[0];
      const total = job.total_records || 0;
      const done  = job.processed_records || 0;
      const pct = total > 0 ? Math.min(100, Math.floor(100 * done / total)) : 0;

      const text = running.length > 1
        ? `${running.length} jobs running`
        : (job.job_name || 'Batch screening');

      chip.querySelector('.progress-chip-text').textContent    = text;
      chip.querySelector('.progress-chip-percent').textContent = `${pct}%`;
      chip.style.setProperty('--progress', `${pct}%`);
      chip.classList.remove('hidden');
      return true;
    }

    // Failed: respect dismissal timestamp
    const visibleFailed = failed.filter(j => {
      const t = new Date(j.completed_at + 'Z').getTime();
      return t > this.errorDismissedAt;
    });
    if (visibleFailed.length > 0) {
      chip.classList.add('is-error');
      chip.querySelector('.progress-chip-text').textContent = visibleFailed.length > 1
        ? `${visibleFailed.length} jobs failed`
        : `Failed: ${visibleFailed[0].job_name}`;
      chip.querySelector('.progress-chip-percent').textContent = '✕';
      chip.style.setProperty('--progress', '100%');
      chip.classList.remove('hidden');
      return true;
    }

    if (succeeded.length > 0) {
      chip.classList.add('is-completed');
      chip.querySelector('.progress-chip-text').textContent = succeeded.length > 1
        ? `${succeeded.length} jobs completed`
        : `Completed: ${succeeded[0].job_name}`;
      chip.querySelector('.progress-chip-percent').textContent = '✓';
      chip.style.setProperty('--progress', '100%');
      chip.classList.remove('hidden');
      return true;
    }

    chip.classList.add('hidden');
    return false;
  },
};

/* ── Dashboard ──────────────────────────────────────────────────────────── */
const Dashboard = {
  async refresh() {
    await Promise.all([this.loadStatus(), this.loadMediaSources(), this.loadRecentJobs()]);
    refreshHeaderStats();
  },

  async loadStatus() {
    const grid = document.getElementById('status-grid');
    try {
      const data = await api.get('/api/lists/status');
      grid.innerHTML = Object.entries(data).map(([src, info]) => `
        <div class="status-card">
          <div class="status-card-header">
            <span class="status-card-name">${src}</span>
            ${fmtStatus(info.lastStatus)}
          </div>
          <div>
            <div class="status-card-count">${info.recordCount.toLocaleString()}</div>
            <div class="status-card-label">entries</div>
          </div>
          <div class="status-card-meta">
            <span>📋 ${info.label}</span>
            <span>Last sync: ${fmtDate(info.lastSync)}</span>
          </div>
          ${info.error ? `<div class="status-error">⚠ ${info.error}</div>` : ''}
          <div class="status-card-sync-btn">
            <button class="btn btn-ghost btn-sm btn-full" onclick="Dashboard.syncOne('${src}')">
              Sync ${src}
            </button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      grid.innerHTML = `<div class="placeholder">Failed to load: ${err.message}</div>`;
    }
  },

  async loadRecentJobs() {
    const el = document.getElementById('recent-jobs');
    try {
      const jobs = await api.get('/api/screening/jobs');
      if (!jobs.length) {
        el.innerHTML = '<div class="placeholder">No jobs yet — run a batch screen to get started.</div>';
        return;
      }
      el.innerHTML = `
        <div class="recent-jobs-wrap">
          <table class="recent-jobs-table">
            <thead><tr>
              <th>Job Name</th><th>Type</th><th>Status</th>
              <th>Records</th><th>Matches</th><th>Created</th>
            </tr></thead>
            <tbody>${jobs.slice(0, 10).map(j => `
              <tr>
                <td>${j.job_name}</td>
                <td><span class="badge badge-neutral">${j.job_type}</span></td>
                <td>${fmtStatus(j.status)}</td>
                <td>${j.processed_records} / ${j.total_records}</td>
                <td>${j.match_count}</td>
                <td>${fmtDate(j.created_at)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="placeholder">Failed to load jobs: ${err.message}</div>`;
    }
  },

  async checkUpdates() {
    toast('Checking remote lists for updates…', 'info');
    try {
      const results = await api.get('/api/lists/check-updates');
      const grid    = document.getElementById('status-grid');

      // Overlay update badges on existing cards
      for (const [src, info] of Object.entries(results)) {
        const cards = grid.querySelectorAll('.status-card');
        for (const card of cards) {
          if (card.querySelector('.status-card-name')?.textContent !== src) continue;
          // Remove previous update notice
          card.querySelectorAll('.update-notice').forEach(el => el.remove());
          const notice = document.createElement('div');
          notice.className = 'update-notice';
          notice.style.cssText = 'margin-top:.5rem;font-size:.75rem;padding:.4rem .6rem;border-radius:5px;';
          if (info.status === 'manual') {
            notice.style.background = 'var(--c-bg)';
            notice.style.color      = 'var(--c-muted)';
            notice.textContent      = '📂 Manual import';
          } else if (info.updateAvailable) {
            notice.style.background = 'var(--c-warn-bg)';
            notice.style.color      = 'var(--c-warn)';
            notice.innerHTML        = `⚠ ${info.message} <button class="btn btn-sm btn-warn-outline" style="margin-left:.5rem;padding:.2rem .5rem;font-size:.7rem" onclick="Dashboard.syncOne('${src}')">Sync now</button>`;
          } else {
            notice.style.background = 'var(--c-ok-bg)';
            notice.style.color      = 'var(--c-success)';
            notice.textContent      = `✓ ${info.message}`;
          }
          card.appendChild(notice);
        }
      }

      const needsUpdate = Object.values(results).filter(r => r.updateAvailable).length;
      toast(needsUpdate ? `${needsUpdate} list(s) have updates available` : 'All lists are up to date', needsUpdate ? 'info' : 'success');
    } catch (err) {
      toast(`Update check failed: ${err.message}`, 'error');
    }
  },

  async syncOne(src) {
    toast(`Syncing ${src}…`, 'info');
    try {
      const r = await api.post(`/api/lists/sync/${src}`, {});
      toast(`${src} synced — ${r.count.toLocaleString()} entries`, 'success');
      await this.loadStatus();
      refreshHeaderStats();
    } catch (err) {
      toast(`${src} sync failed: ${err.message}`, 'error');
      await this.loadStatus();
    }
  },

  async loadMediaSources() {
    const grid = document.getElementById('media-sources-grid');
    if (!grid) return;
    try {
      const sources = await api.get('/api/media/sources');
      grid.innerHTML = sources.map(s => {
        const statusBadge = s.lastStatus === 'success'  ? '<span class="badge badge-success">OK</span>'
          : s.lastStatus === 'error'    ? '<span class="badge badge-danger">Error</span>'
          : '<span class="badge badge-neutral">Never tested</span>';

        return `
          <div class="status-card">
            <div class="status-card-header">
              <span class="status-card-name">${s.label}</span>
              ${statusBadge}
            </div>
            <div>
              <div class="status-card-count">${s.lastCount ? s.lastCount.toLocaleString() : '—'}</div>
              <div class="status-card-label">articles last fetch</div>
            </div>
            <div class="status-card-meta">
              <span>Last used: ${fmtDate(s.lastUsed) || 'never'}</span>
            </div>
            ${s.error ? `<div class="status-error">⚠ ${s.error}</div>` : ''}
            <div class="status-card-sync-btn">
              <button class="btn btn-ghost btn-sm btn-full"
                onclick="Dashboard.testMediaSource('${s.name}')">
                Test ${s.label}
              </button>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      grid.innerHTML = `<div class="placeholder">Failed to load media sources: ${err.message}</div>`;
    }
  },

  async testMediaSource(src) {
    toast(`Testing ${src}…`, 'info');
    try {
      const r = await api.post(`/api/media/sources/${src}/sync`, {});
      toast(
        r.status === 'success'
          ? `${src} OK — ${r.count} articles returned`
          : `${src} error: ${r.error}`,
        r.status === 'success' ? 'success' : 'error'
      );
      await this.loadMediaSources();
    } catch (err) {
      toast(`Test failed: ${err.message}`, 'error');
    }
  },

  async testMediaSources() {
    const sources = await api.get('/api/media/sources');
    for (const s of sources) {
      await this.testMediaSource(s.name);
    }
  },

  async syncAll() {
    toast('Syncing all lists… this may take a few minutes', 'info');
    try {
      const r = await api.post('/api/lists/sync-all', {});
      const ok  = Object.values(r.results).filter(v => v.status === 'success').length;
      const fail = Object.values(r.results).filter(v => v.status === 'failed').length;
      toast(`Sync complete: ${ok} succeeded, ${fail} failed`, ok && !fail ? 'success' : 'error');
      await this.loadStatus();
      refreshHeaderStats();
    } catch (err) {
      toast(`Sync failed: ${err.message}`, 'error');
    }
  },
};

/* ── Single Lookup ───────────────────────────────────────────────────────── */
/* ── Category labels for adverse media ───────────────────────────────────── */
const CATEGORY_LABELS = {
  financial_crime:     'Financial Crime',
  sanctions_violation: 'Sanctions',
  terrorism:           'Terrorism',
  corruption:          'Corruption',
  regulatory:          'Regulatory',
  reputation:          'Reputation',
  other:               'Other',
};

function fmtMediaStatus(status) {
  const map = {
    confirmed_adverse: '<span class="badge badge-danger">Confirmed Adverse</span>',
    potential_adverse: '<span class="badge badge-warn">Potential Adverse</span>',
    review:            '<span class="badge badge-info">Review</span>',
    clear:             '<span class="badge badge-success">Clear</span>',
  };
  return map[status] || `<span class="badge badge-neutral">${status}</span>`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) { return dateStr; }
}

const Lookup = {
  // Which checks are currently active (both on by default).
  activeChecks: new Set(['sanctions', 'media']),

  toggleCheck(check, btn) {
    if (this.activeChecks.has(check)) {
      // Must keep at least one check active.
      if (this.activeChecks.size === 1) return;
      this.activeChecks.delete(check);
      btn.classList.remove('active');
    } else {
      this.activeChecks.add(check);
      btn.classList.add('active');
    }
    this.updateFieldVisibility();
  },

  updateFieldVisibility() {
    const thresholdField = document.getElementById('lookup-threshold-field');
    const lookbackField  = document.getElementById('lookup-lookback-field');
    if (!thresholdField || !lookbackField) return;
    thresholdField.classList.toggle('hidden', !this.activeChecks.has('sanctions'));
    lookbackField.classList.toggle('hidden',  !this.activeChecks.has('media'));
  },

  onLookbackChange(select) {
    const wrap = document.getElementById('lookup-lookback-custom-wrap');
    const input = document.getElementById('lookup-lookback-custom');
    if (!wrap) return;
    if (select.value === 'custom') {
      wrap.classList.remove('hidden');
      wrap.style.display = 'flex';
      input?.focus();
    } else {
      wrap.classList.add('hidden');
      wrap.style.display = 'none';
      if (input) input.value = '';
    }
  },

  getLookbackDays() {
    const select = document.getElementById('lookup-lookback');
    if (select?.value === 'custom') {
      const years = parseFloat(document.getElementById('lookup-lookback-custom')?.value);
      return years > 0 ? Math.round(years * 365) : 365;
    }
    return parseInt(select?.value, 10) || 365;
  },

  async run() {
    const name      = document.getElementById('lookup-name').value.trim();
    const threshold = parseFloat(document.getElementById('lookup-threshold').value) || 60;
    const lookbackDays = this.getLookbackDays();

    if (!name) { toast('Please enter a name to screen', 'error'); return; }
    if (this.activeChecks.size === 0) { toast('Select at least one check type', 'error'); return; }

    const resultsEl = document.getElementById('lookup-results');
    resultsEl.classList.remove('hidden');
    resultsEl.innerHTML = `<div class="placeholder"><span class="spinner-quiet" aria-hidden="true"></span>Screening${this.activeChecks.has('media') ? ' — adverse media may take a few seconds' : ''}…</div>`;

    try {
      const data = await api.post('/api/screen/single', {
        name,
        checks:      [...this.activeChecks],
        threshold,
        lookbackDays,
      });
      resultsEl.innerHTML = this.renderUnifiedResult(data);
    } catch (err) {
      resultsEl.innerHTML = `<div class="placeholder">Error: ${err.message}</div>`;
    }
  },

  renderUnifiedResult(data) {
    let html = '';

    // Sanctions section
    if (data.sanctions) {
      html += this.renderSanctionsSection(data.sanctions, data.name);
    }

    // Adverse media section
    if (data.adverseMedia) {
      html += this.renderMediaSection(data.adverseMedia, data.name);
    }

    return html || '<div class="placeholder">No results.</div>';
  },

  renderSanctionsSection(s, name) {
    const icons  = { confirmed_match: '🚫', potential_match: '⚠️', review: '🔍', clear: '✅' };
    const labels = { confirmed_match: 'Confirmed Match', potential_match: 'Potential Match', review: 'Review Required', clear: 'Clear' };

    let html = `<div class="results-section">
      <div class="results-section-header">
        <span class="results-section-title">Sanctions Screening</span>
        <span class="results-section-badge">${fmtStatus(s.status)}</span>
      </div>
      <div class="result-status-bar ${s.status}">
        <span class="result-status-icon">${icons[s.status] || '🔍'}</span>
        <div>
          <div class="result-status-text">${labels[s.status] || s.status}</div>
          <div class="hint">"${name}" — ${(s.matches || []).length} match(es) found</div>
        </div>
      </div>`;

    if (s.error) {
      html += `<div class="placeholder">Sanctions check failed: ${s.error}</div>`;
    } else if (!s.matches?.length) {
      html += `<p class="muted" style="padding:var(--space-4) 0;font-size:.875rem">No sanctions matches found above threshold.</p>`;
    } else {
      html += s.matches.map(m => this.renderMatchCard(m)).join('');
    }
    return html + '</div>';
  },

  renderMediaSection(a, name) {
    let html = `<div class="results-section">
      <div class="results-section-header">
        <span class="results-section-title">Adverse Media</span>
        <span class="results-section-badge">${fmtMediaStatus(a.status)}</span>
        ${a.findings?.length ? `<span class="hint">${a.findings.length} finding${a.findings.length !== 1 ? 's' : ''} · ${a.lookbackDays}d lookback</span>` : ''}
      </div>`;

    if (a.error) {
      html += `<div class="placeholder">Adverse media check failed: ${a.error}</div>`;
    } else if (!a.findings?.length) {
      html += `<p class="muted" style="padding:var(--space-4) 0;font-size:.875rem">No adverse media findings above threshold.</p>`;
    } else {
      html += a.findings.map(f => this.renderFindingCard(f)).join('');
    }

    // Source attribution line
    if (a.sourcesUsed?.length) {
      const src = a.sourcesUsed.map(s => {
        const err = s.error ? ` <span class="badge badge-danger" title="${s.error}">⚠ error</span>` : '';
        return `${s.label} (${s.articleCount})${err}`;
      }).join(', ');
      html += `<p class="hint" style="margin-top:var(--space-3)">Sources: ${src}</p>`;
    }

    return html + '</div>';
  },

  renderFindingCard(f) {
    const catLabel = CATEGORY_LABELS[f.category] || f.category || 'Other';
    const dateStr  = f.publishedAt ? `<span class="finding-card-date">${fmtDate(f.publishedAt)}</span>` : '';
    const snippet  = f.snippet
      ? `<div class="finding-card-snippet">${f.snippet}</div>`
      : '';

    return `
      <div class="finding-card">
        <div class="finding-card-header">
          <div class="finding-card-title">
            <a href="${f.url}" target="_blank" rel="noopener noreferrer">${f.title}</a>
          </div>
          ${renderScoreGauge(Math.round(f.score * 100))}
        </div>
        ${snippet}
        <div class="finding-card-meta">
          <span class="meta-pill">${f.source || 'Unknown'}</span>
          <span class="category-badge ${f.category || 'other'}">${catLabel}</span>
          ${dateStr}
        </div>
      </div>`;
  },

  renderMatchCard(m) {
    const aliases = m.aliases?.length
      ? `<div class="match-aliases">Also known as: ${m.aliases.slice(0, 3).join(', ')}${m.aliases.length > 3 ? ` +${m.aliases.length - 3} more` : ''}</div>`
      : '';

    return `
      <div class="match-card" onclick='Modal.open("Match Details", ${JSON.stringify(Lookup.renderDetailModal(m)).replace(/'/g, "&#39;")})'>
        <div class="match-card-header">
          <div>
            <div class="match-card-name">${m.matchedName}</div>
            ${m.entryName !== m.matchedName ? `<div class="hint">Entry: ${m.entryName}</div>` : ''}
          </div>
          <div class="match-card-score ${scoreClass(m.matchScore)}">${m.matchScore}%</div>
        </div>
        <div class="match-card-meta">
          <span class="meta-pill source-${m.listSource}">${m.listSource}</span>
          <span class="meta-pill">${m.entityType}</span>
          ${m.country ? `<span class="meta-pill">🌍 ${m.country}</span>` : ''}
          ${m.program  ? `<span class="meta-pill">📋 ${m.program.substring(0, 30)}</span>` : ''}
        </div>
        ${aliases}
      </div>`;
  },

  renderDetailModal(m) {
    const rows = [
      ['Matched Name',  m.matchedName],
      ['Entry Name',    m.entryName],
      ['Match Score',   `${m.matchScore}%`],
      ['Match Status',  m.matchStatus],
      ['List Source',   m.listSource],
      ['Entity Type',   m.entityType],
      ['Country',       m.country || '—'],
      ['Program',       m.program || '—'],
      ['Aliases',       m.aliases?.join(', ') || '—'],
    ];
    return rows.map(([l, v]) =>
      `<div class="detail-row"><span class="detail-label">${l}</span><span class="detail-value">${v}</span></div>`
    ).join('');
  },
};

/* ── Batch Screening ─────────────────────────────────────────────────────── */
// Two-step flow:
//   selected  → file is in browser memory only
//   uploaded  → file is on the server, has an uploadId (POST /api/screening/upload)
//   starting  → kicking off the job (POST /api/screening/batch)
// Each phase has a distinct UI state and distinct error surface, so the analyst
// can tell whether an upload failed vs whether the screening itself failed.
const Batch = {
  file:         null,
  upload:       null,
  state:        'idle',
  activeChecks: new Set(['sanctions', 'media']),

  toggleCheck(check, btn) {
    if (this.activeChecks.has(check)) {
      if (this.activeChecks.size === 1) return;
      this.activeChecks.delete(check);
      btn.classList.remove('active');
    } else {
      this.activeChecks.add(check);
      btn.classList.add('active');
    }
    const lbField = document.getElementById('batch-lookback-field');
    if (lbField) lbField.classList.toggle('hidden', !this.activeChecks.has('media'));
  },

  onLookbackChange(select) {
    const wrap = document.getElementById('batch-lookback-custom-wrap');
    const input = document.getElementById('batch-lookback-custom');
    if (!wrap) return;
    if (select.value === 'custom') {
      wrap.classList.remove('hidden');
      wrap.style.display = 'flex';
      input?.focus();
    } else {
      wrap.classList.add('hidden');
      wrap.style.display = 'none';
      if (input) input.value = '';
    }
  },

  getLookbackDays() {
    const select = document.getElementById('batch-lookback');
    if (select?.value === 'custom') {
      const years = parseFloat(document.getElementById('batch-lookback-custom')?.value);
      return years > 0 ? Math.round(years * 365) : 365;
    }
    return parseInt(select?.value, 10) || 365;
  },

  drop(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) this.setFile(f);
  },

  selectFile(e) {
    const f = e.target.files[0];
    if (f) this.setFile(f);
  },

  setFile(f) {
    this.file = f;
    this.upload = null;
    this.state = 'selected';
    document.getElementById('file-chip').classList.remove('hidden');
    document.getElementById('file-chip-name').textContent = f.name;
    document.getElementById('file-chip').classList.remove('is-uploaded', 'is-error');
    this.renderPrimary();
  },

  clearFile() {
    this.file = null;
    this.upload = null;
    this.state = 'idle';
    document.getElementById('file-chip').classList.add('hidden');
    document.getElementById('file-chip').classList.remove('is-uploaded', 'is-error');
    document.getElementById('file-input').value = '';
    this.renderPrimary();
  },

  // Wrapper around the upload step.
  async doUpload() {
    if (!this.file) return toast('Please select a CSV file first', 'error');

    this.state = 'uploading';
    this.renderPrimary();

    const form = new FormData();
    form.append('file', this.file);

    try {
      const r = await api.postForm('/api/screening/upload', form);
      this.upload = r;
      this.state = 'uploaded';
      const chip = document.getElementById('file-chip');
      chip.classList.add('is-uploaded');
      chip.classList.remove('is-error');
      document.getElementById('file-chip-name').textContent =
        `${r.filename} — ${r.rowCount.toLocaleString()} rows, column "${r.detectedColumn}"`;
      toast('Upload successful. Ready to screen.', 'success');
    } catch (err) {
      this.state = 'selected';
      const chip = document.getElementById('file-chip');
      chip.classList.add('is-error');
      chip.classList.remove('is-uploaded');
      toast(`Upload failed: ${err.message}`, 'error');
    } finally {
      this.renderPrimary();
    }
  },

  async start() {
    if (!this.upload) return toast('Upload the document first.', 'error');

    const threshold    = document.getElementById('batch-threshold').value || '60';
    const jobName      = document.getElementById('batch-job-name').value ||
                         `Batch — ${new Date().toLocaleDateString()}`;
    const lookbackDays = this.getLookbackDays();
    const checks       = [...this.activeChecks];

    this.state = 'starting';
    this.renderPrimary();

    try {
      await api.post('/api/screen/batch', {
        uploadId: this.upload.uploadId,
        jobName,
        threshold,
        checks,
        lookbackDays,
      });
      const checkLabel = checks.length === 2 ? 'Sanctions + Adverse Media'
        : checks[0] === 'sanctions' ? 'Sanctions' : 'Adverse Media';
      toast(`Screening started (${checkLabel}). Progress is in the header.`, 'success');
      Progress.kick();
      this.clearFile();
      document.getElementById('batch-job-name').value = '';
    } catch (err) {
      this.state = 'uploaded';
      toast(`Couldn't start screening: ${err.message}`, 'error');
    } finally {
      this.renderPrimary();
    }
  },

  renderPrimary() {
    const btn = document.getElementById('batch-submit-btn');
    if (!btn) return;

    const icons = {
      upload:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
      check:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
      spinner: `<span class="spinner" aria-hidden="true"></span>`,
    };

    const config = {
      idle:      { icon: icons.upload,  label: 'Upload document',       disabled: false, onclick: () => document.getElementById('file-input').click() },
      selected:  { icon: icons.upload,  label: 'Upload document',       disabled: false, onclick: () => this.doUpload() },
      uploading: { icon: icons.spinner, label: 'Uploading…',             disabled: true },
      uploaded:  { icon: icons.check,   label: 'Start batch screening', disabled: false, onclick: () => this.start() },
      starting:  { icon: icons.spinner, label: 'Starting…',              disabled: true },
    }[this.state];

    btn.innerHTML = `${config.icon}<span class="batch-submit-label">${config.label}</span>`;
    btn.disabled = config.disabled;
    btn.onclick = config.onclick || null;
  },
};

/* ── Jobs & Reports ─────────────────────────────────────────────────────── */
const Jobs = {
  activeJobId:   null,
  pollTimer:     null,
  currentFilter: 'all',

  async load() {
    const el = document.getElementById('jobs-list');
    try {
      const jobs = await api.get('/api/screening/jobs');
      if (!jobs.length) {
        el.innerHTML = '<div class="jobs-list-empty">No screening jobs yet.<br>Run one from <strong>Batch Screening</strong>.</div>';
        return;
      }

      el.innerHTML = jobs.map(j => {
        const pct = j.total_records ? Math.round(j.processed_records / j.total_records * 100) : 0;
        const isActive = this.activeJobId == j.id;
        const statusBadge = fmtStatus(j.status);
        const matchCount = j.match_count || 0;
        const matchSummary = j.status === 'running'
          ? `<span class="job-row-counts"><strong>${j.processed_records.toLocaleString()}</strong> of ${j.total_records.toLocaleString()}</span>`
          : `<span class="job-row-counts"><strong>${matchCount.toLocaleString()}</strong> match${matchCount === 1 ? '' : 'es'} in ${j.processed_records.toLocaleString()}</span>`;

        // Check-type chips
        const checks = (j.checks_run || 'sanctions').split(',').map(c => c.trim());
        const checkChips = checks.map(c => {
          if (c === 'sanctions') return `<span class="check-chip check-chip-sanctions">Sanctions</span>`;
          if (c === 'media')     return `<span class="check-chip check-chip-media">Adverse Media</span>`;
          return '';
        }).join('');

        return `
          <div class="job-row ${isActive ? 'is-active' : ''}" onclick="Jobs.openJob(${j.id})" tabindex="0" onkeydown="if(event.key==='Enter') Jobs.openJob(${j.id})">
            <div class="job-row-top">
              <span class="job-row-name" title="${j.job_name}">${j.job_name}</span>
              <span class="job-row-id">#${j.id}</span>
            </div>
            <div class="job-row-meta">
              ${statusBadge}
              ${matchSummary}
            </div>
            <div class="job-row-checks">${checkChips}</div>
            ${j.status === 'running' ? `
              <div class="job-row-progress" aria-hidden="true"><span style="width:${pct}%"></span></div>
            ` : ''}
            <div class="job-row-date">${fmtDate(j.created_at)}</div>
          </div>`;
      }).join('');

      // Auto-poll if any job is running
      const running = jobs.find(j => j.status === 'running' || j.status === 'pending');
      if (running) {
        clearTimeout(this.pollTimer);
        this.pollTimer = setTimeout(() => this.load(), 3000);
      }

      // First time entering the tab: auto-select the most recent job (if not already selected)
      if (!this.activeJobId && jobs.length > 0) {
        this.openJob(jobs[0].id);
      }
    } catch (err) {
      el.innerHTML = `<div class="jobs-list-empty">Error: ${err.message}</div>`;
    }
  },

  async openJob(jobId) {
    this.activeJobId   = jobId;
    this.currentFilter = 'all';
    // Mark the row as active in the sidebar without reloading the whole list
    document.querySelectorAll('.job-row').forEach(r => r.classList.remove('is-active'));
    const activeRow = document.querySelector(`.job-row[onclick*="openJob(${jobId})"]`);
    if (activeRow) activeRow.classList.add('is-active');

    document.getElementById('results-empty').classList.add('hidden');
    document.getElementById('results-panel').classList.remove('hidden');
    await this.loadResults(jobId, 'all');
  },

  async loadResults(jobId, filter = 'all') {
    const checks = await api.get(`/api/screening/jobs/${jobId}`)
      .then(j => (j.checks_run || 'sanctions').split(',').map(c => c.trim()))
      .catch(() => ['sanctions']);

    const hasMedia     = checks.includes('media');
    const hasSanctions = checks.includes('sanctions');

    const fetches = [
      api.get(`/api/screening/jobs/${jobId}`),
      api.get(`/api/reports/jobs/${jobId}/summary`),
    ];
    if (hasSanctions) {
      fetches.push(api.get(`/api/screening/jobs/${jobId}/results${filter !== 'all' ? `?status=${filter}&limit=500` : '?limit=500'}`));
    }
    if (hasMedia) {
      fetches.push(api.get(`/api/screen/jobs/${jobId}/media-results${filter !== 'all' ? `?status=${filter}&limit=500` : '?limit=500'}`).catch(() => ({ results: [], total: 0 })));
    }

    const [job, summary, ...rest] = await Promise.all(fetches);
    const data       = hasSanctions ? rest[0] : null;
    const mediaData  = hasMedia     ? rest[hasSanctions ? 1 : 0] : null;

    const title = document.getElementById('results-panel-title');
    title.textContent = `${job.job_name} — Results`;

    const wrap = document.getElementById('results-table-wrap');
    const totalRecords = job.total_records || job.processed_records || 0;

    let html = '';

    // Sanctions section
    if (hasSanctions) {
      const distributionHtml = renderDistribution(summary.byStatus, totalRecords, filter);
      html += `<div class="results-section">
        <div class="results-section-header">
          <span class="results-section-title">Sanctions</span>
          ${hasMedia ? `<span class="check-chip check-chip-sanctions">Sanctions</span>` : ''}
        </div>
        ${distributionHtml}`;

      if (!data?.results?.length) {
        html += `<div class="placeholder">No results found for this filter.</div>`;
      } else {
        html += `<div class="results-wrap">
          <table class="results-table">
            <thead><tr>
              <th>#</th><th>Input Name</th><th>Status</th>
              <th>Confidence</th><th>Matched Name</th><th>Source</th><th>Country</th><th>Program</th>
            </tr></thead>
            <tbody>${data.results.map(r => {
              const top = r.matches?.[0] || {};
              return `<tr onclick='Jobs.showSanctionDetail(${JSON.stringify(r)})'>
                <td>${r.row_number}</td>
                <td>${r.input_name}</td>
                <td>${fmtStatus(r.status)}</td>
                <td>${renderScoreGauge(r.top_match_score)}</td>
                <td>${r.top_match_name || '—'}</td>
                <td>${r.top_match_source ? `<span class="meta-pill source-${r.top_match_source}">${r.top_match_source}</span>` : '—'}</td>
                <td>${top.country || '—'}</td>
                <td>${top.program ? top.program.substring(0, 25) : '—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
        <div class="results-pagination">
          Showing ${data.results.length} of ${data.total.toLocaleString()} results
          ${data.total > 500 ? '— export CSV for full results' : ''}
        </div>`;
      }
      html += '</div>';
    }

    // Adverse media section
    if (hasMedia && mediaData) {
      html += `<div class="results-section ${hasSanctions ? 'section-break' : ''}">
        <div class="results-section-header">
          <span class="results-section-title">Adverse Media</span>
          <span class="check-chip check-chip-media">Adverse Media</span>
          ${job.lookback_days ? `<span class="hint">${job.lookback_days}d lookback</span>` : ''}
        </div>`;

      if (!mediaData.results?.length) {
        html += `<div class="placeholder">No adverse media results found.</div>`;
      } else {
        html += `<div class="results-wrap">
          <table class="results-table">
            <thead><tr>
              <th>#</th><th>Input Name</th><th>Media Status</th>
              <th>Top Score</th><th>Findings</th><th>Category</th><th>Source</th>
            </tr></thead>
            <tbody>${mediaData.results.map(r => `
              <tr onclick='Jobs.showMediaDetail(${JSON.stringify(r)})'>
                <td>${r.row_number}</td>
                <td>${r.input_name}</td>
                <td>${fmtMediaStatus(r.status)}</td>
                <td>${renderScoreGauge(Math.round((r.top_finding_score || 0) * 100))}</td>
                <td>${r.finding_count || 0}</td>
                <td>${r.top_finding_category ? `<span class="category-badge ${r.top_finding_category}">${CATEGORY_LABELS[r.top_finding_category] || r.top_finding_category}</span>` : '—'}</td>
                <td>${r.top_finding_source ? `<span class="meta-pill">${r.top_finding_source}</span>` : '—'}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
        <div class="results-pagination">
          Showing ${mediaData.results.length} of ${mediaData.total.toLocaleString()} results
        </div>`;
      }
      html += '</div>';
    }

    wrap.innerHTML = html || '<div class="placeholder">No results.</div>';
  },

  showSanctionDetail(r) {
    const matches = r.matches || [];
    let html = `
      <div class="detail-row"><span class="detail-label">Input Name</span><span class="detail-value"><strong>${r.input_name}</strong></span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${fmtStatus(r.status)}</span></div>
      <div class="detail-row"><span class="detail-label">Screened At</span><span class="detail-value">${fmtDate(r.screened_at)}</span></div>`;

    if (matches.length) {
      html += `<h4 style="margin:1rem 0 .5rem;font-size:.875rem">Matches (${matches.length})</h4>`;
      html += matches.map(m => `
        <div style="border:1px solid var(--c-border);border-radius:6px;padding:.75rem;margin-bottom:.5rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <strong>${m.matchedName}</strong>
            <span class="${scoreClass(m.matchScore)}" style="font-weight:700;font-size:1rem">${m.matchScore}%</span>
          </div>
          <div class="match-card-meta">
            <span class="meta-pill source-${m.listSource}">${m.listSource}</span>
            <span class="meta-pill">${m.entityType}</span>
            ${m.country ? `<span class="meta-pill">🌍 ${m.country}</span>` : ''}
            ${m.program ? `<span class="meta-pill">📋 ${m.program.substring(0,30)}</span>` : ''}
          </div>
          ${m.aliases?.length ? `<div class="match-aliases" style="margin-top:.4rem">AKA: ${m.aliases.slice(0,4).join(', ')}</div>` : ''}
        </div>`).join('');
    } else {
      html += `<div class="placeholder" style="padding:1rem">No matches above threshold</div>`;
    }
    Modal.open(`Sanctions: ${r.input_name}`, html);
  },

  showMediaDetail(r) {
    const findings = r.findings || [];
    let html = `
      <div class="detail-row"><span class="detail-label">Input Name</span><span class="detail-value"><strong>${r.input_name}</strong></span></div>
      <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${fmtMediaStatus(r.status)}</span></div>
      <div class="detail-row"><span class="detail-label">Findings</span><span class="detail-value">${r.finding_count}</span></div>
      <div class="detail-row"><span class="detail-label">Screened At</span><span class="detail-value">${fmtDate(r.screened_at)}</span></div>`;

    if (findings.length) {
      html += `<h4 style="margin:1rem 0 .5rem;font-size:.875rem">Findings (${findings.length})</h4>`;
      html += findings.map(f => Lookup.renderFindingCard(f)).join('');
    } else {
      html += `<div class="placeholder" style="padding:1rem">No adverse media findings above threshold</div>`;
    }
    Modal.open(`Adverse Media: ${r.input_name}`, html);
  },

  // Keep old name as alias for any code still calling it
  showResultDetail(r) { this.showSanctionDetail(r); },

  filterResults(filter) {
    this.currentFilter = filter;
    if (this.activeJobId) this.loadResults(this.activeJobId, filter);
  },

  exportCSV() {
    if (!this.activeJobId) return;
    const filter = this.currentFilter !== 'all' ? `?status=${this.currentFilter}` : '';
    window.location = `/api/reports/jobs/${this.activeJobId}/export${filter}`;
  },
};

/* ── Settings ────────────────────────────────────────────────────────────── */
const Settings = {
  async load() {
    try {
      const [settings, configs] = await Promise.all([
        api.get('/api/lists/settings'),
        api.get('/api/lists/configs'),
      ]);

      document.getElementById('s-threshold').value    = Math.round(parseFloat(settings.fuzzy_threshold) * 100);
      document.getElementById('s-high').value         = Math.round(parseFloat(settings.match_status_high)   * 100);
      document.getElementById('s-medium').value       = Math.round(parseFloat(settings.match_status_medium) * 100);
      document.getElementById('s-max-matches').value  = settings.max_matches;
      document.getElementById('s-sync-schedule').value  = settings.sync_schedule;
      document.getElementById('s-batch-schedule').value = settings.batch_schedule;
      document.getElementById('s-auto-batch').checked  = settings.auto_batch_enabled === 'true';

      // Adverse media settings
      const lookbackSel = document.getElementById('s-media-lookback');
      if (lookbackSel) {
        const lbDays = settings.media_default_lookback_days || '365';
        const opt = [...lookbackSel.options].find(o => o.value === lbDays);
        if (opt) lookbackSel.value = lbDays;
        else lookbackSel.value = '365';
      }
      const classifierSel = document.getElementById('s-media-classifier');
      if (classifierSel) {
        classifierSel.value = settings.media_classifier_mode || 'keyword';
        // Disable LLM option if no API key — show hint
        const llmOpt = classifierSel.querySelector('option[value="llm"]');
        const hint   = document.getElementById('s-media-classifier-hint');
        if (llmOpt && settings.llm_available === 'false') {
          llmOpt.disabled = true;
          llmOpt.textContent = 'LLM — Claude (set ANTHROPIC_API_KEY to enable)';
        }
      }
      const mediaHighEl   = document.getElementById('s-media-high');
      const mediaMediumEl = document.getElementById('s-media-medium');
      if (mediaHighEl)   mediaHighEl.value   = Math.round(parseFloat(settings.media_status_high   || '0.70') * 100);
      if (mediaMediumEl) mediaMediumEl.value = Math.round(parseFloat(settings.media_status_medium || '0.40') * 100);

      // URL settings (auto-download lists only)
      const urlList = document.getElementById('url-settings-list');
      urlList.innerHTML = Object.entries(configs)
        .filter(([, cfg]) => !cfg.requiresManualImport)
        .map(([src, cfg]) => `
          <div class="url-setting-row">
            <span class="url-setting-label">${src}</span>
            <input class="input" data-src="${src}" value="${cfg.url || ''}" placeholder="https://...">
          </div>`).join('');

      // Manual import section (lists with no auto-download URL)
      const manualList = document.getElementById('manual-import-list');
      const manualEntries = Object.entries(configs).filter(([, cfg]) => cfg.requiresManualImport);
      if (!manualEntries.length) {
        manualList.innerHTML = '<p class="hint">All lists have auto-download URLs configured.</p>';
      } else {
        manualList.innerHTML = manualEntries.map(([src, cfg]) => `
          <div class="manual-import-row" style="border:1px solid var(--c-border);border-radius:6px;padding:1rem;margin-bottom:.75rem">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
              <strong>${src}</strong>
              <span class="badge badge-warn">Manual Import Required</span>
            </div>
            <p class="hint" style="margin-bottom:.75rem">
              Download the file from the official source, then upload it here.
              <a href="${cfg.manualDownloadPage || '#'}" target="_blank" rel="noopener" style="color:var(--c-primary)">Official download page →</a>
            </p>
            <div style="display:flex;gap:.5rem;align-items:center">
              <input type="file" id="import-file-${src}" accept=".csv,.xml,.xlsx" style="flex:1;font-size:.8125rem">
              <button class="btn btn-primary btn-sm" onclick="Settings.importFile('${src}')">Import</button>
            </div>
            <div id="import-status-${src}" style="margin-top:.5rem;font-size:.8125rem"></div>
          </div>`).join('');
      }
    } catch (err) {
      toast(`Failed to load settings: ${err.message}`, 'error');
    }
  },

  async importFile(source) {
    const fileInput = document.getElementById(`import-file-${source}`);
    const statusEl  = document.getElementById(`import-status-${source}`);
    if (!fileInput?.files[0]) { toast('Please select a file first', 'error'); return; }

    statusEl.textContent = 'Importing…';
    statusEl.style.color = 'var(--c-muted)';

    const form = new FormData();
    form.append('file', fileInput.files[0]);

    try {
      const r = await api.postForm(`/api/lists/import/${source}`, form);
      statusEl.textContent = `✓ Imported ${r.count.toLocaleString()} entries`;
      statusEl.style.color = 'var(--c-success)';
      toast(`${source} imported — ${r.count.toLocaleString()} entries`, 'success');
      Dashboard.loadStatus();
      refreshHeaderStats();
    } catch (err) {
      statusEl.textContent = `✗ ${err.message}`;
      statusEl.style.color = 'var(--c-danger)';
      toast(`Import failed: ${err.message}`, 'error');
    }
  },

  async save() {
    try {
      const body = {
        fuzzy_threshold:     String(parseFloat(document.getElementById('s-threshold').value)  / 100),
        match_status_high:   String(parseFloat(document.getElementById('s-high').value)       / 100),
        match_status_medium: String(parseFloat(document.getElementById('s-medium').value)     / 100),
        max_matches:         document.getElementById('s-max-matches').value,
        sync_schedule:       document.getElementById('s-sync-schedule').value,
        batch_schedule:      document.getElementById('s-batch-schedule').value,
        auto_batch_enabled:  String(document.getElementById('s-auto-batch').checked),
        // Adverse media
        media_default_lookback_days: document.getElementById('s-media-lookback')?.value  || '365',
        media_classifier_mode:       document.getElementById('s-media-classifier')?.value || 'keyword',
        media_status_high:   String(parseFloat(document.getElementById('s-media-high')?.value   || 70) / 100),
        media_status_medium: String(parseFloat(document.getElementById('s-media-medium')?.value || 40) / 100),
      };
      await api.put('/api/lists/settings', body);

      // Save URL overrides
      const urlInputs = document.querySelectorAll('#url-settings-list input[data-src]');
      for (const inp of urlInputs) {
        await api.put(`/api/lists/urls/${inp.dataset.src}`, { url: inp.value });
      }

      // Rebuild index with new thresholds
      await api.post('/api/screening/rebuild-index', {});
      toast('Settings saved & index rebuilt', 'success');
    } catch (err) {
      toast(`Save failed: ${err.message}`, 'error');
    }
  },
};

/* ── Init ────────────────────────────────────────────────────────────────── */
Dashboard.refresh();
Progress.start();
Batch.renderPrimary();
