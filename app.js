// ============================================================
// AttendanceApp — app.js
// REPLACE THIS with your deployed GAS URL
// ============================================================
var API = 'https://script.google.com/macros/s/AKfycbwquTtDTpCwbI4Sa7C7Uq31lAXwKq-uFymMOiV66zagfZ9b-Nbb2ln1TifAWiT4DJm_cQ/exec';

// ─── State ────────────────────────────────────────────────────
var _U = null, _TOKEN = null, _cbIdx = 0;
var _todayRecord = null;
var _allData = { attendance: [], employees: [] };

// ─── JSONP Core ───────────────────────────────────────────────
function _api(action, data, ok, err) {
  var cbName = '_gcb' + (++_cbIdx);
  var timeout;

  window[cbName] = function(r) {
    clearTimeout(timeout);
    try { delete window[cbName]; } catch(e) {}
    var s = document.getElementById('_s_' + cbName);
    if (s) s.remove();
    if (r && r.error === 'NOT_AUTHENTICATED') { _signOut(); return; }
    if (ok) ok(r);
  };

  timeout = setTimeout(function() {
    try { delete window[cbName]; } catch(e) {}
    if (err) err({ message: 'Request timed out (20s)' });
  }, 20000);

  var url = API + '?callback=' + cbName + '&payload='
    + encodeURIComponent(JSON.stringify({ action: action, data: data || {}, token: _TOKEN || '' }));

  var s  = document.createElement('script');
  s.id   = '_s_' + cbName;
  s.src  = url;
  s.onerror = function() {
    clearTimeout(timeout);
    if (err) err({ message: 'Network error — check connection.' });
  };
  document.body.appendChild(s);
}

// ─── Session ──────────────────────────────────────────────────
function _loadSession() {
  try {
    var t = localStorage.getItem('att_token');
    var u = localStorage.getItem('att_user');
    if (t && u) { _TOKEN = t; _U = JSON.parse(u); return true; }
  } catch(e) {}
  return false;
}

function _saveSession(token, user) {
  _TOKEN = token; _U = user;
  localStorage.setItem('att_token', token);
  localStorage.setItem('att_user', JSON.stringify(user));
}

function _signOut() {
  localStorage.removeItem('att_token');
  localStorage.removeItem('att_user');
  _TOKEN = null; _U = null; _todayRecord = null;
  showPage('login');
}

// ─── Init ─────────────────────────────────────────────────────
window.addEventListener('load', function() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js', { scope: './' });

  if (_loadSession()) {
    showPage('home');
    loadTodayStatus();
  } else {
    showPage('login');
  }
});

// ─── Page Router ──────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(function(p) {
    p.classList.remove('active');
  });
  var pg = document.getElementById('pg-' + id);
  if (pg) pg.classList.add('active');

  // Nav highlight
  document.querySelectorAll('.nav-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.page === id);
  });

  if (id === 'home')    loadTodayStatus();
  if (id === 'history') loadHistory();
  if (id === 'admin')   loadAdmin();
}

// ─── Login ────────────────────────────────────────────────────
function doLogin() {
  var email = qs('#loginEmail').value.trim();
  var pass  = qs('#loginPass').value.trim();
  if (!email || !pass) { toast('Enter email and password', 'error'); return; }

  setBtnLoading('#loginBtn', true);
  _api('login', { email: email, password: pass }, function(r) {
    setBtnLoading('#loginBtn', false);
    if (!r.success) { toast(r.error || 'Login failed', 'error'); return; }
    _saveSession(r.token, r.user);
    showPage('home');
    loadTodayStatus();
  }, function(e) {
    setBtnLoading('#loginBtn', false);
    toast(e.message, 'error');
  });
}

// ─── Home / Today Status ──────────────────────────────────────
function loadTodayStatus() {
  if (!_U) return;
  qs('#userName').textContent  = _U.name  || '';
  qs('#userDept').textContent  = _U.dept  || '';
  qs('#userEmpId').textContent = 'ID: ' + (_U.empId || '');
  if (_U.photo) qs('#userAvatar').src = _U.photo;

  var isAdmin = _U.role === 'admin' || _U.role === 'hr';
  qs('#adminNavBtn').style.display = isAdmin ? '' : 'none';

  setCardLoading(true);
  _api('getTodayStatus', {}, function(r) {
    setCardLoading(false);
    _todayRecord = r.record;
    renderStatusCard(r.record);
  }, function(e) {
    setCardLoading(false);
    toast(e.message, 'error');
  });
}

function renderStatusCard(rec) {
  var card = qs('#statusCard');
  if (!rec) {
    card.innerHTML = '<div class="status-badge neutral">Not Checked In</div>'
      + '<p class="status-hint">Tap Check In to mark attendance</p>';
    qs('#checkInBtn').style.display  = '';
    qs('#checkOutBtn').style.display = 'none';
    return;
  }

  var statusColor = rec['Status'] === 'Checked In' ? 'in' : 'out';
  var html = '<div class="status-badge ' + statusColor + '">' + rec['Status'] + '</div>'
    + '<div class="status-row"><span>Date</span><b>' + rec['Date'] + '</b></div>'
    + '<div class="status-row"><span>Check In</span><b>' + (rec['Check_In_Time'] || '—') + '</b></div>'
    + '<div class="status-row"><span>IN Status</span><b class="badge-' + (rec['IN Status']||'').toLowerCase() + '">' + (rec['IN Status'] || '—') + '</b></div>';

  if (rec['Check_Out_Time']) {
    html += '<div class="status-row"><span>Check Out</span><b>' + rec['Check_Out_Time'] + '</b></div>'
      + '<div class="status-row"><span>Total Hours</span><b>' + rec['Total_Hours'] + ' hrs</b></div>'
      + '<div class="status-row"><span>Overtime</span><b>' + (rec['Overtime_Hours'] || '0') + ' hrs</b></div>';
  }

  if (rec['IN Location']) {
    html += '<div class="status-row loc"><span>📍 IN</span><b class="loc-val">' + rec['IN Location'] + '</b></div>';
  }
  if (rec['Out Location']) {
    html += '<div class="status-row loc"><span>📍 OUT</span><b class="loc-val">' + rec['Out Location'] + '</b></div>';
  }

  card.innerHTML = html;
  qs('#checkInBtn').style.display  = rec['Status'] === 'Checked In' ? 'none' : 'none';
  qs('#checkOutBtn').style.display = rec['Status'] === 'Checked In' ? '' : 'none';
}

// ─── Check In ─────────────────────────────────────────────────
function doCheckIn() {
  setBtnLoading('#checkInBtn', true);
  getLocation(function(locStr, err) {
    _api('checkIn', {
      location:      locStr || (err || 'Location unavailable'),
      officeInTime:  '09:00',
      officeOutTime: '18:00'
    }, function(r) {
      setBtnLoading('#checkInBtn', false);
      if (!r.success) { toast(r.error, 'error'); return; }
      toast('✅ Checked In at ' + r.checkInTime + ' (' + r.inStatus + ')', 'success');
      loadTodayStatus();
    }, function(e) {
      setBtnLoading('#checkInBtn', false);
      toast(e.message, 'error');
    });
  });
}

// ─── Check Out ────────────────────────────────────────────────
function doCheckOut() {
  if (!confirm('Confirm Check Out?')) return;
  setBtnLoading('#checkOutBtn', true);
  getLocation(function(locStr, err) {
    _api('checkOut', {
      location: locStr || (err || 'Location unavailable')
    }, function(r) {
      setBtnLoading('#checkOutBtn', false);
      if (!r.success) { toast(r.error, 'error'); return; }
      toast('✅ Checked Out | ' + r.totalHours + ' hrs worked', 'success');
      loadTodayStatus();
    }, function(e) {
      setBtnLoading('#checkOutBtn', false);
      toast(e.message, 'error');
    });
  });
}

// ─── GPS Helper ───────────────────────────────────────────────
function getLocation(cb) {
  if (!navigator.geolocation) { cb(null, 'GPS not supported'); return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude.toFixed(6);
      var lng = pos.coords.longitude.toFixed(6);
      cb(lat + ', ' + lng);
    },
    function(e) { cb(null, 'GPS denied'); },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

// ─── History ──────────────────────────────────────────────────
function loadHistory() {
  qs('#historyList').innerHTML = '<div class="loader-inline">Loading…</div>';
  _api('getMyHistory', { days: 30 }, function(r) {
    if (!r.success) { qs('#historyList').innerHTML = '<p class="err">' + r.error + '</p>'; return; }
    if (!r.records.length) {
      qs('#historyList').innerHTML = '<p class="empty">No records in last 30 days</p>';
      return;
    }
    qs('#historyList').innerHTML = r.records.map(renderHistoryRow).join('');
  }, function(e) {
    qs('#historyList').innerHTML = '<p class="err">' + e.message + '</p>';
  });
}

function renderHistoryRow(rec) {
  var statusClass = (rec['Attendance_Status'] || '').toLowerCase();
  var inSt  = rec['IN Status']  || '—';
  var outSt = rec['OUT Status'] || '—';
  return '<div class="hist-card">'
    + '<div class="hist-top">'
    +   '<span class="hist-date">' + rec['Date'] + '</span>'
    +   '<span class="att-badge ' + statusClass + '">' + (rec['Attendance_Status'] || 'Present') + '</span>'
    + '</div>'
    + '<div class="hist-row">'
    +   '<span>In: <b>' + (rec['Check_In_Time']  || '—') + '</b> <em class="badge-' + inSt.toLowerCase() + '">' + inSt + '</em></span>'
    +   '<span>Out: <b>' + (rec['Check_Out_Time'] || '—') + '</b></span>'
    + '</div>'
    + '<div class="hist-row">'
    +   '<span>Hours: <b>' + (rec['Total_Hours'] || '—') + '</b></span>'
    +   '<span>OT: <b>' + (rec['Overtime_Hours'] || '—') + '</b></span>'
    + '</div>'
    + '</div>';
}

// ─── Admin Panel ──────────────────────────────────────────────
function loadAdmin() {
  var isAdmin = _U && (_U.role === 'admin' || _U.role === 'hr');
  if (!isAdmin) {
    qs('#pg-admin').innerHTML = '<p class="err" style="padding:2rem">Access denied.</p>';
    return;
  }

  // Default: today
  var today = new Date().toISOString().slice(0, 10);
  qs('#filterFrom').value = today;
  qs('#filterTo').value   = today;
  fetchAdminData();
}

function fetchAdminData() {
  var from = qs('#filterFrom').value;
  var to   = qs('#filterTo').value;
  qs('#adminList').innerHTML = '<div class="loader-inline">Loading…</div>';
  qs('#adminSummary').innerHTML = '';

  _api('getAllAttendance', { from: from, to: to }, function(r) {
    if (!r.success) { qs('#adminList').innerHTML = '<p class="err">' + r.error + '</p>'; return; }
    renderAdminTable(r.records);
  }, function(e) {
    qs('#adminList').innerHTML = '<p class="err">' + e.message + '</p>';
  });
}

function renderAdminTable(records) {
  if (!records.length) {
    qs('#adminList').innerHTML = '<p class="empty">No records for selected range</p>';
    qs('#adminSummary').innerHTML = '';
    return;
  }

  // Summary
  var total   = records.length;
  var present = records.filter(function(r){ return r['Attendance_Status'] === 'Present'; }).length;
  var late    = records.filter(function(r){ return r['IN Status'] === 'Late'; }).length;
  qs('#adminSummary').innerHTML =
    '<div class="summary-chips">'
    + '<div class="chip blue">Total: ' + total + '</div>'
    + '<div class="chip green">Present: ' + present + '</div>'
    + '<div class="chip red">Late: ' + late + '</div>'
    + '</div>';

  // Group by date
  var byDate = {};
  records.forEach(function(r) {
    var d = r['Date'] || 'Unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });

  var html = '';
  Object.keys(byDate).sort().reverse().forEach(function(date) {
    html += '<div class="admin-date-group"><div class="admin-date-header">' + date
      + ' <span class="cnt">(' + byDate[date].length + ')</span></div>';
    byDate[date].forEach(function(rec) {
      var inSt = rec['IN Status'] || '';
      html += '<div class="admin-row">'
        + '<div class="admin-name">' + (rec['Usermail'] || '') + '</div>'
        + '<div class="admin-times">'
        +   '<span>IN: <b>' + (rec['Check_In_Time'] || '—') + '</b>'
        +   ' <em class="badge-' + inSt.toLowerCase() + '">' + inSt + '</em></span>'
        +   '<span>OUT: <b>' + (rec['Check_Out_Time'] || '—') + '</b></span>'
        +   '<span>Hrs: <b>' + (rec['Total_Hours'] || '—') + '</b></span>'
        + '</div>'
        + '</div>';
    });
    html += '</div>';
  });
  qs('#adminList').innerHTML = html;
}

// ─── UI Helpers ───────────────────────────────────────────────
function qs(sel) { return document.querySelector(sel); }

function toast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show ' + (type || '');
  setTimeout(function(){ t.className = 'toast'; }, 3500);
}

function setBtnLoading(sel, loading) {
  var btn = qs(sel);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.orig = btn.textContent;
    btn.textContent  = '…';
  } else {
    if (btn.dataset.orig) btn.textContent = btn.dataset.orig;
  }
}

function setCardLoading(on) {
  qs('#statusCard').style.opacity = on ? '0.4' : '1';
}
