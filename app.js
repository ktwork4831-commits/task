const STORAGE_KEY = 'today-task-v3';
const OLD_STORAGE_KEY = 'today-task-v2';

const dateKey = date => {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const todayKey = () => dateKey(new Date());
const shiftedDate = days => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
};

const seed = [
  { title: '朝のルーティン', time: '07:00', planned: 30, repeat: true },
  { title: 'メールを確認する', time: '09:00', planned: 30, repeat: true },
  { title: '企画書を作成する', time: '10:00', planned: 90, repeat: false },
  { title: 'ランチ休憩', time: '12:00', planned: 60, repeat: true },
  { title: '集中して作業する', time: '13:00', planned: 120, repeat: false },
  { title: '今日の振り返り', time: '18:00', planned: 15, repeat: true }
];

const CLOCK_COLORS = ['#e56f51','#5f8c74','#c68a3b','#6b7fd7','#9c6ade','#5ea3a3','#d96d83','#8c7a64'];
const $ = id => document.getElementById(id);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const minutes = seconds => Math.max(0, Math.round(seconds / 60));
const durationText = value => value >= 60 ? `${Math.floor(value / 60)}時間${value % 60 ? ` ${value % 60}分` : ''}` : `${value}分`;
const actualText = seconds => seconds < 60 ? `${seconds}秒` : durationText(minutes(seconds));
const signedMinutes = value => value === 0 ? '±0分' : `${value > 0 ? '+' : '−'}${durationText(Math.abs(value))}`;
const clock = d => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const elapsed = task => (task.actual || 0) + (task.status === 'running' && task.started ? Math.floor((Date.now() - task.started) / 1000) : 0);
const makeTask = data => ({
  id: uid(),
  title: data.title,
  time: data.time || '09:00',
  planned: Number(data.planned) || 30,
  repeat: !!data.repeat,
  status: 'pending',
  started: null,
  actual: 0,
  completedAt: null
});

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.tasks) return { ...saved, history: Array.isArray(saved.history) ? saved.history : [] };
    const old = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if (old?.tasks) return { ...old, history: [] };
  } catch (_) {}
  return { date: todayKey(), tasks: seed.map(makeTask), history: [] };
}

let state = load();
if (state.date !== todayKey()) {
  state = {
    date: todayKey(),
    history: state.history || [],
    tasks: state.tasks.filter(t => t.repeat).map(t => ({ ...t, id: uid(), status: 'pending', started: null, actual: 0, completedAt: null }))
  };
}

let runningId = state.tasks.find(t => t.status === 'running')?.id || null;
let editingId = null;
let lastDeleted = null;
let undoTimer = null;
let reviewPeriod = 'yesterday';

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const tasks = () => [...state.tasks].sort((a, b) => a.time.localeCompare(b.time));
const find = id => state.tasks.find(t => t.id === id);
const historyDateKey = item => item.date || dateKey(new Date(item.completedAt));

function showUndo(message, deleted) {
  lastDeleted = deleted;
  $('undoText').textContent = message;
  $('undoToast').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    $('undoToast').hidden = true;
    lastDeleted = null;
  }, 5000);
}

function addHistory(task) {
  if (!task || !task.actual || task.historySaved) return;
  state.history.unshift({
    id: uid(),
    taskId: task.id,
    title: task.title,
    date: state.date,
    planned: task.planned,
    actual: task.actual,
    completedAt: task.completedAt || Date.now()
  });
  state.history = state.history.slice(0, 100);
  task.historySaved = true;
}

function reviewItems() {
  const history = state.history || [];
  if (reviewPeriod === 'today') {
    const key = todayKey();
    return history.filter(item => historyDateKey(item) === key);
  }
  if (reviewPeriod === 'yesterday') {
    const key = dateKey(shiftedDate(-1));
    return history.filter(item => historyDateKey(item) === key);
  }
  const start = shiftedDate(-6);
  const end = shiftedDate(1);
  return history.filter(item => {
    const completed = new Date(item.completedAt);
    return completed >= start && completed < end;
  });
}

function polarPoint(radius, minuteValue) {
  const angle = minuteValue / 1440 * Math.PI * 2 - Math.PI / 2;
  return { x: 130 + Math.cos(angle) * radius, y: 130 + Math.sin(angle) * radius };
}

function arcPath(startMinute, endMinute) {
  const start = polarPoint(92, startMinute);
  const end = polarPoint(92, endMinute);
  const span = endMinute - startMinute;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A 92 92 0 ${span > 720 ? 1 : 0} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function renderClockTicks() {
  const target = $('clockTicks');
  if (!target || target.childElementCount) return;
  target.innerHTML = Array.from({ length: 24 }, (_, hour) => {
    const outer = polarPoint(104, hour * 60);
    const inner = polarPoint(hour % 6 === 0 ? 96 : 99, hour * 60);
    return `<line class="clock-tick ${hour % 6 === 0 ? 'major' : ''}" x1="${inner.x.toFixed(2)}" y1="${inner.y.toFixed(2)}" x2="${outer.x.toFixed(2)}" y2="${outer.y.toFixed(2)}"></line>`;
  }).join('');
}

function renderClock(items) {
  renderClockTicks();
  const segmentTarget = $('clockSegments');
  const legendTarget = $('clockLegend');
  const center = $('clockCenterValue');
  const count = $('clockItemCount');
  if (!segmentTarget || !legendTarget || !center || !count) return;

  const sorted = [...items].sort((a, b) => Number(a.completedAt) - Number(b.completedAt)).slice(-8);
  center.textContent = durationText(minutes(sorted.reduce((sum, item) => sum + Number(item.actual || 0), 0)));
  count.textContent = sorted.length ? `${sorted.length}件を表示` : '記録なし';

  if (!sorted.length) {
    segmentTarget.innerHTML = '';
    legendTarget.innerHTML = '<div class="clock-legend-meta">実績がたまると、作業した時間帯がここに表示されます。</div>';
    return;
  }

  segmentTarget.innerHTML = sorted.map((item, index) => {
    const completed = new Date(item.completedAt);
    const endMinute = completed.getHours() * 60 + completed.getMinutes() + completed.getSeconds() / 60;
    const duration = Math.max(1, Math.min(1439, Number(item.actual || 0) / 60));
    let startMinute = endMinute - duration;
    const color = CLOCK_COLORS[index % CLOCK_COLORS.length];
    if (startMinute < 0) {
      return `<path class="clock-segment" stroke="${color}" d="${arcPath(0, endMinute)}"></path><path class="clock-segment" stroke="${color}" d="${arcPath(1440 + startMinute, 1439.9)}"></path>`;
    }
    return `<path class="clock-segment" stroke="${color}" d="${arcPath(startMinute, endMinute)}"></path>`;
  }).join('');

  legendTarget.innerHTML = sorted.map((item, index) => {
    const completed = new Date(item.completedAt);
    const endMinute = completed.getHours() * 60 + completed.getMinutes();
    const duration = Math.max(1, minutes(item.actual || 0));
    const startMinute = (endMinute - duration + 1440) % 1440;
    const label = value => `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`;
    return `<div class="clock-legend-item">
      <span class="clock-dot" style="background:${CLOCK_COLORS[index % CLOCK_COLORS.length]}"></span>
      <div class="clock-legend-main"><div class="clock-legend-title">${escapeHtml(item.title)}</div><div class="clock-legend-meta">${label(startMinute)}〜${label(endMinute)}</div></div>
      <span class="clock-legend-time">${actualText(item.actual)}</span>
    </div>`;
  }).join('');
}

function renderReview() {
  const items = reviewItems();
  const plannedMinutes = items.reduce((sum, item) => sum + Number(item.planned || 0), 0);
  const actualSeconds = items.reduce((sum, item) => sum + Number(item.actual || 0), 0);
  const actualMinutes = minutes(actualSeconds);
  const difference = actualMinutes - plannedMinutes;

  $('reviewCount').textContent = `${items.length}件`;
  $('reviewActual').textContent = durationText(actualMinutes);
  $('reviewDifference').textContent = signedMinutes(difference);
  $('reviewDifference').className = difference > 0 ? 'over' : difference < 0 ? 'under' : '';
  $('reviewEmpty').hidden = items.length > 0;

  const labels = {
    today: new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }),
    yesterday: shiftedDate(-1).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }),
    week: `${shiftedDate(-6).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}〜${new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}`
  };
  $('reviewDateLabel').textContent = labels[reviewPeriod];

  document.querySelectorAll('[data-review-period]').forEach(button => {
    const active = button.dataset.reviewPeriod === reviewPeriod;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  renderClock(items);

  $('reviewList').innerHTML = items.map(item => {
    const itemActualMinutes = minutes(item.actual || 0);
    const itemDifference = itemActualMinutes - Number(item.planned || 0);
    const completed = new Date(item.completedAt);
    return `<article class="review-row">
      <div class="review-main"><div class="review-title">${escapeHtml(item.title)}</div><div class="review-meta">${completed.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${clock(completed)} ・ 予定 ${durationText(item.planned)}</div></div>
      <div class="review-result"><div class="review-actual">${actualText(item.actual)}</div><div class="review-diff ${itemDifference > 0 ? 'over' : itemDifference < 0 ? 'under' : ''}">${signedMinutes(itemDifference)}</div></div>
    </article>`;
  }).join('');
}

function render() {
  const list = tasks();
  const running = runningId ? find(runningId) : null;
  const done = state.tasks.filter(t => t.status === 'completed').length;
  const total = state.tasks.length;
  const percent = total ? Math.round(done / total * 100) : 0;

  $('todayLabel').textContent = new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  $('progressText').textContent = `${percent}%`;
  $('progressBar').style.width = `${percent}%`;
  $('completedCount').textContent = `${done} / ${total} 完了`;
  $('remainingTime').textContent = `残り ${durationText(minutes(state.tasks.filter(t => t.status !== 'completed').reduce((sum, t) => sum + Math.max(0, t.planned * 60 - elapsed(t)), 0)))}`;
  $('taskCount').textContent = `${total}件`;
  $('currentTitle').textContent = running?.title || '';
  $('currentMeta').textContent = running ? `開始 ${clock(new Date(running.started))} ・ 予定 ${durationText(running.planned)}` : '';
  $('liveTimer').textContent = running ? formatTimer(elapsed(running)) : '00:00';
  $('currentAction').disabled = !running;
  $('emptyState').hidden = list.length > 0;

  $('taskList').innerHTML = list.map(task => `
    <article class="task-row ${task.status}" data-id="${task.id}">
      <button class="task-status" data-action="toggle" type="button" aria-label="${task.status === 'completed' ? '未完了に戻す' : '完了にする'}">${task.status === 'completed' ? '✓' : task.status === 'running' ? '●' : ''}</button>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">${task.time} ・ 予定 ${durationText(task.planned)}${task.repeat ? ' ・ 毎日' : ''}</div>
        ${task.actual ? `<div class="task-actual">実績 ${actualText(elapsed(task))}</div>` : ''}
        <div class="task-tools"><button class="tool-button edit-button" data-action="edit" type="button">編集</button><button class="tool-button delete-button" data-action="delete" type="button">削除</button></div>
        <button class="run-button" data-action="start" type="button">${task.status === 'running' ? '完了する' : '開始する'}</button>
      </div>
    </article>`).join('');

  renderReview();

  const history = state.history || [];
  $('historyCount').textContent = `${history.length}件`;
  $('historyEmpty').hidden = history.length > 0;
  $('clearHistoryButton').hidden = history.length === 0;
  $('historyList').innerHTML = history.map(item => {
    const date = new Date(item.completedAt);
    return `<article class="history-row" data-history-id="${item.id}">
      <div class="history-main"><div class="history-title">${escapeHtml(item.title)}</div><div class="history-meta">${date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${clock(date)} ・ 予定 ${durationText(item.planned)}</div></div>
      <div class="history-side"><div class="history-time">${actualText(item.actual)}</div><button class="history-delete-button" data-action="delete-history" type="button" aria-label="この実績を削除">削除</button></div>
    </article>`;
  }).join('');

  save();
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function start(id) {
  const task = find(id);
  if (!task || task.status === 'completed') return;
  if (runningId && runningId !== id) finish(runningId);
  task.status = 'running';
  task.started = Date.now();
  runningId = id;
  render();
}

function finish(id) {
  const task = find(id);
  if (!task || task.status !== 'running') return;
  task.actual = elapsed(task);
  task.status = 'completed';
  task.completedAt = Date.now();
  task.started = null;
  runningId = null;
  addHistory(task);
  render();
}

function toggleComplete(task) {
  if (!task) return;
  if (task.status === 'running') return finish(task.id);
  if (task.status === 'completed') task.status = 'pending';
  else { task.status = 'completed'; task.completedAt = Date.now(); }
  render();
}

function openEdit(task) {
  if (!task) return;
  editingId = task.id;
  $('editTitle').value = task.title;
  $('editTime').value = task.time;
  $('editDuration').value = task.planned;
  $('editRepeat').checked = task.repeat;
  $('editDialog').showModal();
}

function remove(task) {
  if (!task) return;
  const index = state.tasks.findIndex(t => t.id === task.id);
  state.tasks.splice(index, 1);
  if (runningId === task.id) runningId = null;
  showUndo(`「${task.title}」を削除しました`, { type: 'task', item: { ...task }, index });
  render();
}

function removeHistory(id) {
  const index = state.history.findIndex(item => item.id === id);
  if (index < 0) return;
  const [item] = state.history.splice(index, 1);
  showUndo(`「${item.title}」の実績を削除しました`, { type: 'history', item: { ...item }, index });
  render();
}

$('taskList').addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  const task = find(button.closest('.task-row')?.dataset.id);
  const action = button.dataset.action;
  if (action === 'start') task?.status === 'running' ? finish(task.id) : start(task?.id);
  if (action === 'toggle') toggleComplete(task);
  if (action === 'edit') openEdit(task);
  if (action === 'delete') remove(task);
});

$('historyList').addEventListener('click', e => {
  const button = e.target.closest('[data-action="delete-history"]');
  if (!button) return;
  removeHistory(button.closest('.history-row')?.dataset.historyId);
});

document.querySelectorAll('[data-review-period]').forEach(button => {
  button.addEventListener('click', () => {
    reviewPeriod = button.dataset.reviewPeriod;
    renderReview();
  });
});

$('clearHistoryButton').addEventListener('click', () => {
  if (!state.history.length) return;
  if (!confirm('実績記録をすべて削除しますか？')) return;
  state.history = [];
  render();
});

$('editForm').addEventListener('submit', e => {
  e.preventDefault();
  const task = find(editingId);
  const title = $('editTitle').value.trim();
  const planned = Number($('editDuration').value);
  if (!task || !title || !Number.isFinite(planned) || planned <= 0) return;
  task.title = title;
  task.time = $('editTime').value || '09:00';
  task.planned = planned;
  task.repeat = $('editRepeat').checked;
  $('editDialog').close();
  editingId = null;
  render();
});

$('undoButton').addEventListener('click', () => {
  if (!lastDeleted) return;
  if (lastDeleted.type === 'task') state.tasks.splice(lastDeleted.index, 0, lastDeleted.item);
  if (lastDeleted.type === 'history') state.history.splice(lastDeleted.index, 0, lastDeleted.item);
  lastDeleted = null;
  $('undoToast').hidden = true;
  clearTimeout(undoTimer);
  render();
});

document.querySelectorAll('[data-close-dialog]').forEach(button => {
  button.addEventListener('click', () => {
    const dialog = $(button.dataset.closeDialog);
    if (dialog?.open) dialog.close('cancel');
  });
});

$('currentAction').addEventListener('click', () => runningId && finish(runningId));
$('openAdd').addEventListener('click', () => $('addDialog').showModal());
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('taskTitle').value.trim();
  if (!title) return;
  state.tasks.push(makeTask({ title, time: $('taskTime').value, planned: $('taskDuration').value, repeat: $('taskRepeat').checked }));
  $('addDialog').close();
  e.target.reset();
  $('taskTime').value = '09:00';
  $('taskDuration').value = '30';
  render();
});

$('resetButton').addEventListener('click', () => {
  if (!confirm('今日の進捗をリセットしますか？ 実績記録は残ります。')) return;
  state.tasks.forEach(t => {
    t.status = 'pending';
    t.started = null;
    t.actual = 0;
    t.completedAt = null;
    t.historySaved = false;
  });
  runningId = null;
  render();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
if ('caches' in window) caches.keys().then(keys => keys.forEach(key => caches.delete(key)));

setInterval(render, 1000);
render();