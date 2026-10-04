import { clampTime, progressAt, tonearmAngle, formatTime, waveformPeaks } from './playback.js';

// ── CONFIG ──
const ARCHIVE_FUNCTION_URL = '/api/devotionals';
const ADMIN_LOGIN_URL = '/api/admin-login';
const ADMIN_LOGOUT_URL = '/api/admin-logout';
const ADMIN_SESSION_URL = '/api/admin-session';
const AUDIO_UPLOAD_URL = '/api/upload-audio';
const ART_UPLOAD_URL = '/api/upload-art';
const AUDIO_DELETE_URL = '/api/delete-audio';
const ENTRY_CREATE_URL = '/api/admin-entry-create';
const ENTRY_UPDATE_URL = '/api/admin-entry-update';
const ENTRY_DELETE_URL = '/api/admin-entry-delete';

// ── STATE ──
const audio = document.getElementById('audioEl');
let entries = [], current = null, playing = false, isAdmin = false, pendingDeleteId = null, loopOn = false, editingEntryId = null;
// Web Audio vars removed — using simulated visualizer
let waveformBars = [], waveformW = 0;
let entriesLoaded = false;
let previousVolume = 0.85;
let toastTimer = null;
let archiveRequest = null, archiveError = false;
let feedbackTime = 0, feedbackController = null;
let waveformController = null;
const waveformCache = new Map();
let pendingPublication = null, artworkPreviewUrl = null, dialogOpener = null, activeDialog = null;
let saving = false, deleting = false;

// ── INIT ──
function localDate() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
document.getElementById('uDate').value = localDate();
document.getElementById('localPreviewNotice').hidden = true;
drawViz();
audio.volume = previousVolume;
updateAdminCta();
updateArchiveMeta();
syncVolumeUI();
syncAdminSession();
loadEntries();

// ── DYNAMIC COLOR ──
function extractColor(imgEl) {
  try {
    var c = document.createElement('canvas'); c.width = 50; c.height = 50;
    var ctx = c.getContext('2d'); ctx.drawImage(imgEl, 0, 0, 50, 50);
    var d = ctx.getImageData(0, 0, 50, 50).data;
    var br = 232, bg = 168, bb = 50, best = 0;
    for (var i = 0; i < d.length; i += 8) {
      var r=d[i], g=d[i+1], b=d[i+2];
      var mx=Math.max(r,g,b), sat=mx>0?(mx-Math.min(r,g,b))/mx:0;
      var score = sat * (mx/255);
      if (score > best && mx/255 > .25 && mx/255 < .92) { best=score; br=r; bg=g; bb=b; }
    }
    document.documentElement.style.setProperty('--dyn-r', br);
    document.documentElement.style.setProperty('--dyn-g', bg);
    document.documentElement.style.setProperty('--dyn-b', bb);
  } catch(e) {}
}

// ── VISUALIZER (simulated — no Web Audio dependency) ──
var vizCanvas = document.getElementById('vizCanvas');
var vizCtx = vizCanvas && typeof vizCanvas.getContext === 'function' ? vizCanvas.getContext('2d') : null;
// Pre-bake random bar heights so each bar has its own personality
var barSeeds = [];
for (var _i=0; _i<80; _i++) { barSeeds.push(Math.random()*Math.PI*2); }

function drawViz() {
  requestAnimationFrame(drawViz);
  if (!vizCtx) return;
  vizCtx.clearRect(0, 0, 300, 300);
  if (document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var cx=150, cy=150, innerR=113, bars=80;
  var r = getComputedStyle(document.documentElement).getPropertyValue('--dyn-r').trim() || 232;
  var g = getComputedStyle(document.documentElement).getPropertyValue('--dyn-g').trim() || 168;
  var b = getComputedStyle(document.documentElement).getPropertyValue('--dyn-b').trim() || 50;
  var t = Date.now();
  for (var i = 0; i < bars; i++) {
    var angle = (i/bars)*Math.PI*2 - Math.PI/2;
    var barH, alpha;
    if (playing) {
      // Lively multi-wave simulation when playing
      var wave1 = Math.sin(t*0.002 + barSeeds[i]) * 0.5 + 0.5;
      var wave2 = Math.sin(t*0.0035 + i*0.22) * 0.4 + 0.4;
      var wave3 = Math.sin(t*0.001 + i*0.08) * 0.3 + 0.3;
      var val = (wave1*0.45 + wave2*0.35 + wave3*0.2);
      barH = 4 + val * 48;
      alpha = 0.15 + val * 0.7;
    } else {
      // Gentle idle shimmer
      var shimmer = Math.sin(t*0.0008 + barSeeds[i]) * 0.5 + 0.5;
      barH = 1.5 + shimmer * 3;
      alpha = 0.03 + shimmer * 0.05;
    }
    var x1=cx+Math.cos(angle)*innerR, y1=cy+Math.sin(angle)*innerR;
    var x2=cx+Math.cos(angle)*(innerR+barH), y2=cy+Math.sin(angle)*(innerR+barH);
    var grad = vizCtx.createLinearGradient(x1,y1,x2,y2);
    grad.addColorStop(0, 'rgba('+r+','+g+','+b+','+(alpha*0.4)+')');
    grad.addColorStop(1, 'rgba('+r+','+g+','+b+','+alpha+')');
    vizCtx.strokeStyle = grad;
    vizCtx.lineWidth = playing ? 2.5 : 1.5;
    vizCtx.lineCap = 'round';
    vizCtx.beginPath(); vizCtx.moveTo(x1,y1); vizCtx.lineTo(x2,y2); vizCtx.stroke();
  }
}

// ── WAVEFORM ──
function renderWaveform(peaks = Array(90).fill(.1)) {
  var n=90, bw=2.5, gap=1.2, H=52;
  waveformBars = peaks;
  waveformW = n*bw + (n-1)*gap;
  var dim='', lit='';
  for(var i=0;i<waveformBars.length;i++){
    var bh=Math.max(4,waveformBars[i]*H*.88), y=(H-bh)/2, x=i*(bw+gap);
    dim += '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw+'" height="'+bh.toFixed(1)+'" rx="1.2" fill="#cbd5bb"/>';
    lit  += '<rect x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+bw+'" height="'+bh.toFixed(1)+'" rx="1.2" fill="#83986c"/>';
  }
  document.getElementById('waveformContainer').innerHTML =
    '<svg width="'+waveformW+'" height="'+H+'" viewBox="0 0 '+waveformW+' '+H+'" preserveAspectRatio="none" style="width:100%;height:'+H+'px">' +
    '<defs><clipPath id="wClip"><rect id="wClipRect" x="0" y="0" width="0" height="'+H+'"/></clipPath></defs>' +
    '<g>'+dim+'</g><g clip-path="url(#wClip)">'+lit+'</g></svg>';
}
async function analyzeWaveform(entry) {
  if (waveformController) waveformController.abort();
  const controller = new AbortController();
  waveformController = controller;
  const hint = document.getElementById('waveformHint');
  if (!entry.audio_url) { renderWaveform(); hint.textContent = 'Add a recording to enable playback and seeking.'; return; }
  if (waveformCache.has(entry.audio_url)) { renderWaveform(waveformCache.get(entry.audio_url)); hint.textContent = 'Tap anywhere on the waveform to jump through the song'; syncPlaybackUI(); return; }
  renderWaveform();
  hint.textContent = 'Analyzing the recording. You can already seek here.';
  let context;
  try {
    const response = await fetch(entry.audio_url, { signal: controller.signal });
    if (!response.ok || Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('waveform-unavailable');
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 20 * 1024 * 1024) { await reader.cancel(); throw new Error('waveform-too-large'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    context = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = await context.decodeAudioData(bytes.buffer);
    if (controller.signal.aborted || current?.id !== entry.id) return;
    const peaks = waveformPeaks(buffer);
    if (waveformCache.size >= 5) waveformCache.delete(waveformCache.keys().next().value);
    waveformCache.set(entry.audio_url, peaks);
    renderWaveform(peaks);
    document.getElementById('waveformHint').textContent = 'Tap anywhere on the waveform to jump through the song';
    syncPlaybackUI();
  } catch (error) {
    if (!controller.signal.aborted && current?.id === entry.id) {
      document.getElementById('waveformHint').textContent = 'Audio preview unavailable. The seek bar still works.';
    }
  } finally { if (context) await context.close(); }
}
function updateWaveform(pct) {
  var r = document.getElementById('wClipRect');
  if (r) r.setAttribute('width', (pct*waveformW).toFixed(2));
}
function canUseServerFunctions() {
  return /^https?:$/.test(location.protocol);
}
async function readJsonResponse(res) {
  var text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch(e) { throw new Error('invalid-server-response'); }
}
async function requestJson(url, body, options = {}) {
  var res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : {'content-type':'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: options.signal || AbortSignal.timeout(15000)
  });
  var data = await readJsonResponse(res);
  if (!res.ok) {
    const error = new Error(data.error || ('request-' + res.status));
    error.status = res.status;
    error.retryAfter = data.retryAfter;
    throw error;
  }
  return data;
}
function setAdminMode(next) {
  isAdmin = !!next;
  document.body.classList.toggle('admin-mode', isAdmin);
  document.getElementById('adminBadge').classList.toggle('show', isAdmin);
  updateAdminCta();
  document.getElementById('logoutBtn').hidden = !isAdmin;
}
async function syncAdminSession() {
  if (!canUseServerFunctions()) return;
  const modeAtRequest = isAdmin;
  try {
    var res = await fetch(ADMIN_SESSION_URL, {cache:'no-store'});
    var data = await readJsonResponse(res);
    if (isAdmin === modeAtRequest) setAdminMode(!!(res.ok && data.authenticated));
  } catch (err) {
    if (isAdmin === modeAtRequest) setAdminMode(false);
  }
}
function handleAdminUnauthorized() {
  closeDeleteModal();
  setAdminMode(false);
  showView('admin-gate');
  toast('Admin session expired');
}
async function uploadAudioFile(audioFile, entryDate, statusEl) {
  if (!audioFile || !canUseServerFunctions()) throw new Error('server-functions-unavailable');
  statusEl.textContent = 'Uploading audio…';
  var uploadRes = await fetch(AUDIO_UPLOAD_URL + '?entryDate=' + encodeURIComponent(entryDate || '') + '&filename=' + encodeURIComponent(audioFile.name || 'track.mp3'), {
    method: 'POST',
    headers: {
      'content-type': audioFile.type || 'application/octet-stream'
    },
    body: audioFile
  });
  var uploaded = await readJsonResponse(uploadRes);
  if (uploadRes.status === 401) {
    handleAdminUnauthorized();
  }
  if (!uploadRes.ok) throw new Error(uploaded.error || uploaded.message || ('upload-' + uploadRes.status));
  return uploaded.publicUrl;
}
async function uploadArtFile(artBlob, entryDate, statusEl) {
  if (!artBlob || !canUseServerFunctions()) throw new Error('server-functions-unavailable');
  statusEl.textContent = 'Uploading artwork…';
  var extension = (artBlob.type || 'image/jpeg').split('/').pop() || 'jpg';
  var artName = 'cover.' + extension;
  var uploadRes = await fetch(ART_UPLOAD_URL + '?entryDate=' + encodeURIComponent(entryDate || '') + '&filename=' + encodeURIComponent(artName), {
    method: 'POST',
    headers: {
      'content-type': artBlob.type || 'image/jpeg'
    },
    body: artBlob
  });
  var uploaded = await readJsonResponse(uploadRes);
  if (uploadRes.status === 401) {
    handleAdminUnauthorized();
  }
  if (!uploadRes.ok) throw new Error(uploaded.error || uploaded.message || ('upload-' + uploadRes.status));
  return uploaded.publicUrl;
}
async function deleteAudioFile(audioUrl) {
  if (!audioUrl) return;
  if (!canUseServerFunctions()) throw new Error('server-functions-unavailable');
  try {
    await requestJson(AUDIO_DELETE_URL, {url: audioUrl});
  } catch (err) {
    if (String(err.message || '').indexOf('unauthorized') > -1) handleAdminUnauthorized();
    throw err;
  }
}
function updateTonearm(progress, hasTrack) {
  var arm = document.getElementById('tonearmArm');
  if (!arm) return;
  var angle = tonearmAngle(progress, hasTrack);
  arm.style.setProperty('--tonearm-angle', angle.toFixed(2) + 'deg');
}
function syncPlaybackUI() {
  var hasTrack = !!(current && current.audio_url && audio.src);
  var pct = progressAt(audio.currentTime, audio.duration);
  playing = !!(hasTrack && !audio.paused && !audio.ended);
  var playBtn = document.getElementById('playBtn');
  playBtn.textContent = playing ? '⏸' : '▶';
  playBtn.setAttribute('aria-label', playing ? 'Pause song' : 'Play song');
  playBtn.title = playing ? 'Pause the current song' : 'Play the current song';
  document.getElementById('ttScene').classList.toggle('is-playing', playing);
  document.getElementById('npRow').setAttribute('aria-hidden', String(!playing));
  document.getElementById('tNow').textContent = fmt(audio.currentTime || 0);
  document.getElementById('tTot').textContent = fmt(audio.duration || 0);
  updateWaveform(pct);
  updateTonearm(pct, hasTrack);
  const selectedCard = current && document.getElementById('card-' + current.id);
  if (selectedCard) {
    selectedCard.querySelector('.a-status').textContent = playing ? 'Now playing' : 'Selected';
    selectedCard.querySelector('.a-play').textContent = playing ? '⏸' : '▶';
  }
  const seek = document.getElementById('waveformSeek');
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  seek.setAttribute('aria-valuemax', duration.toFixed(2));
  seek.setAttribute('aria-valuenow', clampTime(audio.currentTime, duration).toFixed(2));
  seek.setAttribute('aria-valuetext', fmt(audio.currentTime) + ' of ' + fmt(duration));
  seek.setAttribute('aria-disabled', String(!duration));
  document.querySelectorAll('[data-action="play"], [data-action="rewind"], [data-action="forward"]').forEach(button => { if (button.tagName === 'BUTTON') button.disabled = !current?.audio_url; });
  document.querySelector('[data-action="lyrics"]').disabled = !current;
}
function seekFromWaveform(e) {
  if (!Number.isFinite(audio.duration) || !audio.duration) return;
  var c = document.getElementById('waveformContainer');
  var svg = c.querySelector('svg');
  var rect = (svg || c).getBoundingClientRect();
  var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  seekTo(pct * audio.duration);
  syncPlaybackUI();
}
function seekTo(seconds) {
  if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = clampTime(seconds, audio.duration);
  syncPlaybackUI();
}
function updateAdminCta() {
  var btn = document.getElementById('adminNavBtn');
  if (!btn) return;
  btn.textContent = isAdmin ? 'Writing room' : 'Songwriter login';
  btn.title = isAdmin ? 'Open the upload form' : 'Open admin login';
}
function updateArchiveMeta() {
  var summary = document.getElementById('archiveSummary');
  var focus = document.getElementById('archiveFocus');
  if (!summary || !focus) return;
  if (!entries.length) {
    summary.textContent = entriesLoaded ? 'No recordings published yet.' : 'Loading recordings…';
    focus.textContent = 'Choose a song below to start listening, or reopen the latest one from the archive.';
    return;
  }
  var latest = entries[0];
  summary.textContent = entries.length + ' song' + (entries.length === 1 ? '' : 's') + ' in the archive. Latest: ' + latest.title + '.';
  if (current) {
    var d = new Date(current.entry_date+'T12:00:00');
    focus.textContent = 'Selected: ' + current.title + ' • ' + d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) + '.';
  } else {
    focus.textContent = 'Choose a song below to start listening, or reopen the latest one from the archive.';
  }
}
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function sortEntries() {
  entries.sort(function(a, b) {
    return new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime();
  });
}
function upsertLocalEntry(entry) {
  if (!entry || !entry.id) return;
  var idx = entries.findIndex(function(item) { return item.id === entry.id; });
  if (idx > -1) entries[idx] = entry;
  else entries.unshift(entry);
  sortEntries();
  entriesLoaded = true;
}
function removeLocalEntry(id) {
  entries = entries.filter(function(entry) { return entry.id !== id; });
}
function resetPlayerState() {
  audio.pause(); audio.removeAttribute('src'); audio.load(); current = null;
  document.getElementById('pEyebrow').textContent = 'Select a recording below';
  document.getElementById('pTitle').innerHTML = 'Pick a little <em>melody.</em>';
  document.getElementById('pScripture').textContent = 'The songbook is just below.';
  document.getElementById('artImg').style.display = 'none';
  document.getElementById('artPh').style.display = 'flex';
  document.getElementById('waveformContainer').innerHTML = '';
  document.getElementById('tNow').textContent = '0:00';
  document.getElementById('tTot').textContent = '0:00';
  document.getElementById('songExtras').hidden = true;
  document.getElementById('playerStatus').textContent = '';
  syncPlaybackUI();
  updateArchiveMeta();
}
function updateSubmitMode() {
  var submitBtn = document.getElementById('submitBtn');
  submitBtn.textContent = editingEntryId ? 'Save Changes' : 'Publish Song';
}
function updateAudioFieldNote(text) {
  var note = document.getElementById('audioFieldNote');
  note.textContent = text || '';
  note.classList.toggle('show', !!text);
}
function resetSelectedAudio() {
  document.getElementById('uAudio').value = '';
  document.getElementById('audioDrop')._selectedFile = null;
  document.getElementById('audioFilename').textContent = '';
  document.getElementById('audioFilename').classList.remove('show');
  document.getElementById('extractedArtWrap').classList.remove('show');
  extractedArtBlob = null;
  if (artworkPreviewUrl) URL.revokeObjectURL(artworkPreviewUrl);
  artworkPreviewUrl = null;
  pendingPublication = null;
}
function resetUploadForm() {
  ['uTitle','uScripture','uLyrics','uNotes','gatePw'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('uDate').value = localDate();
  document.getElementById('upStatus').textContent = '';
  resetSelectedAudio();
  updateAudioFieldNote('');
}
function cancelEdit() {
  if (saving) return;
  editingEntryId = null;
  document.getElementById('editShell').classList.remove('show');
  document.getElementById('editTitle').textContent = '';
  resetUploadForm();
  updateSubmitMode();
  renderAdminEntryList();
}
function openAdminArea() {
  if (isAdmin && !entriesLoaded) loadEntries();
  showView(isAdmin ? 'admin-upload' : 'admin-gate');
}

// ── VIEW ──
function showView(name) {
  ['view-archive','view-admin-gate','view-admin-upload'].forEach(function(id){
    var el = document.getElementById(id);
    el.style.display='none'; el.classList.remove('active');
  });
  document.querySelectorAll('.hn-btn').forEach(function(b){ b.classList.remove('active'); });
  var el = document.getElementById('view-'+name);
  if (el) { el.style.display='block'; el.classList.add('active'); }
  if (name==='archive') document.querySelectorAll('.hn-btn')[0].classList.add('active');
  document.getElementById('adminNavBtn').classList.toggle('active', name.startsWith('admin'));
  if (name === 'archive' && !entriesLoaded) loadEntries();
  if (name === 'admin-upload') { renderAdminEntryList(); loadModeration(); }
}

// ── LOAD ENTRIES ──
async function loadEntries() {
  if (archiveRequest) return archiveRequest;
  const grid = document.getElementById('archiveGrid');
  if (!canUseServerFunctions()) { showArchiveFailure(true); return; }
  archiveError = false;
  grid.setAttribute('aria-busy', 'true');
  if (!entriesLoaded) document.getElementById('archiveSummary').textContent = 'Opening the songbook...';
  archiveRequest = (async () => {
    try {
      const data = await requestJson(ARCHIVE_FUNCTION_URL);
      if (!Array.isArray(data)) throw new Error('invalid-archive');
      entries = data;
      entriesLoaded = true;
      sortEntries();
      renderGrid();
      renderAdminEntryList();
      updateArchiveMeta();
      const requestedId = new URL(location.href).searchParams.get('song');
      const target = entries.find(entry => entry.id === (current?.id || requestedId));
      if (target) loadEntry(target, false, false);
      else if (entries.length) {
        loadEntry(entries[0], false, false);
        if (requestedId) toast('That song is no longer available. The rest of the songbook is below.');
      } else resetPlayerState();
    } catch (error) {
      archiveError = true;
      if (entriesLoaded) {
        toast('Could not refresh the songbook. Your current song is still available.');
      } else showArchiveFailure(false);
      renderAdminEntryList();
    } finally {
      grid.setAttribute('aria-busy', 'false');
      archiveRequest = null;
    }
  })();
  return archiveRequest;
}
function showArchiveFailure(localFile) {
  document.getElementById('archiveGrid').innerHTML = '<div class="empty-state"><div class="g">✦</div><p>' +
    (localFile ? 'This preview needs the local Cloudflare server.' : 'The songbook could not be reached.') +
    '</p><button class="utility-btn" data-action="retry">Try again</button></div>';
  document.getElementById('archiveSummary').textContent = 'Songbook unavailable.';
  document.getElementById('archiveFocus').textContent = localFile ? 'Open the local preview or the live site, rather than the HTML file.' : 'Check your connection and try again. No login is needed to listen.';
  document.getElementById('archiveGrid').setAttribute('aria-busy', 'false');
}
function renderGrid() {
  if (!entriesLoaded) return;
  var grid = document.getElementById('archiveGrid');
  if (!entries.length) {
    grid.innerHTML = '<div class="empty-state"><div class="g">✦</div><p>No songs have been published yet.</p></div>';
    updateArchiveMeta();
    return;
  }
  const query = document.getElementById('songSearch').value.trim().toLowerCase();
  const visible = entries.filter(e => (e.title + ' ' + (e.scripture || '')).toLowerCase().includes(query));
  if (!visible.length) { grid.innerHTML = '<div class="empty-state"><p>No songs match your search.</p></div>'; return; }
  grid.innerHTML = visible.map(function(e) {
    var d = new Date(e.entry_date+'T12:00:00');
    var lbl = d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
    var thumb = e.art_url ? '<div class="a-thumb"><img class="a-art" alt="" loading="lazy" src="'+escapeHtml(e.art_url)+'"/></div>'
                          : '<div class="a-thumb"><div class="a-art-ph">✦</div></div>';
    return '<div class="a-card" id="card-'+escapeHtml(e.id)+'" role="button" tabindex="0" data-action="select-song" data-id="'+escapeHtml(e.id)+'" aria-label="Listen to '+escapeHtml(e.title)+'">' +
      thumb +
      '<div class="a-info"><div class="a-title">'+escapeHtml(e.title)+'</div><div class="a-meta"><div class="a-date">'+lbl+'</div><div class="a-status">Now Playing</div></div><div class="a-ref">'+escapeHtml(e.scripture||'')+'</div></div>' +
      '<div class="a-actions"><div class="a-play">▶</div></div>' +
      '</div>';
  }).join('');
  if (current) highlightCard(current.id);
  updateArchiveMeta();
}
function renderAdminEntryList() {
  var list = document.getElementById('adminEntryList');
  if (!list) return;
  if (!entriesLoaded) {
    list.innerHTML = archiveError ? '<div class="admin-entry-empty">Could not load entries. <button class="utility-btn" data-action="retry">Retry</button></div>' : '<div class="admin-entry-empty">Loading entries…</div>';
    return;
  }
  if (!entries.length) {
    list.innerHTML = '<div class="admin-entry-empty">No published entries yet.</div>';
    return;
  }
  list.innerHTML = entries.map(function(entry) {
    var date = new Date(entry.entry_date + 'T12:00:00').toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
    var scripture = entry.scripture ? '<span><strong>Key</strong> ' + escapeHtml(entry.scripture) + '</span>' : '';
    var audioLabel = entry.audio_url ? 'Audio ready' : 'No audio';
    var isEditing = editingEntryId === entry.id;
    return '<div class="admin-entry-card' + (isEditing ? ' is-editing' : '') + '">' +
      '<div class="admin-entry-main">' +
        '<div class="admin-entry-title">' + escapeHtml(entry.title) + '</div>' +
        '<div class="admin-entry-meta"><span><strong>Date</strong> ' + date + '</span>' + scripture + '<span><strong>Media</strong> ' + audioLabel + '</span></div>' +
      '</div>' +
      '<div class="admin-entry-actions">' +
        '<button class="admin-entry-btn" type="button" data-action="edit-entry" data-id="' + escapeHtml(entry.id) + '">Edit</button>' +
        '<button class="admin-entry-btn danger" type="button" data-action="delete-entry" data-id="' + escapeHtml(entry.id) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function highlightCard(id) {
  document.querySelectorAll('.a-card').forEach(function(c){ c.classList.remove('now-playing'); });
  var card = document.getElementById('card-'+id);
  if (card) card.classList.add('now-playing');
}

// ── LOAD ENTRY ──
function loadEntry(entry, autoplay, navigate = true) {
  if (!entry) return;
  if (autoplay === undefined) autoplay = true;
  const sameTrack = current?.id === entry.id && current?.audio_url === entry.audio_url;
  const previousId = current?.id;
  current = entry;
  var d = new Date(entry.entry_date+'T12:00:00');
  document.getElementById('pEyebrow').textContent = d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('pTitle').innerHTML = '<em>'+escapeHtml(entry.title)+'</em>';
  document.getElementById('pScripture').textContent = entry.scripture||'';
  var img = document.getElementById('artImg'), ph = document.getElementById('artPh');
  if (entry.art_url) {
    img.onload = function(){ extractColor(img); };
    img.onerror = function(){ img.style.display='none'; ph.style.display='flex'; };
    if (img.getAttribute('src') !== entry.art_url) img.src = entry.art_url;
    img.style.display='block'; ph.style.display='none';
  } else {
    img.style.display='none'; ph.style.display='flex';
    document.getElementById('ttPlinth').style.boxShadow='';
  }
  if (!sameTrack) analyzeWaveform(entry);
  highlightCard(entry.id);
  updateArchiveMeta();
  if (!sameTrack && entry.audio_url) {
    document.getElementById('playerStatus').textContent = 'Getting the recording ready...';
    audio.src = entry.audio_url;
    audio.load();
    syncPlaybackUI();
    if (autoplay) {
      playAudio();
    }
  } else if (!entry.audio_url) {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    syncPlaybackUI();
    document.getElementById('playerStatus').textContent = 'No recording attached yet. You can still read the lyrics.';
  } else if (autoplay) {
    togglePlay();
  }
  if (navigate) showView('archive');
  if (navigate && previousId !== entry.id) {
    const url = new URL(location.href);
    url.searchParams.set('song', entry.id);
    history.pushState({}, '', url);
  }
  document.body.classList.toggle('shared-song', new URL(location.href).searchParams.has('song'));
  updateSongExtras(previousId !== entry.id);
  syncPlaybackUI();
}

// ── PLAYBACK ──
function togglePlay() {
  if (!current || !current.audio_url) return;
  if (audio.paused) {
    playAudio();
  } else {
    audio.pause();
    syncPlaybackUI();
  }
}
function rewind15() { seekTo(audio.currentTime - 15); }
function skipFwd()  { seekTo(audio.currentTime + 15); }
function playAudio() {
  audio.play().then(syncPlaybackUI).catch(error => {
    syncPlaybackUI();
    if (error.name !== 'AbortError') document.getElementById('playerStatus').textContent = 'Could not start playback. Press play to try again.';
  });
}
function toggleLoop() {
  loopOn = !loopOn; audio.loop = loopOn;
  document.getElementById('loopBtn').classList.toggle('active', loopOn);
  document.getElementById('loopBtn').setAttribute('aria-pressed', String(loopOn));
  toast(loopOn ? 'Loop On' : 'Loop Off');
}
function syncVolumeUI() {
  var slider = document.getElementById('volumeSlider');
  var readout = document.getElementById('volumeReadout');
  var btn = document.getElementById('volumeBtn');
  var pct = Math.round((audio.muted ? 0 : audio.volume) * 100);
  slider.value = pct;
  slider.style.setProperty('--vol-pct', pct + '%');
  readout.textContent = pct + '%';
  btn.textContent = pct === 0 ? '🔇' : (pct < 45 ? '🔉' : '🔊');
  btn.setAttribute('aria-label', pct === 0 ? 'Unmute volume' : 'Mute volume');
  btn.title = pct === 0 ? 'Unmute volume' : 'Mute or unmute volume';
}
function setVolume(value) {
  var next = Math.max(0, Math.min(100, parseFloat(value || 0))) / 100;
  audio.muted = false;
  audio.volume = next;
  if (next > 0) previousVolume = next;
  syncVolumeUI();
}
function toggleMute() {
  if (audio.muted || audio.volume === 0) {
    audio.muted = false;
    audio.volume = previousVolume > 0 ? previousVolume : 0.85;
  } else {
    previousVolume = audio.volume > 0 ? audio.volume : previousVolume;
    audio.muted = true;
  }
  syncVolumeUI();
}
function setSpeed(rate) {
  audio.playbackRate = rate;
  document.querySelectorAll('.spd').forEach(function(b){ b.classList.toggle('active', Number(b.dataset.rate)===rate); b.setAttribute('aria-pressed', String(Number(b.dataset.rate)===rate)); });
}
audio.ontimeupdate = function() {
  syncPlaybackUI();
};
audio.onplay = syncPlaybackUI;
audio.onpause = syncPlaybackUI;
audio.onloadedmetadata = function(){ document.getElementById('playerStatus').textContent = ''; syncPlaybackUI(); };
audio.onwaiting = function(){ if (!audio.paused) document.getElementById('playerStatus').textContent = 'Buffering...'; };
audio.onplaying = function(){ document.getElementById('playerStatus').textContent = ''; syncPlaybackUI(); };
audio.onerror = function(){ document.getElementById('playerStatus').textContent = 'This recording could not be played. Try another song or press play to retry.'; syncPlaybackUI(); };
audio.ondurationchange = syncPlaybackUI;
audio.onvolumechange = syncVolumeUI;
audio.onseeked = syncPlaybackUI;
audio.onemptied = syncPlaybackUI;
audio.onended = function() {
  if (loopOn) return;
  syncPlaybackUI();
  if (document.getElementById('feedbackComment').value.trim()) return;
  var idx = entries.findIndex(function(e){ return current && e.id===current.id; });
  var next = entries[idx+1];
  if (next) { loadEntry(next, true); toast('Next: '+next.title); }
};
function fmt(s) { return formatTime(s); }

// ── LYRICS MODAL ──
function openModal(e) {
  if (e) e.stopPropagation();
  if (!current) return;
  var d = new Date(current.entry_date+'T12:00:00');
  document.getElementById('mDate').textContent = d.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
  document.getElementById('mTitle').textContent = current.title||'';
  document.getElementById('mScripture').textContent = current.scripture||'';
  document.getElementById('mLyrics').textContent = current.lyrics||'No lyrics added for this entry.';
  var mi = document.getElementById('mArtImg');
  if (current.art_url) { mi.src=current.art_url; mi.style.display='block'; } else { mi.style.display='none'; }
  openDialog('modalBg');
}
function closeModal() { closeDialog('modalBg'); }
function closeModalBg(e) { if(e.target===document.getElementById('modalBg')) closeModal(); }

// ── ADMIN ──
async function checkGate() {
  var input = document.getElementById('gatePw');
  var button = document.querySelector('#view-admin-gate .submit-btn');
  var password = input.value;
  if (!password) { toast('Enter password'); return; }
  button.disabled = true;
  document.getElementById('loginStatus').textContent = 'Opening the writing room...';
  try {
    await requestJson(ADMIN_LOGIN_URL, {password: password});
    input.value = '';
    setAdminMode(true);
    showView('admin-upload');
    toast('Welcome ✦');
    document.getElementById('loginStatus').textContent = '';
  } catch (err) {
    document.getElementById('loginStatus').textContent = friendlyError(err);
  } finally {
    button.disabled = false;
  }
}
function beginEditEntry(id) {
  if (saving) { toast('Please wait for the current save to finish.'); return; }
  var entry = entries.find(function(item) { return item.id === id; });
  if (!entry) return;
  editingEntryId = entry.id;
  document.getElementById('uTitle').value = entry.title || '';
  document.getElementById('uDate').value = entry.entry_date || '';
  document.getElementById('uScripture').value = entry.scripture || '';
  document.getElementById('uLyrics').value = entry.lyrics || '';
  document.getElementById('uNotes').value = entry.notes || '';
  document.getElementById('editTitle').textContent = entry.title || 'Untitled';
  document.getElementById('editShell').classList.add('show');
  updateSubmitMode();
  resetSelectedAudio();
  updateAudioFieldNote(entry.audio_url ? 'Leave audio empty to keep the existing file. Choose a new MP3 only if you want to replace it.' : 'No audio file is attached yet. Add one now if needed.');
  renderAdminEntryList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── DELETE ──
function openDeleteModal(id, title, e) {
  if (saving || deleting) return;
  if (e) e.stopPropagation(); pendingDeleteId=id;
  document.getElementById('delSongName').textContent='"'+title+'"';
  document.getElementById('dStep1').className='del-step active';
  document.getElementById('dStep2').className='del-step';
  document.getElementById('dLine').className='del-step-line';
  document.getElementById('delTitle').textContent='Delete This Recording?';
  document.getElementById('delSub').textContent='This permanently removes the song, audio, and lyrics.';
  document.getElementById('delRow1').style.display='flex';
  document.getElementById('delRow2').style.display='none';
  openDialog('delModalBg');
}
function advanceDelete() {
  document.getElementById('dStep1').className='del-step done';
  document.getElementById('dLine').className='del-step-line done';
  document.getElementById('dStep2').className='del-step active';
  document.getElementById('delTitle').textContent='Are You Absolutely Sure?';
  document.getElementById('delSub').textContent='Final confirmation. This cannot be recovered.';
  document.getElementById('delRow1').style.display='none';
  document.getElementById('delRow2').style.display='flex';
}
function closeDeleteModal() {
  if (deleting) return;
  closeDialog('delModalBg'); pendingDeleteId=null;
}
async function executeDelete() {
  if (!pendingDeleteId || deleting) return;
  deleting = true;
  var deletingId = pendingDeleteId;
  var btn = document.querySelector('#delRow2 .del-confirm');
  btn.textContent='Deleting…'; btn.disabled=true;
  try {
    await requestJson(ENTRY_DELETE_URL, {id: deletingId});
    deleting = false;
    closeDeleteModal();
    if (editingEntryId === deletingId) cancelEdit();
    removeLocalEntry(deletingId);
    renderGrid();
    renderAdminEntryList();
    if (current && current.id === deletingId) {
      if (entries.length) loadEntry(entries[0], false);
      else resetPlayerState();
    }
    toast('Song deleted. Media cleanup is queued.');
    loadEntries();
  } catch (err) {
    deleting = false;
    if (String(err.message || '').indexOf('unauthorized') > -1) handleAdminUnauthorized();
    toast(friendlyError(err));
  } finally {
    deleting = false;
    btn.textContent='Delete Forever'; btn.disabled=false;
  }
}

// ── UPLOAD ──
var extractedArtBlob = null; // stores artwork extracted from MP3

// Drag & drop for audio zone
(function() {
  var zone = document.getElementById('audioDrop');
  if (!zone) return;
  zone.addEventListener('dragover', function(e){ e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function(){ zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', function(e){
    e.preventDefault(); zone.classList.remove('drag-over');
    if (saving) return;
    var file = e.dataTransfer.files[0];
    if (file) { document.getElementById('uAudio').files; onAudioSelected(file); }
  });
})();

function onAudioSelected(file) {
  if (!file || saving) return;
  if (file.size > 20 * 1024 * 1024 || !/\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
    resetSelectedAudio();
    toast('Choose a supported audio file under 20 MB.');
    return;
  }
  resetSelectedAudio();
  // store dropped file reference on the element
  document.getElementById('audioDrop')._selectedFile = file;
  // show filename
  var fn = document.getElementById('audioFilename');
  fn.textContent = '✓ ' + file.name;
  fn.classList.add('show');
  // try to extract ID3 artwork
  extractedArtBlob = null;
  document.getElementById('extractedArtWrap').classList.remove('show');
  try {
    window.jsmediatags.read(file, {
      onSuccess: function(tag) {
        if (document.getElementById('audioDrop')._selectedFile !== file) return;
        var pic = tag.tags && tag.tags.picture;
        if (pic && pic.data.length <= 5 * 1024 * 1024 && /^image\/(jpeg|png|webp|gif)$/.test(pic.format)) {
          var bytes = new Uint8Array(pic.data);
          var blob = new Blob([bytes], {type: pic.format});
          extractedArtBlob = blob;
          var url = URL.createObjectURL(blob);
          artworkPreviewUrl = url;
          document.getElementById('extractedArtImg').src = url;
          document.getElementById('extractedArtWrap').classList.add('show');
        }
      },
      onError: function() { /* no tags, no problem */ }
    });
  } catch(e) { /* jsmediatags unavailable */ }
}

async function handleUpload() {
  if (saving || !document.getElementById('uploadForm').reportValidity()) return;
  var title    = document.getElementById('uTitle').value.trim();
  var date     = document.getElementById('uDate').value;
  var scripture= document.getElementById('uScripture').value.trim();
  var lyrics   = document.getElementById('uLyrics').value.trim();
  var notes    = document.getElementById('uNotes').value.trim();
  // get file — either from input or from drag-drop reference
  var inputEl  = document.getElementById('uAudio');
  var audioFile= document.getElementById('audioDrop')._selectedFile || (inputEl.files && inputEl.files[0]);
  if (!title||!date) { toast('Title and date required'); return; }
  var status=document.getElementById('upStatus');
  var editingEntry = editingEntryId ? entries.find(function(entry) { return entry.id === editingEntryId; }) : null;
  if (!audioFile && !editingEntry?.audio_url) { toast('Add a recording before publishing.'); return; }
  if (editingEntryId && !editingEntry) { toast('That entry no longer exists. Refresh the songbook.'); return; }
  var saveUrl = editingEntry ? ENTRY_UPDATE_URL : ENTRY_CREATE_URL;
  saving = true;
  document.querySelectorAll('#uploadForm input, #uploadForm textarea, #uploadForm button').forEach(el => { el.disabled = true; });
  pendingPublication ||= { id: editingEntry?.id || crypto.randomUUID(), audioUrl: null, artUrl: null };
  var saveSucceeded = false;
  var audio_url=null, art_url=null;
  try {
    if (audioFile) {
      pendingPublication.audioUrl ||= await uploadAudioFile(audioFile, date, status);
      audio_url = pendingPublication.audioUrl;
    }
    else if (editingEntry) audio_url = editingEntry.audio_url || null;
    if (extractedArtBlob) {
      pendingPublication.artUrl ||= await uploadArtFile(extractedArtBlob, date, status);
      art_url = pendingPublication.artUrl;
    }
    else if (editingEntry) art_url = editingEntry.art_url || null;
    status.textContent='Saving…';
    var result = await requestJson(saveUrl, {
      id: pendingPublication.id,
      title: title,
      entry_date: date,
      scripture: scripture,
      lyrics: lyrics,
      notes: notes,
      audio_url: audio_url,
      art_url: art_url
    });
    var savedEntry = result && result.entry ? result.entry : null;
    if (!savedEntry) throw new Error('invalid-server-response');
    if (savedEntry) {
      upsertLocalEntry(savedEntry);
      renderGrid();
      renderAdminEntryList();
      if (current && current.id === savedEntry.id) loadEntry(savedEntry, false, false);
    }
    saving = false;
    cancelEdit();
    saveSucceeded = true;
    toast(editingEntry ? 'Changes saved' : 'Published ✦');
    loadEntries();
    showView('admin-upload');
  } catch (err) {
    console.error(err);
    if (String(err.message || '').indexOf('unauthorized') > -1) handleAdminUnauthorized();
    status.textContent = friendlyError(err) + ' Your form is still here. Retry to finish publishing.';
    toast(friendlyError(err));
  } finally {
    saving = false;
    document.querySelectorAll('#uploadForm input, #uploadForm textarea, #uploadForm button').forEach(el => { el.disabled = false; });
    if (saveSucceeded) status.textContent='';
  }
}

// ── TOAST ──
function toast(msg) {
  var el=document.getElementById('toast');
  clearTimeout(toastTimer);
  el.textContent=msg; el.classList.add('show');
  toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 2800);
}

function friendlyError(error) {
  if (error.status === 429) return 'Please wait ' + Math.max(1, Math.ceil((error.retryAfter || 900) / 60)) + ' minutes before trying again.';
  const messages = {
    'invalid-password': 'That password is not correct. Please try again.',
    'unauthorized': 'Your session expired. Log in again; your form has been kept.',
    'missing-security-config': 'The writing room has not been configured yet.',
    'file-too-large': 'This file is too large. Audio: 20 MB maximum; artwork: 5 MB.',
    'unsupported-file-type': 'That file type is not supported.',
    'invalid-file-content': 'The file does not match its extension. Choose a valid audio or image file.',
    'invalid-feedback': 'Add a note of up to 1,000 characters and a valid timestamp.',
    'invalid-title': 'Use a song title of 1 to 200 characters.',
    'invalid-date': 'Choose a valid entry date.',
    'not-found': 'This item is no longer available.',
    'invalid-origin': 'Reload the app from its normal address and try again.'
  };
  return messages[error.message] || 'Could not finish the request. Check your connection and try again.';
}

function songUrl(entry = current) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('song', entry.id);
  return url.href;
}
async function shareSong(native = false) {
  if (!current) return;
  try {
    if (native && navigator.share) await navigator.share({ title: current.title + ' | SELAH', url: songUrl() });
    else { await navigator.clipboard.writeText(songUrl()); toast('Song link copied. The whole songbook is there, too.'); }
  } catch (error) {
    if (error.name !== 'AbortError') toast('Sharing is unavailable in this browser. Copy the address from the address bar.');
  }
}

function updateSongExtras(changed) {
  document.getElementById('songExtras').hidden = !current;
  document.getElementById('songNotes').hidden = !current?.notes;
  document.getElementById('songNoteText').textContent = current?.notes || '';
  document.getElementById('nativeShareBtn').hidden = !navigator.share;
  if (changed) {
    feedbackTime = 0;
    document.getElementById('feedbackForm').reset();
    document.getElementById('feedbackForm').hidden = true;
    document.querySelector('[data-action="feedback-toggle"]').setAttribute('aria-expanded', 'false');
    document.getElementById('feedbackTime').textContent = '0:00';
    document.getElementById('feedbackStatus').textContent = '';
  }
  loadFeedback();
}
function captureFeedbackTime() {
  feedbackTime = clampTime(audio.currentTime, audio.duration);
  document.getElementById('feedbackTime').textContent = fmt(feedbackTime);
}
function toggleFeedbackForm() {
  const form = document.getElementById('feedbackForm');
  form.hidden = !form.hidden;
  document.querySelector('[data-action="feedback-toggle"]').setAttribute('aria-expanded', String(!form.hidden));
  if (!form.hidden) { captureFeedbackTime(); document.getElementById('feedbackComment').focus(); }
}
async function loadFeedback() {
  if (!current) return;
  if (feedbackController) feedbackController.abort();
  const controller = new AbortController();
  feedbackController = controller;
  const id = current.id;
  const list = document.getElementById('feedbackList');
  list.innerHTML = '<p class="feedback-empty">Opening the listening notes...</p>';
  try {
    const result = await requestJson('/api/feedback?entryId=' + encodeURIComponent(id), undefined, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
    if (current?.id !== id) return;
    list.innerHTML = result.feedback.length ? result.feedback.map(note => feedbackMarkup(note, id)).join('') : '<p class="feedback-empty">No listening notes yet. Yours could be the first.</p>';
  } catch (error) {
    if (!controller.signal.aborted && current?.id === id) list.innerHTML = '<p class="feedback-help">Listening notes could not load. <button class="utility-btn" data-action="retry-feedback">Try again</button></p>';
  }
}
function feedbackMarkup(note, entryId) {
  return '<article class="feedback-note"><div class="feedback-note-header"><strong>' + escapeHtml(note.name) + '</strong>' +
    '<button class="timestamp-link" type="button" data-action="seek-feedback" data-id="' + escapeHtml(entryId) + '" data-time="' + Number(note.timestamp_seconds) + '" aria-label="Jump to ' + fmt(note.timestamp_seconds) + '">' + fmt(note.timestamp_seconds) + '</button></div><p>' + escapeHtml(note.comment) + '</p></article>';
}
async function submitFeedback(event) {
  event.preventDefault();
  if (!current || !event.target.reportValidity()) return;
  const id = current.id;
  const button = document.getElementById('feedbackSubmit'), status = document.getElementById('feedbackStatus');
  if (button.disabled) return;
  button.disabled = true;
  status.textContent = 'Sending your note...';
  const comment = document.getElementById('feedbackComment').value.trim();
  try {
    await requestJson('/api/feedback', { entry_id: id, timestamp_seconds: feedbackTime, name: document.getElementById('feedbackName').value.trim(), comment });
    if (current?.id !== id) return;
    status.textContent = 'Thank you! Your note is waiting for approval and is not public yet.';
    document.getElementById('feedbackComment').value = '';
    toast('Listening note sent for approval.');
    if (isAdmin) loadModeration();
  } catch (error) {
    if (current?.id === id) status.textContent = friendlyError(error) + ' Your note has been kept.';
  } finally { button.disabled = false; }
}

async function loadModeration() {
  if (!isAdmin) return;
  const list = document.getElementById('moderationList');
  list.innerHTML = '<p class="feedback-help">Opening the review queue...</p>';
  try {
    const result = await requestJson('/api/admin-feedback');
    if (!isAdmin) return;
    list.innerHTML = result.feedback.length ? result.feedback.map(note => '<article class="feedback-note" data-note-id="' + escapeHtml(note.id) + '"><div class="feedback-note-header"><strong>' + escapeHtml(note.title) + '</strong><span class="moderation-status">' + (note.status === 'pending' ? 'Awaiting approval' : 'Published') + '</span></div><div class="feedback-note-header"><span>' + escapeHtml(note.name) + '</span><button class="timestamp-link" data-action="seek-feedback" data-id="' + escapeHtml(note.entry_id) + '" data-time="' + Number(note.timestamp_seconds) + '">' + fmt(note.timestamp_seconds) + '</button></div><p>' + escapeHtml(note.comment) + '</p><div class="moderation-actions">' + (note.status === 'pending' ? '<button class="utility-btn" data-action="moderate" data-id="' + escapeHtml(note.id) + '" data-mode="approve">Approve</button>' : '') + '<button class="admin-entry-btn danger" data-action="moderate" data-id="' + escapeHtml(note.id) + '" data-mode="delete">' + (note.status === 'pending' ? 'Reject' : 'Remove') + '</button></div></article>').join('') : '<p class="feedback-empty">All quiet here. New listening notes will arrive in this space.</p>';
  } catch (error) {
    if (error.status === 401) handleAdminUnauthorized();
    list.innerHTML = '<p class="feedback-help">Could not open the review queue. Use Refresh to try again.</p>';
  }
}
async function moderateFeedback(button) {
  const card = button.closest('.feedback-note');
  if (button.dataset.mode === 'delete' && !window.confirm('Remove this listening note? This cannot be undone.')) return;
  card.querySelectorAll('button').forEach(el => { el.disabled = true; });
  try {
    await requestJson('/api/admin-feedback', { id: button.dataset.id, action: button.dataset.mode });
    toast(button.dataset.mode === 'approve' ? 'Listening note approved.' : 'Listening note removed.');
    await loadModeration();
    loadFeedback();
  } catch (error) {
    if (error.status === 401) handleAdminUnauthorized();
    toast(friendlyError(error));
    card.querySelectorAll('button').forEach(el => { el.disabled = false; });
  }
}
function jumpToFeedback(entryId, seconds) {
  const entry = entries.find(item => item.id === entryId);
  if (!entry) return;
  const ready = current?.id === entryId && Number.isFinite(audio.duration);
  if (!ready) audio.addEventListener('loadedmetadata', () => { if (current?.id === entryId) seekTo(seconds); }, { once: true });
  loadEntry(entry, false);
  if (ready) seekTo(seconds);
  document.getElementById('waveformSeek').focus();
}

function openDialog(id) {
  dialogOpener = document.activeElement;
  activeDialog = document.getElementById(id);
  activeDialog.hidden = false;
  activeDialog.classList.add('open');
  document.querySelector('header').inert = true;
  document.querySelector('.page-wrap').inert = true;
  document.querySelector('footer').inert = true;
  document.body.style.overflow = 'hidden';
  const target = activeDialog.querySelector('button:not([disabled])') || activeDialog.querySelector('[role="dialog"]');
  target.focus();
}
function closeDialog(id) {
  const dialog = document.getElementById(id);
  dialog.classList.remove('open');
  dialog.hidden = true;
  document.querySelector('header').inert = false;
  document.querySelector('.page-wrap').inert = false;
  document.querySelector('footer').inert = false;
  document.body.style.overflow = '';
  if (activeDialog === dialog) activeDialog = null;
  if (dialogOpener?.isConnected && !dialogOpener.closest('[hidden]')) dialogOpener.focus();
}
async function logout() {
  if (saving) { toast('Please wait for the save to finish.'); return; }
  try {
    await requestJson(ADMIN_LOGOUT_URL, {});
    setAdminMode(false);
    document.getElementById('moderationList').innerHTML = '';
    showView('archive');
    toast('Logged out.');
  } catch (error) { toast(friendlyError(error)); }
}

// One action dispatcher handles static controls and server-rendered library rows.
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  const actions = {
    library: () => { showView('archive'); document.getElementById('songbook').scrollIntoView({ behavior: 'smooth' }); },
    admin: openAdminArea, logout, play: togglePlay, rewind: rewind15, forward: skipFwd,
    loop: toggleLoop, lyrics: openModal, mute: toggleMute, speed: () => setSpeed(Number(button.dataset.rate)),
    'cancel-edit': cancelEdit, 'close-lyrics': closeModal, 'cancel-delete': closeDeleteModal,
    'advance-delete': advanceDelete, delete: executeDelete, retry: loadEntries,
    'edit-entry': () => beginEditEntry(button.dataset.id),
    'delete-entry': () => { const entry = entries.find(item => item.id === button.dataset.id); if (entry) openDeleteModal(entry.id, entry.title, event); },
    'select-song': () => {
      if (current?.id !== button.dataset.id && document.getElementById('feedbackComment').value.trim() && !window.confirm('Switch songs and discard your unsent listening note?')) return;
      loadEntry(entries.find(item => item.id === button.dataset.id));
    },
    'copy-link': () => shareSong(), share: () => shareSong(true),
    'feedback-toggle': toggleFeedbackForm, 'feedback-time': captureFeedbackTime,
    'retry-feedback': loadFeedback, 'refresh-feedback': loadModeration,
    'seek-feedback': () => jumpToFeedback(button.dataset.id, Number(button.dataset.time)),
    moderate: () => moderateFeedback(button)
  };
  if (actions[action]) actions[action]();
});
document.getElementById('volumeSlider').addEventListener('input', event => setVolume(event.target.value));
document.getElementById('songSearch').addEventListener('input', renderGrid);
document.getElementById('uAudio').addEventListener('change', event => onAudioSelected(event.target.files[0]));
document.getElementById('loginForm').addEventListener('submit', event => { event.preventDefault(); checkGate(); });
document.getElementById('uploadForm').addEventListener('submit', event => { event.preventDefault(); handleUpload(); });
document.getElementById('feedbackForm').addEventListener('submit', submitFeedback);
document.getElementById('modalBg').addEventListener('click', closeModalBg);
document.getElementById('delModalBg').addEventListener('click', event => { if (event.target.id === 'delModalBg') closeDeleteModal(); });
const seekControl = document.getElementById('waveformSeek');
seekControl.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  seekControl.setPointerCapture(event.pointerId);
  seekFromWaveform(event);
});
seekControl.addEventListener('pointermove', event => { if (seekControl.hasPointerCapture(event.pointerId)) seekFromWaveform(event); });
seekControl.addEventListener('pointerup', event => { if (seekControl.hasPointerCapture(event.pointerId)) seekControl.releasePointerCapture(event.pointerId); });
seekControl.addEventListener('keydown', event => {
  const positions = { ArrowRight: audio.currentTime + 5, ArrowLeft: audio.currentTime - 5, Home: 0, End: audio.duration };
  if (event.key in positions) { event.preventDefault(); seekTo(positions[event.key]); }
});
document.addEventListener('keydown', event => {
  if (activeDialog) {
    if (event.key === 'Escape') { event.preventDefault(); activeDialog.id === 'modalBg' ? closeModal() : closeDeleteModal(); }
    if (event.key === 'Tab') {
      const focusable = [...activeDialog.querySelectorAll('button:not([disabled]), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  } else if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"][data-action]')) {
    event.preventDefault(); event.target.click();
  }
});
window.addEventListener('popstate', () => {
  const id = new URL(location.href).searchParams.get('song');
  const entry = entries.find(item => item.id === id) || entries[0];
  if (entry) { loadEntry(entry, false, false); showView('archive'); }
});
window.addEventListener('beforeunload', event => {
  const dirty = saving || document.getElementById('feedbackComment').value.trim() || document.getElementById('uTitle').value.trim();
  if (dirty) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('error', event => { if (event.target.matches?.('.a-art')) event.target.hidden = true; }, true);
syncPlaybackUI();
