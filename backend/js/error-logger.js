// ── ERROR LOGGER ──
// Captures JS errors with file, line, column, stack trace, and timestamp.
// Include AFTER firebase-config.js and BEFORE superadmin.js in superadmin.html.
// Usage: ErrorLogger.log(error, 'optional context label')
//        ErrorLogger.download()  — triggered by the Download Error Logs button

const ErrorLogger = (() => {
  const LOG_KEY   = '__vetcare_error_logs__';
  const MAX_LOGS  = 200; // cap to avoid unbounded growth

  // ── Internal store (in-memory + sessionStorage fallback) ──
  let _logs = _loadFromStorage();

  function _loadFromStorage() {
    try {
      const raw = sessionStorage.getItem(LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function _saveToStorage() {
    try {
      sessionStorage.setItem(LOG_KEY, JSON.stringify(_logs));
    } catch {
      // Storage full or unavailable — keep in-memory only
    }
  }

  // ── Core log function ──
  function log(error, context = '') {
    const entry = {
      timestamp : new Date().toISOString(),
      context   : context || 'uncaught',
      message   : error?.message  || String(error),
      name      : error?.name     || 'Error',
      stack     : error?.stack    || '(no stack trace)',
      file      : '(see stack)',
      line      : '(see stack)',
      column    : '(see stack)',
      userAgent : navigator.userAgent,
      url       : window.location.href,
    };

    // Try to extract file / line / column from the stack string
    if (error?.stack) {
      // Match patterns like "at foo (file.js:12:34)" or "file.js:12:34"
      const match = error.stack.match(/(?:at .+?\()?([^\s()]+\.js):(\d+):(\d+)/);
      if (match) {
        entry.file   = match[1];
        entry.line   = match[2];
        entry.column = match[3];
      }
    }

    _logs.unshift(entry);           // newest first
    if (_logs.length > MAX_LOGS) _logs = _logs.slice(0, MAX_LOGS);
    _saveToStorage();

    // Also keep the original console.error visible in DevTools
    console.error(`[VetCare ErrorLogger] ${entry.name}: ${entry.message}`, error);

    // Update badge counter on the download button (if it exists in DOM)
    _updateBadge();
  }

  // ── Global error catchers ──
  window.addEventListener('error', (event) => {
    const syntheticError = event.error || new Error(event.message);
    if (!syntheticError.stack) {
      // Patch file/line/col from the event itself when stack isn't available
      syntheticError._manualFile   = event.filename;
      syntheticError._manualLine   = event.lineno;
      syntheticError._manualCol    = event.colno;
    }
    log(syntheticError, 'window.onerror');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const err    = reason instanceof Error ? reason : new Error(String(reason));
    log(err, 'unhandledRejection');
  });

  // ── Badge updater ──
  function _updateBadge() {
    const badge    = document.getElementById('errorLogBadge');
    const clearBtn = document.getElementById('btnClearLog');
    if (badge) {
      if (_logs.length > 0) {
        badge.textContent = _logs.length > 99 ? '99+' : _logs.length;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
    // Show Clear button only when there are logs
    if (clearBtn) {
      clearBtn.style.display = _logs.length > 0 ? 'inline-flex' : 'none';
    }
  }

  // ── Download .txt ──
  function download() {
    let content = '';

    if (_logs.length === 0) {
      content = '=== VetCare Super Admin — Error Logs ===\n\nNo errors recorded in this session.\n';
    } else {
      content  = '=== VetCare Super Admin — Error Logs ===\n';
      content += `Generated : ${new Date().toLocaleString('en-PH')}\n`;
      content += `Total     : ${_logs.length} error(s)\n`;
      content += '='.repeat(60) + '\n\n';

      _logs.forEach((e, idx) => {
        content += `[${idx + 1}] ${e.timestamp}\n`;
        content += `  Context  : ${e.context}\n`;
        content += `  Error    : ${e.name}: ${e.message}\n`;
        content += `  File     : ${e.file}\n`;
        content += `  Line     : ${e.line}  Column: ${e.column}\n`;
        content += `  URL      : ${e.url}\n`;
        content += `  Stack    :\n`;
        // Indent the stack trace for readability
        (e.stack || '').split('\n').forEach(line => {
          content += `    ${line.trim()}\n`;
        });
        content += '-'.repeat(60) + '\n\n';
      });
    }

    const blob     = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement('a');
    const dateStr  = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    a.href         = url;
    a.download     = `vetcare-error-logs-${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Clear logs ──
  function clear() {
    _logs = [];
    _saveToStorage();
    _updateBadge();
  }

  // ── Confirm then clear ──
  function confirmClearLogs() {
    if (_logs.length === 0) return;
    if (!confirm(`Clear all ${_logs.length} error log(s)?\n\nThis cannot be undone. Download first if you need to keep a record.`)) return;
    clear();
  }

  // ── Count ──
  function count() { return _logs.length; }

  // Run badge update once DOM is ready
  document.addEventListener('DOMContentLoaded', _updateBadge);

  return { log, download, clear, confirmClearLogs, count };
})();

// Global wrapper so onclick="confirmClearLogs()" in HTML works directly
function confirmClearLogs() { ErrorLogger.confirmClearLogs(); }