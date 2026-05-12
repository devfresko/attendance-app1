// ══════════════════════════════════════════════════════════
// AttendanceApp — app.js  (Premium Build)
// ══════════════════════════════════════════════════════════
var API = 'https://script.google.com/macros/s/AKfycbw0lYuYWeT3_08skqxrREXImPN5B-NMZ8tl0A8_2BPNSOVxOOaCIeUgJBxyTkphdmOOcQ/exec';

// ── State ────────────────────────────────────────────────
var _U = null, _TOKEN = null, _cbIdx = 0;
var _todayRec   = null;
var _gpsData    = null;   // { lat, lng, address, coords }
var _gpsReady   = false;
var _histRecords = [];
var _clockInt   = null;

// ══════════════════════════════════════════════════════════
// JSONP CORE
// ══════════════════════════════════════════════════════════
function _api(action, data, ok, err) {
  var cbName = '_gcb' + (++_cbIdx);
  var timer;
  window[cbName] = function(r) {
    clearTimeout(timer);
    try { delete window[cbName]; } catch(e) {}
    var s = document.getElementById('_s_' + cbName); if (s) s.remove();
    if (r && r.error === 'NOT_AUTHENTICATED') { doSignOut(); return; }
    if (ok) ok(r);
  };
  timer = setTimeout(function() {
    try { delete window[cbName]; } catch(e) {}
    if (err) err({ message: 'Request timed out. Check connection.' });
  }, 25000);
  var url = API + '?callback=' + cbName + '&payload='
    + encodeURIComponent(JSON.stringify({ action: action, data: data || {}, token: _TOKEN || '' }));
  var s = document.createElement('script');
  s.id = '_s_' + cbName; s.src = url;
  s.onerror = function() { clearTimeout(timer); if (err) err({ message: 'Network error.' }); };
  document.body.appendChild(s);
}

// ══════════════════════════════════════════════════════════
// SESSION
// ══════════════════════════════════════════════════════════
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
function doSignOut() {
  localStorage.removeItem('att_token'); localStorage.removeItem('att_user');
  _TOKEN = null; _U = null; _todayRec = null; _gpsData = null; _gpsReady = false;
  stopClock();
  document.getElementById('pgLogin').style.display  = 'flex';
  document.getElementById('appWrap').style.display  = 'none';
}

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
window.addEventListener('load', function() {
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.register('sw.js', { scope: './' });

  if (_loadSession()) {
    document.getElementById('pgLogin').style.display = 'none';
    document.getElementById('appWrap').style.display = 'flex';
    initApp();
  }
  // Login page needs no init
});

function initApp() {
  // Header
  qs('#hdrName').textContent  = _U.name  || '';
  qs('#hdrDept').textContent  = (_U.dept || '') + ' · ' + (_U.role || '');
  qs('#hdrEmpId').textContent = _U.empId || '—';
  if (_U.photo) qs('#hdrAvatar').src = _U.photo;

  // Admin nav
  var isAdmin = _U.role === 'admin' || _U.role === 'hr';
  qs('#adminNavBtn').style.display = isAdmin ? '' : 'none';

  startClock();
  startGPS();
  loadTodayStatus();
  loadMonthStats();
}

// ══════════════════════════════════════════════════════════
// CLOCK
// ══════════════════════════════════════════════════════════
function startClock() {
  stopClock();
  function tick() {
    var now  = new Date();
    var hh   = String(now.getHours()).padStart(2,'0');
    var mm   = String(now.getMinutes()).padStart(2,'0');
    var ss   = String(now.getSeconds()).padStart(2,'0');
    qs('#clockTime').textContent = hh + ':' + mm + ':' + ss;
    qs('#clockDate').textContent = now.toLocaleDateString('en-IN', {
      weekday:'long', day:'numeric', month:'long', year:'numeric'
    });
  }
  tick();
  _clockInt = setInterval(tick, 1000);
}
function stopClock() { if (_clockInt) { clearInterval(_clockInt); _clockInt = null; } }

// ══════════════════════════════════════════════════════════
// GPS — CONTINUOUS (forced, always on)
// ══════════════════════════════════════════════════════════
var _watchId = null;

function startGPS() {
  if (!navigator.geolocation) {
    setGpsPill('err', '❌ GPS not supported on this device');
    return;
  }
  setGpsPill('searching', 'Locating…');

  // Use watchPosition so it stays live
  _watchId = navigator.geolocation.watchPosition(
    onGPSSuccess,
    onGPSError,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
  );
}

function onGPSSuccess(pos) {
  var lat = pos.coords.latitude;
  var lng = pos.coords.longitude;
  var acc = Math.round(pos.coords.accuracy);
  _gpsData = { lat: lat, lng: lng, address: null, coords: lat.toFixed(5) + ', ' + lng.toFixed(5), accuracy: acc };
  _gpsReady = true;

  setGpsPill('ok', '📡 GPS locked · ±' + acc + 'm');

  // Show coords immediately
  qs('#locCard').style.display = '';
  qs('#locCoords').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' ±' + acc + 'm';
  qs('#locAddress').textContent = 'Getting address…';

  // Reverse geocode (OpenStreetMap Nominatim — free, no key)
  reverseGeocode(lat, lng, function(addr) {
    if (addr) {
      _gpsData.address = addr;
      qs('#locAddress').textContent = addr;
    } else {
      qs('#locAddress').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
    }
  });
}

function onGPSError(e) {
  _gpsReady = false;
  var msgs = ['', 'GPS access denied — please enable in browser settings', 'GPS unavailable', 'GPS timed out'];
  setGpsPill('err', '⚠️ ' + (msgs[e.code] || 'GPS error'));
  qs('#locCard').style.display = 'none';
}

function setGpsPill(cls, label) {
  var p = qs('#gpsPill');
  p.className = 'gps-pill ' + cls;
  qs('#gpsLabel').textContent = label;
}

function reverseGeocode(lat, lng, cb) {
  var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng + '&zoom=16&addressdetails=1';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.setRequestHeader('Accept-Language', 'en');
  xhr.timeout = 8000;
  xhr.onload = function() {
    try {
      var r = JSON.parse(xhr.responseText);
      var a = r.address || {};
      var parts = [];
      if (a.road || a.pedestrian) parts.push(a.road || a.pedestrian);
      if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood);
      if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village);
      cb(parts.join(', ') || r.display_name || null);
    } catch(e) { cb(null); }
  };
  xhr.onerror = xhr.ontimeout = function() { cb(null); };
  xhr.send();
}

// Build location string for saving
function getLocString() {
  if (!_gpsData) return null;
  var s = _gpsData.coords;
  if (_gpsData.address) s = _gpsData.address + ' (' + _gpsData.coords + ')';
  return s;
}

// ══════════════════════════════════════════════════════════
// PAGE ROUTER
// ══════════════════════════════════════════════════════════
function showPage(id) {
  var loginEl = qs('#pgLogin');
  var shellEl = qs('#appWrap');
  if (id === 'login') {
    loginEl.style.display = 'flex'; shellEl.style.display = 'none'; return;
  }
  loginEl.style.display = 'none'; shellEl.style.display = 'flex';
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  var pg = qs('#pg-' + id); if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.page === id);
  });
  if (id === 'history') loadHistory();
  if (id === 'admin')   loadAdmin();
}

// ══════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════
function doLogin() {
  var email = qs('#loginEmail').value.trim();
  var pass  = qs('#loginPass').value.trim();
  if (!email || !pass) { toast('Enter email and password', 'error'); return; }
  setBtnLoad('#loginBtn', true, 'Signing in…');
  _api('login', { email: email, password: pass }, function(r) {
    setBtnLoad('#loginBtn', false, 'Sign In');
    if (!r.success) { toast(r.error || 'Login failed', 'error'); return; }
    _saveSession(r.token, r.user);
    document.getElementById('pgLogin').style.display = 'none';
    document.getElementById('appWrap').style.display = 'flex';
    initApp();
  }, function(e) { setBtnLoad('#loginBtn', false, 'Sign In'); toast(e.message, 'error'); });
}

// ══════════════════════════════════════════════════════════
// TODAY STATUS
// ══════════════════════════════════════════════════════════
function loadTodayStatus() {
  _api('getTodayStatus', {}, function(r) {
    _todayRec = r.record;
    renderStatusCard(r.record);
    renderActionBtn(r.record);
  }, function(e) {
    qs('#statusCard').innerHTML = '<div style="color:var(--red);font-size:.8rem;padding:.5rem">Failed: ' + e.message + '</div>';
  });
}

function renderStatusCard(rec) {
  var card = qs('#statusCard');
  if (!rec) {
    card.innerHTML =
      '<div class="ring-wrap">'
      + '<svg class="ring-svg" width="80" height="80" viewBox="0 0 80 80">'
      +   '<circle class="ring-bg" cx="40" cy="40" r="32" stroke-width="6"/>'
      +   '<circle class="ring-fill" cx="40" cy="40" r="32" stroke-width="6" stroke="#525d7a"'
      +     ' stroke-dasharray="201" stroke-dashoffset="201" transform="rotate(-90 40 40)"/>'
      + '</svg>'
      + '<div class="ring-meta">'
      +   '<div class="ring-status none">Not Checked In</div>'
      +   '<div class="ring-time">Tap <b>Check In</b> below</div>'
      + '</div></div>';
    return;
  }

  var isIn    = rec['Status'] === 'Checked In';
  var inTime  = rec['Check_In_Time']  || '';
  var outTime = rec['Check_Out_Time'] || '';
  var hrs     = parseFloat(rec['Total_Hours'] || 0);
  var maxHrs  = 9;
  var pct     = Math.min(hrs / maxHrs, 1);
  var circ    = 201;
  var offset  = circ - (pct * circ);
  var strokeColor = isIn ? '#22d47e' : '#4f8ef7';
  var inSt    = rec['IN Status'] || '';
  var inStClass = inSt.toLowerCase() === 'late' ? 'tag-late' : 'tag-ontime';

  card.innerHTML =
    '<div class="ring-wrap">'
    + '<svg class="ring-svg" width="80" height="80" viewBox="0 0 80 80">'
    +   '<circle class="ring-bg" cx="40" cy="40" r="32" stroke-width="6"/>'
    +   '<circle id="ringFill" class="ring-fill" cx="40" cy="40" r="32" stroke-width="6"'
    +     ' stroke="' + strokeColor + '"'
    +     ' stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ + '"'
    +     ' transform="rotate(-90 40 40)"/>'
    + '</svg>'
    + '<div class="ring-meta">'
    +   '<div class="ring-status ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '● Checked In' : '✓ Checked Out') + '</div>'
    +   '<div class="ring-time">In: <b>' + (inTime || '—') + '</b>'
    +   (outTime ? ' &nbsp; Out: <b>' + outTime + '</b>' : '') + '</div>'
    + '</div></div>'
    + '<div class="status-rows">'
    + sRow('Date',       rec['Date'] || '—')
    + sRow('IN Status',  '<span class="' + inStClass + '">' + (inSt || '—') + '</span>')
    + (outTime ? sRow('OUT Status', '<span class="' + (rec['OUT Status']||'').toLowerCase() + '">' + (rec['OUT Status']||'—') + '</span>') : '')
    + (hrs ? sRow('Hours Worked', hrs.toFixed(2) + ' / 9 hrs') : '')
    + (rec['Overtime_Hours'] && parseFloat(rec['Overtime_Hours']) > 0 ? sRow('Overtime', '<span style="color:var(--yellow)">' + parseFloat(rec['Overtime_Hours']).toFixed(2) + ' hrs</span>') : '')
    + (rec['IN Location'] ? sRow('Location (IN)', '<span style="font-size:.72rem;color:var(--text2)">' + truncate(rec['IN Location'], 35) + '</span>') : '')
    + '</div>';

  // Animate ring after paint
  setTimeout(function() {
    var rf = document.getElementById('ringFill');
    if (rf) rf.style.strokeDashoffset = offset;
  }, 60);
}

function sRow(label, val) {
  return '<div class="srow"><span class="srow-label">' + label + '</span><span class="srow-val">' + val + '</span></div>';
}

function renderActionBtn(rec) {
  var inBtn  = qs('#checkInBtn');
  var outBtn = qs('#checkOutBtn');
  if (!rec) {
    inBtn.style.display  = ''; outBtn.style.display = 'none';
  } else if (rec['Status'] === 'Checked In') {
    inBtn.style.display  = 'none'; outBtn.style.display = '';
  } else {
    inBtn.style.display  = 'none'; outBtn.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════
// MONTH STATS (from history)
// ══════════════════════════════════════════════════════════
function loadMonthStats() {
  _api('getMyHistory', { days: 30 }, function(r) {
    if (!r.success || !r.records.length) return;
    _histRecords = r.records;
    var present = r.records.filter(function(x){ return (x['Attendance_Status']||'').toLowerCase()==='present'; }).length;
    var late    = r.records.filter(function(x){ return (x['IN Status']||'').toLowerCase()==='late'; }).length;
    var totalHrs = r.records.reduce(function(s,x){ return s + parseFloat(x['Total_Hours']||0); }, 0);
    var avgHrs  = present > 0 ? (totalHrs / present).toFixed(1) : '0';

    qs('#statPresent').textContent = present;
    qs('#statLate').textContent    = late;
    qs('#statAvgHrs').textContent  = avgHrs;
    qs('#statsRow').style.display  = '';
  }, function(){});
}

// ══════════════════════════════════════════════════════════
// CHECK-IN FLOW (forced GPS)
// ══════════════════════════════════════════════════════════
function triggerCheckIn() {
  if (!_gpsReady || !_gpsData) {
    // GPS not ready — show error modal
    showModalGPSError('modalIn', 'modalInBody', 'Check In');
    return;
  }
  // Show confirmation modal
  var locStr = getLocString();
  var now    = new Date();
  var timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
  var isLate  = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 0);

  qs('#modalInBody').innerHTML =
    '<div class="modal-icon">📍</div>'
    + '<div class="modal-title">Confirm Check In</div>'
    + '<div class="modal-body">Marking attendance at <b>' + timeStr + '</b>'
    + (isLate ? '<br><span style="color:var(--red)">⚠️ You are checking in late (after 09:00)</span>' : '') + '</div>'
    + '<div class="modal-loc"><b>📡 Your Location</b>' + locStr + '</div>'
    + '<div class="modal-btns">'
    + '<button class="modal-btns modal-cancel" onclick="closeModal(\'modalIn\')">Cancel</button>'
    + '<button class="modal-confirm-in" onclick="confirmCheckIn()">✓ Check In Now</button>'
    + '</div>';
  openModal('modalIn');
}

function confirmCheckIn() {
  closeModal('modalIn');
  if (!_gpsReady || !_gpsData) { toast('GPS lost. Try again.', 'error'); return; }
  var locStr = getLocString();

  qs('#checkInBtn').disabled = true;
  _api('checkIn', { location: locStr, officeInTime: '09:00', officeOutTime: '18:00' }, function(r) {
    qs('#checkInBtn').disabled = false;
    if (!r.success) { toast(r.error, 'error'); return; }
    toast('✅ Checked In · ' + r.checkInTime + ' · ' + r.inStatus, 'success');
    loadTodayStatus();
    loadMonthStats();
  }, function(e) { qs('#checkInBtn').disabled = false; toast(e.message, 'error'); });
}

// ══════════════════════════════════════════════════════════
// CHECK-OUT FLOW (forced GPS)
// ══════════════════════════════════════════════════════════
function triggerCheckOut() {
  if (!_gpsReady || !_gpsData) {
    showModalGPSError('modalOut', 'modalOutBody', 'Check Out');
    return;
  }
  var locStr  = getLocString();
  var inTime  = _todayRec ? (_todayRec['Check_In_Time'] || '') : '';
  qs('#modalOutBody').innerHTML =
    '<div class="modal-icon">🏁</div>'
    + '<div class="modal-title">Confirm Check Out</div>'
    + '<div class="modal-body">'
    + (inTime ? 'Checked in at <b>' + inTime + '</b><br>' : '')
    + 'Ready to mark checkout?</div>'
    + '<div class="modal-loc"><b>📡 Your Location</b>' + locStr + '</div>'
    + '<div class="modal-btns">'
    + '<button class="modal-cancel" onclick="closeModal(\'modalOut\')">Cancel</button>'
    + '<button class="modal-confirm-out" onclick="confirmCheckOut()">✓ Check Out</button>'
    + '</div>';
  openModal('modalOut');
}

function confirmCheckOut() {
  closeModal('modalOut');
  if (!_gpsReady || !_gpsData) { toast('GPS lost. Try again.', 'error'); return; }
  qs('#checkOutBtn').disabled = true;
  _api('checkOut', { location: getLocString() }, function(r) {
    qs('#checkOutBtn').disabled = false;
    if (!r.success) { toast(r.error, 'error'); return; }
    toast('✅ Checked Out · ' + r.totalHours + 'h worked' + (parseFloat(r.overtimeHours) > 0 ? ' · OT: ' + r.overtimeHours + 'h' : ''), 'success');
    loadTodayStatus();
    loadMonthStats();
  }, function(e) { qs('#checkOutBtn').disabled = false; toast(e.message, 'error'); });
}

// GPS Error modal
function showModalGPSError(modalId, bodyId, action) {
  qs('#' + bodyId).innerHTML =
    '<div style="font-size:2.5rem;text-align:center;margin-bottom:10px">📵</div>'
    + '<div class="modal-title" style="color:var(--red)">GPS Required</div>'
    + '<div class="modal-body">Location access is required to ' + action + '.<br>'
    + 'Please <b>enable GPS / Location</b> in your browser settings and try again.</div>'
    + '<div class="modal-btns">'
    + '<button class="modal-cancel" onclick="closeModal(\'' + modalId + '\')">Close</button>'
    + '<button class="modal-confirm-in" onclick="closeModal(\'' + modalId + '\');startGPS()">Retry GPS</button>'
    + '</div>';
  openModal(modalId);
}

function openModal(id)  { qs('#' + id).classList.add('show'); }
function closeModal(id) { qs('#' + id).classList.remove('show'); }

// Close modal on backdrop click
document.addEventListener('click', function(e) {
  ['modalIn','modalOut'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el && e.target === el) closeModal(id);
  });
});

// ══════════════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════════════
function loadHistory() {
  qs('#historyList').innerHTML = '<div class="loader"></div>';
  _api('getMyHistory', { days: 30 }, function(r) {
    if (!r.success) { qs('#historyList').innerHTML = '<div class="empty">' + r.error + '</div>'; return; }
    _histRecords = r.records;

    // Summary stats
    var present = 0, absent = 0, late = 0, ot = 0;
    r.records.forEach(function(x) {
      var st = (x['Attendance_Status'] || '').toLowerCase();
      if (st === 'present') present++;
      if (st === 'absent')  absent++;
      if ((x['IN Status']||'').toLowerCase() === 'late') late++;
      ot += parseFloat(x['Overtime_Hours'] || 0);
    });
    qs('#msPres').textContent  = present;
    qs('#msAbs').textContent   = absent;
    qs('#msLate').textContent  = late;
    qs('#msOt').textContent    = ot.toFixed(1) + 'h';
    qs('#monthSummary').style.display = '';

    if (!r.records.length) {
      qs('#historyList').innerHTML = '<div class="empty">No records in the last 30 days</div>';
      return;
    }
    qs('#historyList').innerHTML = r.records.map(renderHistCard).join('');
  }, function(e) { qs('#historyList').innerHTML = '<div class="empty">' + e.message + '</div>'; });
}

function renderHistCard(rec) {
  var d       = rec['Date'] || '';
  var weekday = '';
  try { weekday = new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long' }); } catch(e) {}
  var attSt   = (rec['Attendance_Status'] || 'Present').toLowerCase();
  var inSt    = (rec['IN Status'] || '').toLowerCase();
  var outSt   = (rec['OUT Status'] || '').toLowerCase();
  var inClass = inSt === 'late' ? 'late' : (inSt ? 'ontime' : '');
  var outClass= outSt === 'early' ? 'early' : (outSt ? 'ontime' : '');

  var locIn  = rec['IN Location']  ? '📍 IN: '  + truncate(rec['IN Location'],  45) : '';
  var locOut = rec['Out Location'] ? ' · OUT: ' + truncate(rec['Out Location'], 45) : '';

  return '<div class="hist-card">'
    + '<div class="hist-top">'
    +   '<div><div class="hist-date">' + d + '</div><div class="hist-weekday">' + weekday + '</div></div>'
    +   '<span class="att-chip ' + attSt + '">' + (rec['Attendance_Status'] || 'Present') + '</span>'
    + '</div>'
    + '<div class="hist-grid">'
    +   '<div class="hist-cell"><div class="hist-cell-lbl">Check In</div><div class="hist-cell-val ' + inClass + '">' + (rec['Check_In_Time'] || '—') + '</div><div style="font-size:.65rem;color:var(--text3);margin-top:1px">' + (rec['IN Status'] || '') + '</div></div>'
    +   '<div class="hist-cell"><div class="hist-cell-lbl">Check Out</div><div class="hist-cell-val ' + outClass + '">' + (rec['Check_Out_Time'] || '—') + '</div><div style="font-size:.65rem;color:var(--text3);margin-top:1px">' + (rec['OUT Status'] || '') + '</div></div>'
    +   '<div class="hist-cell"><div class="hist-cell-lbl">Hours</div><div class="hist-cell-val">' + (rec['Total_Hours'] || '—') + '</div></div>'
    +   '<div class="hist-cell"><div class="hist-cell-lbl">Overtime</div><div class="hist-cell-val" style="color:var(--yellow)">' + (parseFloat(rec['Overtime_Hours']||0) > 0 ? rec['Overtime_Hours'] + 'h' : '—') + '</div></div>'
    + '</div>'
    + (locIn ? '<div class="hist-loc">' + locIn + locOut + '</div>' : '')
    + '</div>';
}

// ══════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════
function loadAdmin() {
  var isAdmin = _U && (_U.role === 'admin' || _U.role === 'hr');
  if (!isAdmin) { qs('#adminList').innerHTML = '<div class="empty">Access denied.</div>'; return; }
  var today = new Date().toISOString().slice(0, 10);
  qs('#filterFrom').value = today;
  qs('#filterTo').value   = today;
  fetchAdminData();
}

function fetchAdminData() {
  var from = qs('#filterFrom').value;
  var to   = qs('#filterTo').value;
  qs('#adminList').innerHTML  = '<div class="loader"></div>';
  qs('#adminChips').innerHTML = '';
  _api('getAllAttendance', { from: from, to: to }, function(r) {
    if (!r.success) { qs('#adminList').innerHTML = '<div class="empty">' + r.error + '</div>'; return; }
    renderAdminData(r.records);
  }, function(e) { qs('#adminList').innerHTML = '<div class="empty">' + e.message + '</div>'; });
}

function renderAdminData(records) {
  if (!records.length) {
    qs('#adminList').innerHTML = '<div class="empty">No records found</div>';
    qs('#adminChips').innerHTML = '';
    return;
  }

  var total   = records.length;
  var present = records.filter(function(r){ return (r['Attendance_Status']||'').toLowerCase()==='present'; }).length;
  var late    = records.filter(function(r){ return (r['IN Status']||'').toLowerCase()==='late'; }).length;
  var ot      = records.reduce(function(s,r){ return s + parseFloat(r['Overtime_Hours']||0); }, 0);

  qs('#adminChips').innerHTML =
    '<div class="chip blue">Total: ' + total + '</div>'
    + '<div class="chip green">Present: ' + present + '</div>'
    + '<div class="chip red">Late: ' + late + '</div>'
    + '<div class="chip orange">OT: ' + ot.toFixed(1) + 'h</div>';

  // Group by date
  var byDate = {};
  records.forEach(function(r) {
    var d = r['Date'] || 'Unknown';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });

  var html = '';
  Object.keys(byDate).sort().reverse().forEach(function(date) {
    var rows = byDate[date];
    html += '<div class="admin-date-hdr">' + date + '<span>' + rows.length + ' records</span></div>';
    rows.forEach(function(rec) {
      var inSt = (rec['IN Status'] || '').toLowerCase();
      var inColor = inSt === 'late' ? 'var(--red)' : (inSt ? 'var(--green)' : 'var(--text2)');
      html += '<div class="admin-row">'
        + '<div class="admin-email">' + (rec['Usermail'] || '') + '</div>'
        + '<div class="admin-empid">' + (rec['Employee_ID'] || '') + '</div>'
        + '<div class="admin-times">'
        +   '<span>In: <b>' + (rec['Check_In_Time'] || '—') + '</b> <span style="color:' + inColor + ';font-size:.7rem">' + (rec['IN Status'] || '') + '</span></span>'
        +   '<span>Out: <b>' + (rec['Check_Out_Time'] || '—') + '</b></span>'
        +   '<span>Hrs: <b>' + (rec['Total_Hours'] || '—') + '</b></span>'
        +   (parseFloat(rec['Overtime_Hours']||0) > 0 ? '<span>OT: <b style="color:var(--yellow)">' + rec['Overtime_Hours'] + 'h</b></span>' : '')
        + '</div>'
        + '</div>';
    });
  });
  qs('#adminList').innerHTML = html;
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
function qs(sel) { return document.querySelector(sel); }

function toast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + (type || '');
  setTimeout(function(){ t.className = 'toast'; }, 4000);
}

function setBtnLoad(sel, loading, label) {
  var b = qs(sel); if (!b) return;
  b.disabled = loading; b.textContent = label;
}

function truncate(str, n) {
  str = String(str || '');
  return str.length > n ? str.slice(0, n) + '…' : str;
}
