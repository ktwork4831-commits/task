const STORAGE_KEY = 'today-task-v2';
const todayKey = () => { const d = new Date(); return d.toISOString().slice(0, 10); };
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
const clock = d => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
const elapsed = task => task.actual + (task.status === 'running' ? Math.floor((Date.now() - task.started) / 1000) : 0);
const makeTask = data => ({ id: uid(), title: data.title, time: data.time || '09:00', planned: Number(data.planned) || 30, repeat: !!data.repeat, status: 'pending', started: null, actual: 0 });

function load() { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (saved?.tasks) return saved; } catch (_) {} return { date: todayKey(), tasks: seed.map(makeTask) }; }
let state = load();
if (state.date !== todayKey()) { state = { date: todayKey(), tasks: state.tasks.filter(t => t.repeat).map(t => ({ ...t, id: uid(), status: 'pending', started: null, actual: 0 })) }; }
let runningId = state.tasks.find(t => t.status === 'running')?.id || null;
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
const tasks = () => [...state.tasks].sort((a, b) => a.time.localeCompare(b.time));
const find = id => state.tasks.find(t => t.id === id);

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
  $('currentMeta').textContent = running ? `開始 ${clock(new Date(running.started))} ・ ${durationText(running.planned)}予定` : 'ひとつずつ、目の前のことに集中';
  $('liveTimer').textContent = running ? formatTimer(elapsed(running)) : '00:00';
  $('currentAction').disabled = !running;
  $('currentAction').textContent = running ? '完了にする' : 'タスクを始める';
  $('emptyState').hidden = list.length > 0;

  $('taskList').innerHTML = list.map(task => `
    <article class="task-row ${task.status}" data-id="${task.id}">
      <button class="task-status" data-action="toggle" type="button" aria-label="${task.status === 'completed' ? '未完了に戻す' : '完了にする'}">
        ${task.status === 'completed' ? '✓' : task.status === 'running' ? '●' : ''}
      </button>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">${task.time} ・ ${durationText(task.planned)}${task.repeat ? ' ・ 毎日' : ''}</div>
        <div class="task-actions">
          <button class="task-action start-button" data-action="start" type="button">${task.status === 'running' ? '停止して完了' : '開始'}</button>
          <button class="task-action edit-button" data-action="edit" type="button">編集</button>
          <button class="task-action delete-button" data-action="delete" type="button">削除</button>
        </div>
      </div>
    </article>`).join('');
  save();
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60;
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
  task.started = null;
  runningId = null;
  render();
}

function toggleComplete(task) {
  if (!task) return;
  if (task.status === 'running') {
    finish(task.id);
    return;
  }
  if (task.status === 'completed') {
    task.status = 'pending';
    task.actual = 0;
  } else {
    task.status = 'completed';
  }
  render();
}

function edit(task) {
  const title = prompt('タスク名', task.title);
  if (!title?.trim()) return;
  const planned = Number(prompt('予定時間（分）', task.planned));
  if (!Number.isFinite(planned) || planned <= 0) return;
  task.title = title.trim();
  task.planned = planned;
  render();
}

function remove(task) {
  if (!task) return;
  if (!confirm(`「${task.title}」を削除しますか？`)) return;
  state.tasks = state.tasks.filter(t => t.id !== task.id);
  if (runningId === task.id) runningId = null;
  render();
}

$('taskList').addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  const row = button.closest('.task-row');
  const task = row ? find(row.dataset.id) : null;
  const action = button.dataset.action;

  if (action === 'start') task?.status === 'running' ? finish(task.id) : start(task?.id);
  if (action === 'toggle') toggleComplete(task);
  if (action === 'edit') edit(task);
  if (action === 'delete') remove(task);
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
  if (!confirm('今日の進捗をリセットしますか？')) return;
  state.tasks.forEach(t => { t.status = 'pending'; t.started = null; t.actual = 0; });
  runningId = null;
  render();
});
setInterval(render, 1000);
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
