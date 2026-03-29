// ═══════════════════════════════════════════════════════════════════════
// firebase.js — Firebase Realtime Database engine
// Зависит от: config.js (FIREBASE_CONFIG)
// ═══════════════════════════════════════════════════════════════════════

const FB_BASE = FIREBASE_CONFIG.databaseURL;

// ── REST helpers ─────────────────────────────────────────────────────────────

async function fbGet(path) {
  try {
    const r = await fetch(`${FB_BASE}/${path}.json`);
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

async function fbSet(path, value) {
  try {
    await fetch(`${FB_BASE}/${path}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  } catch(e) {}
}

// ── SSE listener (Firebase streaming) ────────────────────────────────────────
// Используется только для пати — мгновенная реакция

function fbListen(path, onPut) {
  const es = new EventSource(`${FB_BASE}/${path}.json`);
  es.addEventListener('put', e => {
    try { const d = JSON.parse(e.data); onPut(d.data); } catch(_) {}
  });
  es.onerror = () => {}; // auto-reconnects
  return es;
}

// ═══════════════════════════════════════════════════════════════════════
// PARTY — SSE (мгновенно)
// ═══════════════════════════════════════════════════════════════════════

let _partyEs = null;
let _inParty = false;

function initPartyListener(uuid) {
  if (_partyEs) { _partyEs.close(); _partyEs = null; }
  _partyEs = fbListen(`party/${uuid}`, data => {
    if (data === true && !_inParty) {
      _inParty = true;
      showFbNotification('Вы добавлены в пати! 🎲', 'party');
    } else if (data === null && _inParty) {
      _inParty = false;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// LOGS — polling каждые 5 секунд (надёжно, работает даже после офлайна)
// ═══════════════════════════════════════════════════════════════════════

// Ключ в localStorage: какие логи уже обработаны
function _getProcessedKey(uuid) { return 'froyskyy_processed_logs_' + uuid; }

function _getProcessed(uuid) {
  try { return new Set(JSON.parse(localStorage.getItem(_getProcessedKey(uuid))) || []); }
  catch(_) { return new Set(); }
}

function _saveProcessed(uuid, set) {
  try { localStorage.setItem(_getProcessedKey(uuid), JSON.stringify([...set])); } catch(_) {}
}

let _logsInterval = null;

function initLogsPoller(uuid) {
  if (_logsInterval) clearInterval(_logsInterval);
  // Сразу проверяем при старте — обрабатываем всё что пришло пока были офлайн
  pollLogs(uuid);
  _logsInterval = setInterval(() => pollLogs(uuid), 5000);
}

async function pollLogs(uuid) {
  const all = await fbGet('logs');
  if (!all || typeof all !== 'object') return;

  const processed = _getProcessed(uuid);
  let changed = false;

  Object.entries(all).forEach(([key, log]) => {
    if (!log) return;
    if (log.uuid !== uuid) return;
    if (log.confirmed !== true) return;
    if (processed.has(key)) return;

    processed.add(key);
    changed = true;
    processLogEntry(log);
  });

  if (changed) _saveProcessed(uuid, processed);
}

function processLogEntry(log) {
  if (log.type === 'item')    handleItemGrant(log.payload);
  if (log.type === 'reagent') handleReagentGrant(log.payload);
}

// ── Предметы ─────────────────────────────────────────────────────────────────
// payload: "Название|количество"

function handleItemGrant(payload) {
  if (!payload) return;
  const parts = payload.split('|');
  const name  = (parts[0] || '').trim();
  const qty   = parseInt(parts[1]) || 1;
  if (!name) return;

  showFbNotification(`ДМ передаёт вам:\n${qty > 1 ? name + ' ×' + qty : name}`, 'item');

  if (typeof addEquip === 'function') {
    addEquip({ name, desc: qty > 1 ? '×' + qty : '' });
    if (typeof scheduleSave === 'function') scheduleSave();
  }
}

// ── Реагенты ─────────────────────────────────────────────────────────────────
// payload: "red:3,blue:1,green:0,yellow:2"

const REAGENT_NAMES = { red:'Красный', blue:'Синий', green:'Зелёный', yellow:'Жёлтый' };

function handleReagentGrant(payload) {
  if (!payload) return;
  const delta = {};
  payload.split(',').forEach(pair => {
    const [c, v] = pair.trim().split(':');
    const n = parseInt(v);
    if (c && !isNaN(n) && n !== 0) delta[c.trim()] = n;
  });
  if (!Object.keys(delta).length) return;

  if (typeof applyReagentDelta === 'function') {
    applyReagentDelta(delta);
    if (typeof scheduleSave === 'function') scheduleSave();
  }

  const lines = Object.entries(delta)
    .map(([c, v]) => `${REAGENT_NAMES[c] || c}: ${v > 0 ? '+' : ''}${v}`)
    .join('\n');
  showFbNotification(`ДМ передаёт реагенты:\n${lines}`, 'reagent');
}

// ═══════════════════════════════════════════════════════════════════════
// PARTY PANEL — показывает всех участников пати
// ═══════════════════════════════════════════════════════════════════════

let _partyPollInterval = null;

function initPartyPanel(myUuid) {
  if (_partyPollInterval) clearInterval(_partyPollInterval);
  refreshPartyPanel(myUuid);
  _partyPollInterval = setInterval(() => refreshPartyPanel(myUuid), 10000);
}

async function refreshPartyPanel(myUuid) {
  const panel = document.getElementById('party-members');
  if (!panel) return;

  // 1. Получить список UUID из /party
  const partyData = await fbGet('party');
  if (!partyData || typeof partyData !== 'object') {
    panel.innerHTML = '<div class="party-empty">Вы не в пати</div>';
    return;
  }

  const uuids = Object.keys(partyData).filter(k => partyData[k] === true);
  if (!uuids.length) {
    panel.innerHTML = '<div class="party-empty">Вы не в пати</div>';
    return;
  }

  // 2. Получить данные каждого участника из /chars/{uuid}
  const members = await Promise.all(uuids.map(async uid => {
    const data = await fbGet(`chars/${uid}`);
    return { uuid: uid, ...data };
  }));

  // 3. Рендер
  panel.innerHTML = '';
  members.forEach(m => {
    const isMe = m.uuid === myUuid;
    const name = m.charName || 'Маг';
    const player = m.playerName || '';
    const barrierCur = m.hpFill?.['barrier-boxes'] ?? '?';
    const barrierMax = m.barrierMax ?? '?';
    const lifeCur    = m.hpFill?.['life-boxes']    ?? '?';
    const lifeMax    = m.lifeMax    ?? '?';
    const adj        = Array.isArray(m.adjActive) ? m.adjActive : [];
    const buildName  = m.buildName || '';

    const ADJ_COLORS_LOCAL = {
      natisk:'#c9a84c', obman:'#e8934c', pokoj:'#9b7fe8',
      istsel:'#7ecba1', gospod:'#e05c5c', stoikost:'#6ab0f5',
    };
    const ADJ_NAMES_LOCAL = {
      natisk:'Натиск', obman:'Обман', pokoj:'Покой',
      istsel:'Исцеление', gospod:'Господство', stoikost:'Стойкость',
    };

    const branchTags = adj.map(id => {
      const col = ADJ_COLORS_LOCAL[id] || '#c9a84c';
      return `<span style="font-family:'Cinzel',serif;font-size:7px;letter-spacing:1px;padding:1px 6px;border-radius:8px;border:1px solid ${col}44;color:${col};background:${col}0d;">${ADJ_NAMES_LOCAL[id]||id}</span>`;
    }).join('');

    const card = document.createElement('div');
    card.className = 'party-card' + (isMe ? ' party-me' : '');
    card.innerHTML = `
      <div class="party-card-name">${escHtml(name)}${isMe ? ' <span style="font-size:8px;color:var(--accent2);font-family:Cinzel,serif;letter-spacing:1px;">(вы)</span>' : ''}</div>
      ${player ? `<div class="party-card-player">${escHtml(player)}</div>` : ''}
      <div class="party-card-stats">
        <div class="party-stat barrier">
          <span class="party-stat-label">Барьер</span>
          <span class="party-stat-val">${barrierCur}/${barrierMax}</span>
        </div>
        <div class="party-stat life">
          <span class="party-stat-label">Жизнь</span>
          <span class="party-stat-val">${lifeCur}/${lifeMax}</span>
        </div>
      </div>
      ${branchTags ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">${branchTags}</div>` : ''}
      ${buildName ? `<div style="font-family:'Cinzel',serif;font-size:8px;color:var(--gold);margin-top:4px;">✦ ${escHtml(buildName)}</div>` : ''}
    `;
    panel.appendChild(card);
  });
}

// ── Публикация своих данных в Firebase ────────────────────────────────────────
// Вызывается из character.html при каждом сохранении (throttled)

let _publishTimer = null;
function schedulePublish(uuid, stateGetter) {
  clearTimeout(_publishTimer);
  _publishTimer = setTimeout(() => publishState(uuid, stateGetter()), 3000);
}

async function publishState(uuid, state) {
  if (!uuid || !state) return;
  // Публикуем только нужные поля — не весь state
  await fbSet(`chars/${uuid}`, {
    charName:    state.charName    || '',
    playerName:  state.playerName  || '',
    barrierMax:  state.barrierMax  || '',
    lifeMax:     state.lifeMax     || '',
    hpFill:      state.hpFill      || {},
    adjActive:   state.adjActive   || [],
    buildName:   state.buildName   || '',
  });
}

// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════

const FB_ICONS  = { party:'🎲', item:'🎁', reagent:'⚗️', warn:'⚠️', info:'✦' };
const FB_COLORS = { party:'#4cbb8a', item:'#c9a84c', reagent:'#a67fd1', warn:'#e05c5c', info:'#6ab0f5' };

function showFbNotification(message, type = 'info') {
  let container = document.getElementById('fb-notifications');
  if (!container) {
    container = document.createElement('div');
    container.id = 'fb-notifications';
    container.style.cssText = 'position:fixed;top:20px;right:20px;display:flex;flex-direction:column;gap:10px;z-index:9999;pointer-events:none;max-width:300px;';
    document.body.appendChild(container);
  }

  const color = FB_COLORS[type] || FB_COLORS.info;
  const icon  = FB_ICONS[type]  || FB_ICONS.info;

  const notif = document.createElement('div');
  notif.style.cssText = `background:#1a1a35;border:1px solid ${color};border-left:4px solid ${color};border-radius:8px;padding:12px 14px;font-family:'Crimson Pro',Georgia,serif;font-size:13px;color:#e8e0f0;line-height:1.5;pointer-events:auto;box-shadow:0 4px 20px rgba(0,0,0,.5);opacity:0;transform:translateX(20px);transition:all .3s ease;white-space:pre-line;`;

  notif.innerHTML = `<div style="display:flex;align-items:flex-start;gap:8px;">
    <span style="font-size:18px;flex-shrink:0;">${icon}</span>
    <div style="flex:1;">
      <div style="font-family:'Cinzel',serif;font-size:8px;letter-spacing:2px;color:${color};margin-bottom:4px;text-transform:uppercase;">${type}</div>
      <div>${message.replace(/\n/g,'<br>')}</div>
    </div>
    <button onclick="this.closest('div').parentElement.remove()" style="background:none;border:none;color:#665f88;font-size:18px;cursor:pointer;line-height:1;padding:0;flex-shrink:0;">×</button>
  </div>`;

  container.appendChild(notif);
  requestAnimationFrame(() => { notif.style.opacity='1'; notif.style.transform='translateX(0)'; });
  setTimeout(() => { notif.style.opacity='0'; notif.style.transform='translateX(20px)'; setTimeout(()=>notif.remove(),300); }, 8000);
}

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════

function initFirebase(uuid) {
  if (!uuid) return;
  initPartyListener(uuid);   // SSE — мгновенно
  initLogsPoller(uuid);      // polling 5s — надёжно + офлайн-recovery
  initPartyPanel(uuid);      // polling 10s — панель пати
}
