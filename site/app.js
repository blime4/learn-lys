const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey = 'learn-lys-progress-v1';
let data;
let progress = { version: 1, practiced: [], review: [] };
let activeTag = '';
let toastTimer;
const names = { home: '学习概览', roadmap: '学习路线', notes: '知识笔记', review: '练习与复习', references: '资料库', lesson: '课程阅读' };
const statusClass = status => status === '已练习' ? 'done' : status === '学习中' ? 'current' : 'pending';
const badge = status => `<span class="badge ${statusClass(status)}">${esc(status || '未开始')}</span>`;
const practiced = lesson => progress.practiced.includes(lesson.id) || lesson.status === '已练习';
const lessonStatus = lesson => practiced(lesson) ? '已练习' : lesson.status || '未开始';
const lessonHref = id => `#lesson/${encodeURIComponent(id)}`;
function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}
function storageNotice() {
  const notice = $('#storage-notice');
  notice.hidden = false;
  notice.textContent = '浏览器存储不可用，本次记录仅保留在当前页面。请导出记录以保存。';
}
function validProgress(value) {
  const ids = new Set(data.lessons.map(l => l.id));
  if (!value || value.version !== 1 || !Array.isArray(value.practiced) || !Array.isArray(value.review)) throw new Error('不是受支持的 learn-lys 记录文件');
  const clean = list => {
    if (list.length > 10000 || list.some(id => typeof id !== 'string' || !ids.has(id))) throw new Error('记录包含未知课程，请确认文件对应当前学习站');
    return [...new Set(list)];
  };
  return { version: 1, practiced: clean(value.practiced), review: clean(value.review) };
}
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch { storageNotice(); }
}
function readProgress() {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) progress = validProgress(JSON.parse(stored));
  } catch {
    storageNotice();
    notify('已有记录无法读取，已使用课程默认进度。');
  }
}
function card(lesson, index = 0) {
  return `<article class="lesson-card"><div class="card-top"><span class="lesson-number">${String(index + 1).padStart(2, '0')}</span>${badge(lessonStatus(lesson))}</div><a href="${lessonHref(lesson.id)}"><h3>${esc(lesson.title)}</h3></a><p>${esc(lesson.summary)}</p><div class="card-bottom"><span>${esc(lesson.kind || '概念')} · ${esc(lesson.minutes || 10)} 分钟</span><a href="${lessonHref(lesson.id)}" aria-label="阅读${esc(lesson.title)}">↗</a></div></article>`;
}
function sectionTitle(eyebrow, title, extra = '') {
  return `<div class="section-title"><div><span class="eyebrow">${eyebrow}</span><h2>${title}</h2></div>${extra}</div>`;
}
function home() {
  const done = data.lessons.filter(practiced).length;
  const current = data.lessons.find(l => l.status === '学习中' && !practiced(l)) || data.lessons.find(l => !practiced(l)) || data.lessons[0];
  const percent = data.lessons.length ? Math.round(done / data.lessons.length * 100) : 0;
  const recent = data.lessons.slice(0, 3);
  return `<section class="hero"><div class="hero-copy"><span class="eyebrow">A LITTLE PROGRESS, EVERY DAY</span><h1>把知识，变成<br>能解决问题的能力。</h1><p>从理解一个概念，到独立验证一个想法。<br>沿着自己的路线，让每一步学习都有迹可循。</p><a class="button button-light" href="${current ? lessonHref(current.id) : '#notes'}">继续学习 <span>↗</span></a></div><div class="hero-art" aria-hidden="true"><span class="art-caption">UNDERSTAND / CONNECT / BUILD</span><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="art-node node-one">01<span>理解</span></div><div class="art-node node-two">02<span>练习</span></div><div class="art-node node-three">03<span>验证</span></div><div class="art-center">知行<br><em>同频</em></div><span class="art-coordinate">LYS / FIELD NOTES</span></div></section>
  <section class="overview-strip" aria-label="学习统计"><div><span>概念练习进度</span><strong>${done}<small> / ${data.lessons.length} 节</small></strong></div><div><span>当前阶段</span><strong class="stat-text">${esc(data.roadmap.find(s => s.status === '学习中')?.title || '从基础开始')}</strong></div><div><span>待复习</span><strong>${progress.review.length}<small> 个知识点</small></strong></div><div class="progress-stat"><div class="progress-ring" style="--progress:${percent}%"><span>${percent}<small>%</small></span></div><p>概念练习<br><small>工程验收单独记录</small></p></div></section>
  <div class="dashboard-columns"><section>${sectionTitle('PICK UP WHERE YOU LEFT OFF', '接着上次，继续探索', '<a class="text-link" href="#notes">全部笔记 ↗</a>')}${current ? `<a class="continue-card" href="${lessonHref(current.id)}"><div class="continue-mark" aria-hidden="true">↗</div><div><span class="eyebrow">${esc(current.kind || '概念')} · ${esc(current.minutes || 10)} MIN READ</span><h3>${esc(current.title)}</h3><p>${esc(current.summary)}</p><span class="text-link">进入课程 →</span></div></a>` : '<p>公开课程正在整理中。</p>'}</section><aside class="practice-note"><span class="eyebrow">LEARNING NOTE</span><h3>学会，始于<br>把“为什么”讲清楚。</h3><p>读过不等于掌握。先预测，再练习，最后用结果检查自己的理解。</p><a class="text-link" href="#review">做一个小练习 ↗</a></aside></div>
  <section>${sectionTitle('YOUR LEARNING PATH', '三个月，一步步走深', '<a class="text-link" href="#roadmap">查看完整路线 ↗</a>')}<div class="path-preview">${data.roadmap.slice(0, 3).map((stage, i) => `<a href="#roadmap" class="path-step ${stage.status === '学习中' ? 'active' : ''}"><span class="path-index">${String(i + 1).padStart(2, '0')}</span><div><small>${esc(stage.weeks)}</small><h3>${esc(stage.title)}</h3><p>${esc(stage.description)}</p></div><span class="path-arrow">→</span></a>`).join('')}</div></section>
  <section>${sectionTitle('KNOWLEDGE IN SMALL PIECES', '让知识，逐渐连起来', '<a class="text-link" href="#notes">打开知识笔记 ↗</a>')}<div class="lesson-grid">${recent.map(card).join('')}</div></section>`;
}
function roadmap() {
  return `<div class="page-heading"><span class="eyebrow">THE NEXT TWELVE WEEKS</span><h1>学习路线</h1><p>先建立理解，再用实践检验。周次是方向，验收证据决定实际进度。</p></div><div class="route-list">${data.roadmap.map((stage, i) => `<article class="route-stage"><div class="route-number">${String(i + 1).padStart(2, '0')}</div><div class="route-content"><div class="route-meta"><span>${esc(stage.weeks)}</span>${badge(stage.status)}</div><h2>${esc(stage.title)}</h2><p>${esc(stage.description)}</p><div class="tags">${(stage.topics || []).map(t => `<span>${esc(t)}</span>`).join('')}</div><div class="stage-lessons">${data.lessons.filter(l => Number(l.week) >= i * 2 + 1 && Number(l.week) <= i * 2 + 2).map(l => `<a href="${lessonHref(l.id)}">${esc(l.title)} <span>↗</span></a>`).join('')}</div></div></article>`).join('')}</div><div class="notice-block"><strong>以证据衡量进步</strong><p>网页中的“已练习”表示概念练习记录，不代表真实硬件测试通过、工程任务验收或团队评审通过。</p></div>`;
}
function notes() {
  const query = $('#global-search').value.trim().toLocaleLowerCase();
  const tags = [...new Set(data.lessons.flatMap(l => l.tags || []))];
  const matches = data.lessons.filter(l => (!activeTag || l.tags?.includes(activeTag)) && (!query || `${l.title} ${l.summary} ${(l.tags || []).join(' ')} ${l.html.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase().includes(query)));
  return `<div class="page-heading"><span class="eyebrow">YOUR GROWING KNOWLEDGE BASE</span><h1>知识笔记</h1><p>用具体例子理解概念，用双向链接连接知识。公开笔记与本地 Obsidian 使用同一份 Markdown。</p></div><div class="filter-bar"><div class="tag-filters"><button data-tag="" class="${!activeTag ? 'selected' : ''}">全部</button>${tags.map(t => `<button data-tag="${esc(t)}" class="${activeTag === t ? 'selected' : ''}">${esc(t)}</button>`).join('')}</div><span>${matches.length} 篇笔记</span></div>${query ? `<p class="query-label">搜索“${esc(query)}”的结果</p>` : ''}<div class="lesson-grid">${matches.map(card).join('')}</div>${!matches.length ? '<div class="empty-state"><span>⌕</span><h2>暂时没有找到笔记</h2><p>试试更短的关键词，或清除标签筛选。</p><button class="button" data-action="clear-search">清除筛选</button></div>' : ''}`;
}
function calculator() {
  return `<section class="calculator">${sectionTitle('A SMALL EXPERIMENT', '张量数据量计算器')}<p>计算矩阵加法 C = A + B 的必要读写量。A、B 形状与类型相同；仅计算数据本身，不含对齐、缓存和临时空间。</p><form id="tensor-form"><label>行数<input name="rows" type="number" min="1" max="1000000" step="1" value="1000" required></label><label>列数<input name="cols" type="number" min="1" max="1000000" step="1" value="1000" required></label><label>A / B 类型<select name="inputType"><option value="2">FP16 · 2 字节</option><option value="4">FP32 · 4 字节</option></select></label><label>C 类型<select name="outputType"><option value="4">FP32 · 4 字节</option><option value="2">FP16 · 2 字节</option></select></label></form><div id="tensor-results" class="calculator-results" aria-live="polite"></div><small>采用十进制单位：1 MB = 1,000,000 字节。这是字节数推导，不是硬件性能测量。</small></section>`;
}
function review() {
  const selected = data.lessons.filter(l => progress.review.includes(l.id));
  return `<div class="page-heading"><span class="eyebrow">RECALL, THEN VERIFY</span><h1>练习与复习</h1><p>先独立回忆，再对照笔记。一次正确回答，是继续深入的起点。</p></div>${calculator()}${sectionTitle('YOUR REVIEW QUEUE', '留给下一次的知识点', `<span class="muted">${selected.length} 项</span>`)}${selected.length ? `<div class="review-list">${selected.map(l => `<article><div><h3><a href="${lessonHref(l.id)}">${esc(l.title)}</a></h3><p>${esc(l.summary)}</p></div><button class="subtle-button" data-action="review" data-id="${esc(l.id)}">移出复习</button></article>`).join('')}</div>` : '<div class="empty-state compact"><span>↺</span><h2>给值得回想的概念留个位置</h2><p>阅读课程时点击“加入复习”，它就会出现在这里。</p><a class="text-link" href="#notes">去读一篇笔记 →</a></div>'}<section class="record-panel"><div><span class="eyebrow">YOUR RECORDS, YOUR CONTROL</span><h2>保存你的练习记录</h2><p>记录保存在当前浏览器，不会自动同步到 GitHub 或 Obsidian。导出后可留存，换设备时再导入。</p></div><div class="record-actions"><button class="button" data-action="export">导出记录 ↓</button><button class="subtle-button" data-action="import">导入记录 ↑</button></div></section>`;
}
function safeReference(url) {
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : null; } catch { return null; }
}
function references() {
  return `<div class="page-heading"><span class="eyebrow">READ FROM THE SOURCE</span><h1>资料库</h1><p>公开参考资料与本地知识库，各有清晰的位置。</p></div><section class="obsidian-panel"><span class="vault-icon">◇</span><div><span class="eyebrow">LOCAL FIRST</span><h2>用 Obsidian，积累自己的知识库。</h2><p>在本机打开名为 learn-lys 的仓库作为 vault，编辑公开笔记后重新构建，即可更新网页。完整资料和私人记录保留在本地；公开站点只展示经过筛选的内容。</p><a class="text-link" href="obsidian://open?vault=learn-lys">打开本机 Obsidian ↗</a><small>需要本机已安装 Obsidian，并已打开对应 vault。</small></div></section>${sectionTitle('PUBLIC REFERENCES', '公开阅读入口')}<div class="reference-list">${data.references.map((ref, i) => { const url = safeReference(ref.url); return `<article><span class="reference-index">${String(i + 1).padStart(2, '0')}</span><div><span class="eyebrow">${esc(ref.type || '参考资料')}</span><h3>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(ref.title)} ↗</a>` : esc(ref.title)}</h3><p>${esc(ref.availability || '')}</p></div></article>`; }).join('')}</div>${sectionTitle('WORDS THAT CONNECT IDEAS', '术语速查')}<div class="glossary">${data.glossary.map(g => `<div><dt>${esc(g.term)}</dt><dd>${esc(g.definition)}${data.lessons.some(l => l.id === g.lessonId) ? ` <a href="${lessonHref(g.lessonId)}" aria-label="查看${esc(g.term)}相关课程">↗</a>` : ''}</dd></div>`).join('')}</div>`;
}
function lessonPage(id) {
  const index = data.lessons.findIndex(l => l.id === id);
  if (index < 0) return '<div class="empty-state"><h1>这篇笔记暂不可用</h1><p>它可能尚未公开，或链接已更新。</p><a class="button" href="#notes">返回知识笔记</a></div>';
  const lesson = data.lessons[index];
  const obsidian = `obsidian://open?vault=learn-lys&file=${encodeURIComponent(lesson.path)}`;
  return `<a class="back-link" href="#notes">← 知识笔记</a><header class="lesson-heading"><div class="lesson-meta"><span>${esc(lesson.kind || '概念')} / ${esc(lesson.minutes || 10)} 分钟</span>${badge(lessonStatus(lesson))}</div><h1>${esc(lesson.title)}</h1><p>${esc(lesson.summary)}</p><div class="lesson-actions"><button class="button" data-action="practice" data-id="${esc(id)}">${practiced(lesson) ? '已记录概念练习 ✓' : '记录已练习'}</button><button class="subtle-button" data-action="review" data-id="${esc(id)}">${progress.review.includes(id) ? '已加入复习 ✓' : '加入复习 ↺'}</button><a class="subtle-button" href="${obsidian}" title="仅本机已安装 Obsidian 并打开 learn-lys vault 时可用">在 Obsidian 打开 ↗</a></div><small class="muted">练习状态保存在本浏览器，不代表工程验收。本机 Obsidian 入口需要对应 vault。</small></header><div class="reading-layout"><article class="prose" id="lesson-content">${lesson.html}</article><aside class="reading-aside"><span class="eyebrow">ON THIS PAGE</span><nav id="lesson-toc" aria-label="本页目录"></nav><div class="reading-tip">先尝试自己解释，<br>再查看参考答案。</div></aside></div><nav class="lesson-neighbors" aria-label="相邻课程">${index ? `<a href="${lessonHref(data.lessons[index - 1].id)}"><small>← 上一篇</small><strong>${esc(data.lessons[index - 1].title)}</strong></a>` : '<span></span>'}${index < data.lessons.length - 1 ? `<a href="${lessonHref(data.lessons[index + 1].id)}"><small>下一篇 →</small><strong>${esc(data.lessons[index + 1].title)}</strong></a>` : '<a href="#review"><small>接下来 →</small><strong>回忆与练习</strong></a>'}</nav>`;
}
function updateCalculator() {
  const form = $('#tensor-form');
  if (!form) return;
  const values = new FormData(form);
  const rows = Number(values.get('rows')), cols = Number(values.get('cols'));
  if (![rows, cols].every(n => Number.isInteger(n) && n >= 1 && n <= 1000000)) {
    $('#tensor-results').textContent = '请输入 1 到 1,000,000 之间的整数行数和列数。';
    return;
  }
  const inputBytes = rows * cols * Number(values.get('inputType'));
  const outputBytes = rows * cols * Number(values.get('outputType'));
  const format = n => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 6 }).format(n / 1000000);
  $('#tensor-results').innerHTML = [['读 A',inputBytes],['读 B',inputBytes],['写 C',outputBytes],['总读写量',2 * inputBytes + outputBytes]].map(([name,n]) => `<div><span>${name}</span><strong>${format(n)}<small> MB</small></strong></div>`).join('');
}
function prepareReading() {
  const article = $('#lesson-content');
  if (!article) return;
  const headings = [...article.querySelectorAll('h1,h2,h3')];
  headings.forEach((h, index) => { h.id = `section-${index}`; });
  $('#lesson-toc').innerHTML = headings.map(h => `<a href="#${esc(location.hash.slice(1).split('?')[0])}" data-scroll="${h.id}" class="toc-${h.tagName.toLowerCase()}">${esc(h.textContent)}</a>`).join('');
}
function render() {
  let [route, id] = location.hash.slice(1).split('/');
  if (!route || route === 'main') route = 'home';
  try { id = id ? decodeURIComponent(id) : ''; } catch { id = ''; }
  const view = ({ home, roadmap, notes, review, references })[route];
  $('#main').innerHTML = route === 'lesson' ? lessonPage(id) : view ? view() : '<div class="empty-state"><h1>这里还没有内容</h1><a class="button" href="#home">返回学习概览</a></div>';
  $('#section-name').textContent = names[route] || '学习空间';
  document.querySelectorAll('[data-nav]').forEach(link => {
    const selected = link.dataset.nav === (route === 'lesson' ? 'notes' : route);
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  });
  document.title = `${route === 'lesson' ? data.lessons.find(l => l.id === id)?.title || '课程' : names[route] || '学习空间'} · learn-lys`;
  prepareReading();
  updateCalculator();
}
document.addEventListener('click', event => {
  const scroll = event.target.closest('[data-scroll]');
  if (scroll) { event.preventDefault(); document.getElementById(scroll.dataset.scroll)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); return; }
  const tag = event.target.closest('[data-tag]');
  if (tag) { activeTag = tag.dataset.tag; render(); return; }
  const button = event.target.closest('[data-action]');
  if (!button || !data) return;
  const action = button.dataset.action, id = button.dataset.id;
  if (action === 'practice') {
    if (!data.lessons.some(l => l.id === id)) return;
    if (!progress.practiced.includes(id)) progress.practiced.push(id);
    save(); render(); notify('已记录概念练习；工程验收仍需实际证据。');
  } else if (action === 'review') {
    if (!data.lessons.some(l => l.id === id)) return;
    const added = !progress.review.includes(id);
    progress.review = added ? [...progress.review,id] : progress.review.filter(item => item !== id);
    save(); render(); notify(added ? '已加入复习清单' : '已移出复习清单');
  } else if (action === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'learn-lys-progress.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('已导出本浏览器的练习与复习记录');
  } else if (action === 'import') $('#import-file').click();
  else if (action === 'clear-search') { $('#global-search').value = ''; activeTag = ''; render(); }
});
document.addEventListener('input', event => { if (event.target.closest('#tensor-form')) updateCalculator(); });
document.addEventListener('change', event => { if (event.target.closest('#tensor-form')) updateCalculator(); });
document.addEventListener('submit', event => { if (event.target.id === 'tensor-form') event.preventDefault(); });
$('#global-search').addEventListener('input', () => { if (location.hash !== '#notes') location.hash = '#notes'; else render(); });
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 256000) throw new Error('记录文件超过 250 KB，请选择正确的导出文件');
    progress = validProgress(JSON.parse(await file.text())); save(); render(); notify('记录已导入，已替换本浏览器的练习与复习记录');
  } catch (error) { notify(`导入失败：${error.message}`); }
  event.target.value = '';
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { event.preventDefault(); $('#global-search').focus(); }
});
window.addEventListener('hashchange', () => { if (data) { render(); window.scrollTo(0, 0); } });
async function start() {
  try {
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
    data.lessons ||= []; data.roadmap ||= []; data.references ||= []; data.glossary ||= [];
    readProgress(); render();
  } catch {
    $('#main').innerHTML = '<div class="empty-state"><span>◇</span><h1>学习内容还没加载好</h1><p>请通过本地预览服务器或网站地址打开，并确认已构建公开内容。</p><button class="button" id="retry-load">重新加载</button></div>';
    $('#retry-load').addEventListener('click', start);
  }
}
start();
