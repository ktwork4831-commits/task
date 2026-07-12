const STORAGE_KEY = 'today-task-v3';
const OLD_STORAGE_KEY = 'today-task-v2';

const todayKey = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const seed = [
  { title: '朝のルーティン', time: '07:00', planned: 30, repeat: true },
  { title: 'メールを確認する', time: '09:00', planned: 30, repeat: true },
  { title: '企画書を作成する', time: '10:00', planned: 90, repeat: false },
  { title: 'ランチ休憩', time: '12:00', planned: 60, repeat: true },
  { title: '集中して作業する', time: '13:00', planned: 120, repeat: false },
  { title: '今日の振り返り', time: '18:00', planned: 15, repeat: true }
];

const $ = id => document.getElementById(id);
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapeHtml = value => String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
const minutes = seconds => Math.max(0, Math.round(seconds / 60));
const durationText = value => value >= 60 ? `${Math.floor(value / 60)}時間${value % 60 ? ` ${value % 60}分` : ''}` : `${value}分`;
const actualText = seconds => seconds < 60 ? `${seconds}秒` : durationText(minutes(seconds));
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
    tasks: state.tasks
      .filter(t => t.repeat)
      .map(t => ({ ...t, id: uid(), status: 'pending', started: null, actual: 0, completedAt: null }))
  };
}

let runningId = state.tasks.find(t => t.status === 'running')?.id || null;
let editingId = null;
let lastDeleted = null;
let undoTimer = null;

const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const tasks = () => [...state.tasks].sort((a, b) => a.time.localeCompare(b.time));
const find = id => state.tasks.find(t => t.id === id);

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
  $('currentTitle').textContent = running?.title || 'タスクを選んで始めよう';
  $('currentMeta').textContent = running ? `開始 ${clock(new Date(running.started))} ・ 予定 ${durationText(running.planned)}` : 'ひとつずつ、目の前のことに集中';
  $('liveTimer').textContent = running ? formatTimer(elapsed(running)) : '00:00';
  $('currentAction').disabled = !running;
  $('currentAction').textContent = running ? '完了にする' : 'タスクを始める';
  $('emptyState').hidden = list.length > 0;

  $('taskList').innerHTML = list.map(task => `
    <article class="task-row ${task.status}" data-id="${task.id}">
      <button class="task-status" data-action="toggle" type="button" aria-label="${task.status === 'completed' ? '未完了に戻す' : '完了にする'}">${task.status === 'completed' ? '✓' : task.status === 'running' ? '●' : ''}</button>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">${task.time} ・ 予定 ${durationText(task.planned)}${task.repeat ? ' ・ 毎日' : ''}</div>
        ${task.actual ? `<div class="task-actual">実績 ${actualText(elapsed(task))}</div>` : ''}
        <div class="task-tools">
          <button class="tool-button edit-button" data-action="edit" type="button">編集</button>
          <button class="tool-button delete-button" data-action="delete" type="button">削除</button>
        </div>
        <button class="run-button" data-action="start" type="button">${task.status === 'running' ? '完了する' : '開始する'}</button>
      </div>
    </article>`).join('');

  const history = state.history || [];
  $('historyCount').textContent = `${history.length}件`;
  $('historyEmpty').hidden = history.length > 0;
  $('historyList').innerHTML = history.map(item => {
    const date = new Date(item.completedAt);
    return `<article class="history-row"><div class="history-main"><div class="history-title">${escapeHtml(item.title)}</div><div class="history-meta">${date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${clock(date)} ・ 予定 ${durationText(item.planned)}</div></div><div class="history-time">${actualText(item.actual)}</div></article>`;
  }).join('');

  save();
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = seconds % 60;
  return h
    ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
    : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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
  else {
    task.status = 'completed';
    task.completedAt = Date.now();
  }
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
  lastDeleted = { task: { ...task }, index };
  state.tasks.splice(index, 1);
  if (runningId === task.id) runningId = null;
  $('undoText').textContent = `「${task.title}」を削除しました`;
  $('undoToast').hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    $('undoToast').hidden = true;
    lastDeleted = null;
  }, 5000);
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
  state.tasks.splice(lastDeleted.index, 0, lastDeleted.task);
  lastDeleted = null;
  $('undoToast').hidden = true;
  clearTimeout(undoTimer);
  render();
});

$('currentAction').addEventListener('click', () => runningId && finish(runningId));
$('openAdd').addEventListener('click', () => $('addDialog').showModal());
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('taskTitle').value.trim();
  if (!title) return;
  state.tasks.push(makeTask({
    title,
    time: $('taskTime').value,
    planned: $('taskDuration').value,
    repeat: $('taskRepeat').checked
  }));
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

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
}
if ('caches' in window) {
  caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
}

setInterval(render, 1000);
render();
