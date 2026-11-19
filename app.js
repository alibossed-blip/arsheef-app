'use strict';
// =====================================================================
//  أرشيف الشغل · التطبيق (Supabase + PWA)
// =====================================================================

const CFG = window.APP_CONFIG || {};
const S = { user: null, me: null, boot: null, stack: [], loadedAt: 0 };
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const role = () => (S.me && S.me.role) || 'none';
const canEdit = () => role() === 'editor' || role() === 'admin';
const isAdmin = () => role() === 'admin';
const BOOT_KEY = 'arsheef_boot_v1';

let sb = null;
if (CFG.SUPABASE_URL && CFG.SUPABASE_KEY) {
  sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
}

// ---------- أدوات عامة ----------
function showOnly(id) {
  ['login', 'pending', 'noconfig', 'app'].forEach((x) => $(x).classList.toggle('hidden', x !== id));
}
function loading(on, msg) {
  $('loader').classList.toggle('hidden', !on);
  $('loaderMsg').textContent = on ? (msg || '') : '';
}
function toast(msg, bad) {
  const d = document.createElement('div');
  d.className = 'toast' + (bad ? ' bad' : '');
  d.textContent = msg;
  $('toastBox').appendChild(d);
  setTimeout(() => d.remove(), bad ? 4500 : 2600);
}
function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'ما كو اتصال بالإنترنت';
  if (/Invalid login credentials/i.test(m)) return 'الإيميل أو كلمة السر غلط';
  if (/User already registered/i.test(m)) return 'هذا الإيميل مسجّل من قبل. ادخل بدل التسجيل';
  if (/Password should be at least/i.test(m)) return 'كلمة السر لازم 8 أحرف أو أكثر';
  if (/rate limit/i.test(m)) return 'محاولات كثيرة. انتظر شوية وجرب';
  if (/JWT|not authenticated|session/i.test(m)) return 'انتهت الجلسة، سجّل دخول مرة ثانية';
  return m;
}
async function busy(fn, msg) {
  loading(true, msg);
  try { return await fn(); }
  catch (e) { toast(errMsg(e), true); }
  finally { loading(false); }
}
function openLink(u) { window.open(u, '_blank', 'noopener'); }

// كل عمليات قاعدة البيانات تمر من هنا
async function rpc(fn, args) {
  if (!navigator.onLine) throw new Error('ما كو اتصال بالإنترنت');
  const { data, error } = await sb.rpc(fn, args || {});
  if (error) throw error;
  return data;
}

// ---------- تسجيل الدخول ----------
function lgErr(t, ok) { $('lgErr').textContent = t || ''; $('lgErr').classList.toggle('ok', !!ok); }
function showSignup(on) {
  $('lgFormIn').classList.toggle('hidden', on);
  $('lgFormUp').classList.toggle('hidden', !on);
  lgErr('');
}
$('toSignup').onclick = () => showSignup(true);
$('toLogin').onclick = () => showSignup(false);
$('lgPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('lgBtn').click(); });
$('suPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('suBtn').click(); });
$('lgEmail').value = LS.get('arsheef_email') || '';

$('lgBtn').onclick = async () => {
  lgErr('');
  const email = $('lgEmail').value.trim(), password = $('lgPass').value;
  if (!email || !password) return lgErr('اكتب الإيميل وكلمة السر');
  $('lgBtn').disabled = true;
  try {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    LS.set('arsheef_email', email);
    $('lgPass').value = '';
  } catch (e) { lgErr(errMsg(e)); }
  finally { $('lgBtn').disabled = false; }
};

$('suBtn').onclick = async () => {
  lgErr('');
  const name = $('suName').value.trim(), email = $('suEmail').value.trim(), password = $('suPass').value;
  if (!name || !email) return lgErr('اكتب اسمك وإيميلك');
  if (password.length < 8) return lgErr('كلمة السر لازم 8 أحرف أو أكثر');
  $('suBtn').disabled = true;
  try {
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
    if (error) throw error;
    LS.set('arsheef_email', email);
    $('suPass').value = '';
    if (!data.session) {
      showSignup(false);
      $('lgEmail').value = email;
      lgErr('تم إنشاء الحساب ✔ افتح إيميلك واضغط رابط التأكيد، بعدها ادخل.', true);
    }
  } catch (e) { lgErr(errMsg(e)); }
  finally { $('suBtn').disabled = false; }
};

$('toReset').onclick = async () => {
  const email = $('lgEmail').value.trim();
  if (!email) return lgErr('اكتب إيميلك بالخانة فوق أول');
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) throw error;
    lgErr('دزّينا رابط لإيميلك. افتحه حتى تختار كلمة سر جديدة.', true);
  } catch (e) { lgErr(errMsg(e)); }
};

function newPasswordSheet() {
  sheet(`<h2>🔑 كلمة سر جديدة</h2><div class="f">
    <label>كلمة السر الجديدة (8 أحرف أو أكثر)</label><input id="npPass" type="password" autocomplete="new-password"></div>
    <div class="actions" style="margin-top:14px"><button class="btn ok" id="npOk">حفظ</button></div>`);
  $('npOk').onclick = () => busy(async () => {
    const p = $('npPass').value;
    if (p.length < 8) throw new Error('كلمة السر لازم 8 أحرف أو أكثر');
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) throw error;
    closeSheet(); toast('تم تغيير كلمة السر ✔');
  });
}

async function doLogout() {
  LS.del(BOOT_KEY);
  S.boot = null; S.me = null; S.user = null;
  Object.keys(PHOTO_CACHE).forEach((k) => delete PHOTO_CACHE[k]);
  try { await sb.auth.signOut(); } catch (e) {}
  showOnly('login'); showSignup(false);
}
$('logoutBtn').onclick = () => { if (confirm('تسجيل خروج؟')) doLogout(); };
$('pendOut').onclick = doLogout;
$('pendCheck').onclick = () => busy(async () => { await enter(true); });

// ---------- الدخول للتطبيق ----------
let entering = false;
async function enter(force) {
  if (entering && !force) return;
  entering = true;
  try {
    const { data } = await sb.auth.getSession();
    S.user = data.session ? data.session.user : null;
    if (!S.user) { showOnly('login'); return; }

    // فتح فوري من آخر نسخة محفوظة، والتحديث بالخلفية
    const cached = LS.get(BOOT_KEY);
    if (cached && cached.uid === S.user.id && cached.me && ['viewer', 'editor', 'admin'].includes(cached.me.role)) {
      S.me = cached.me; setBoot(cached.boot); S.loadedAt = 0;
      startUI();
      refreshInBackground();
      return;
    }

    loading(true, 'جاري التحميل…');
    S.me = await rpc('me');
    if (!['viewer', 'editor', 'admin'].includes(S.me.role)) {
      $('pendWho').textContent = (S.me.name || '') + ' · ' + (S.user.email || '');
      showOnly('pending'); return;
    }
    await loadAll();
    startUI();
  } catch (e) {
    toast(errMsg(e), true);
    if (!S.boot) showOnly('login');
  } finally { loading(false); entering = false; }
}

function startUI() {
  showOnly('app');
  const icon = { admin: '👑 مدير', editor: '✏️ تعديل', viewer: '👁 عرض' }[role()] || '';
  $('modeBadge').textContent = icon + ' · ' + (S.me.name || '');
  $('adminBtn').classList.toggle('hidden', !isAdmin());
  buildNav();
  const cur = S.stack[S.stack.length - 1];
  if (cur) render(cur.name, cur.arg); else go('home');
}

async function refreshInBackground() {
  try {
    const me = await rpc('me');
    if (!['viewer', 'editor', 'admin'].includes(me.role)) { LS.del(BOOT_KEY); location.reload(); return; }
    const roleChanged = me.role !== role();
    S.me = me;
    await loadAll();
    if (roleChanged) { startUI(); return; }
    const cur = S.stack[S.stack.length - 1];
    if (cur && cur.name[0] !== 'f' && !$('ovl').innerHTML) render(cur.name, cur.arg);
  } catch (e) { /* نبقى على النسخة المحفوظة */ }
}

$('refreshBtn').onclick = async () => {
  await busy(async () => { await reloadData(); toast('تم التحديث ✔'); });
  const cur = S.stack[S.stack.length - 1];
  if (cur) render(cur.name, cur.arg);
};

// ---------- البيانات ----------
const PHOTO_CACHE = {};
function setBoot(B) {
  S.boot = B;
  B.byPhone = {}; B.customers.forEach((c) => { B.byPhone[c.p] = c; });
  B.byDev = {}; B.devices.forEach((d) => { B.byDev[d.n] = d; });
  B.serials = B.sales.filter((s) => s.serial).map((s) => ({ s: s.serial, p: s.p, d: s.dev }));
}
async function loadAll() {
  const B = await rpc('bootstrap');
  S.loadedAt = Date.now();
  setBoot(B);
  LS.set(BOOT_KEY, { uid: S.user.id, me: S.me, boot: { today: B.today, role: B.role, lists: B.lists, customers: B.customers, devices: B.devices, sales: B.sales, maint: B.maint, stats: B.stats } });
}
async function reloadData() { await loadAll(); Object.keys(PHOTO_CACHE).forEach((k) => delete PHOTO_CACHE[k]); }

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.boot && Date.now() - S.loadedAt > 120000) refreshInBackground();
});
function netState() { $('offline').classList.toggle('hidden', navigator.onLine); }
window.addEventListener('online', () => { netState(); if (S.boot) refreshInBackground(); });
window.addEventListener('offline', netState);

// ---------- التنقل ----------
function buildNav() {
  const items = canEdit()
    ? [['home', '🏠', 'الرئيسية'], ['maint', '🔧', 'الصيانة'], ['add', '+', ''], ['devices', '📦', 'الأجهزة']]
    : [['home', '🏠', 'الرئيسية'], ['maint', '🔧', 'الصيانة'], ['devices', '📦', 'الأجهزة']];
  $('nav').innerHTML = items.map(([k, i, t]) => k === 'add'
    ? `<button class="fab" onclick="addMenu()" title="إضافة">+</button>`
    : `<button data-k="${k}" onclick="go('${k}')"><span class="i">${i}</span>${t}</button>`).join('');
}
function setNav(k) { document.querySelectorAll('#nav button[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === k)); }
function go(name, arg) { S.stack = [{ name, arg }]; render(name, arg); }
function push(name, arg) { S.stack.push({ name, arg }); render(name, arg); }
function back() { S.stack.pop(); const c = S.stack[S.stack.length - 1] || { name: 'home' }; render(c.name, c.arg); }
function backLink() { return S.stack.length > 1 ? `<div class="back" onclick="back()">→ رجوع</div>` : ''; }
function render(name, arg) {
  window.scrollTo(0, 0);
  setNav(name);
  const pages = { home: pgHome, customer: pgCustomer, device: pgDevice, maint: pgMaint, devices: pgDevices,
    fCustomer, fSale, fMaint, fDevice };
  (pages[name] || pgHome)($('view'), arg);
}

// ---------- الرئيسية والبحث ----------
function stats() {
  const B = S.boot;
  return {
    customers: B.customers.length, sold: B.sales.length,
    openMaint: B.maint.filter((m) => m.st && m.st !== 'منجزة').length,
    expiring: B.sales.filter((s) => s.st === 'ينتهي قريباً').length
  };
}
function pgHome(V) {
  const st = stats(), sv = S.boot.stats || {};
  V.innerHTML = `
    <div class="search"><input id="q" type="search" placeholder="🔍 رقم الهاتف، الاسم، العيادة، السيريال، أو الموديل" autocomplete="off"></div>
    <div id="res"></div>
    <div class="stats">
      <div class="stat"><b>${st.customers}</b><span>زبون</span></div>
      <div class="stat"><b>${st.sold}</b><span>جهاز مباع</span></div>
      <div class="stat click" onclick="go('maint')"><b>${st.openMaint}</b><span>صيانة مفتوحة</span></div>
      <div class="stat click" onclick="showExpiring()"><b>${st.expiring}</b><span>ضمان ينتهي خلال 30 يوم</span></div>
    </div>
    ${canEdit() ? `<div class="stats" style="grid-template-columns:repeat(2,1fr)">
      <div class="stat"><b>${esc(sv.remUsd)}</b><span>متبقي على الزبائن $</span></div>
      <div class="stat"><b>${esc(sv.remIqd)}</b><span>متبقي على الزبائن د.ع</span></div>
    </div>` : ''}
    <div class="sec">آخر الزبائن المسجّلين</div>
    <div class="card list" id="recent"></div>`;
  const recent = S.boot.customers.slice(-8).reverse();
  $('recent').innerHTML = recent.length
    ? recent.map((c) => itemHtml({ type: 'customer', key: c.p, title: c.n, sub: [c.c, c.p].filter(Boolean).join(' · '), tag: c.st })).join('')
    : `<div class="empty">ما كو زبائن بعد${canEdit() ? '. اضغط + حتى تضيف أول زبون' : ''}</div>`;
  $('q').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    $('res').innerHTML = v ? `<div class="card list">${searchLocal(v).map(itemHtml).join('') || '<div class="empty">ما لكيت شي</div>'}</div>` : '';
  });
}
function searchLocal(q) {
  const B = S.boot, low = q.toLowerCase();
  const digits = q.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632)).replace(/\D/g, '').replace(/^00964|^964/, '');
  const has = (x) => String(x || '').toLowerCase().indexOf(low) > -1;
  const out = [];
  B.customers.forEach((c) => {
    if ((digits.length >= 4 && (c.p.indexOf(digits.replace(/^7/, '07')) > -1 || c.p.indexOf(digits) > -1)) || has(c.n) || has(c.c))
      out.push({ type: 'customer', key: c.p, title: c.n, sub: [c.c, c.prov, c.p].filter(Boolean).join(' · '), tag: c.st });
  });
  B.sales.forEach((s) => { if (has(s.serial)) out.push({ type: 'customer', key: s.p, title: 'سيريال: ' + s.serial, sub: s.dev + ' · ' + s.name, tag: 'جهاز مباع' }); });
  B.devices.forEach((d) => { if (has(d.n) || has(d.t)) out.push({ type: 'device', key: d.n, title: d.n, sub: [d.t, d.maker].filter(Boolean).join(' · '), tag: 'موديل' }); });
  return out.slice(0, 40);
}
function itemHtml(x) {
  const ch = x.tag ? `<span class="chip">${esc(x.tag)}</span>` : '';
  const ini = (String(x.title || '?').replace(/^د\.\s*/, '').trim()[0] || '?');
  const icon = x.type === 'device' ? '📦' : esc(ini);
  return `<div class="item" onclick="push('${x.type}', ${esc(JSON.stringify(x.key))})">
    <div class="av">${icon}</div>
    <div class="grow"><div class="t">${esc(x.title)}</div><div class="s">${esc(x.sub || '')}</div></div>${ch}</div>`;
}
function showExpiring() {
  const r = S.boot.sales.filter((s) => s.st === 'ينتهي قريباً');
  sheet(`<h2>ضمانات تنتهي خلال 30 يوم</h2>${r.length ? '<div class="list">' + r.map((x) => itemHtml({ type: 'customer', key: x.p, title: x.name, sub: x.dev + ' · ' + x.serial + ' · ينتهي ' + x.end })).join('') + '</div>' : '<div class="empty">ما كو</div>'}`);
  $('ovl').querySelectorAll('.item').forEach((el) => el.addEventListener('click', closeSheet));
}

// ---------- الصور ----------
async function fetchPhotos(kind, key) {
  const { data, error, count } = await sb.from('photos')
    .select('id,path,thumb_path,name,mime', { count: 'exact' })
    .eq('kind', kind).eq('key', key)
    .order('created_at', { ascending: false }).limit(60);
  if (error) throw error;
  const thumbs = data.filter((p) => p.thumb_path).map((p) => p.thumb_path);
  let urls = {};
  if (thumbs.length) {
    const r = await sb.storage.from('photos').createSignedUrls(thumbs, 60 * 60 * 6);
    if (r.error) throw r.error;
    r.data.forEach((u) => { if (u.signedUrl) urls[u.path] = u.signedUrl; });
  }
  return { total: count || data.length, items: data.map((p) => ({ ...p, thumb: p.thumb_path ? urls[p.thumb_path] : '' })) };
}
function photosBox(kind, key) {
  const id = 'ph_' + Math.random().toString(36).slice(2);
  const ck = kind + ':' + key;
  setTimeout(async () => {
    if (!$(id) || PHOTO_CACHE[ck]) return;
    try {
      const r = await fetchPhotos(kind, key);
      PHOTO_CACHE[ck] = r;
      const b2 = $(id); if (b2) b2.innerHTML = galHtml(ck);
    } catch (e) { const b2 = $(id); if (b2) b2.innerHTML = `<div class="empty">${esc(errMsg(e))}</div>`; }
  }, 0);
  return `<div id="${id}">${PHOTO_CACHE[ck] ? galHtml(ck) : '<div class="gal">' + '<div class="ph2 sk"></div>'.repeat(4) + '</div>'}</div>`;
}
function galHtml(ck) {
  const r = PHOTO_CACHE[ck];
  const ph = (r && r.items) || [];
  if (!ph.length) return '<div class="empty">ما كو صور</div>';
  return `<div class="gal">${ph.map((p, i) => p.thumb
    ? `<div class="ph2" style="background-image:url('${esc(p.thumb)}')" onclick="viewImg('${esc(ck)}', ${i})"></div>`
    : `<div class="ph2" onclick="viewImg('${esc(ck)}', ${i})" title="${esc(p.name)}">📄</div>`).join('')}</div>
    ${r.total > ph.length ? `<div class="empty" style="padding:8px">يظهر آخر ${ph.length} من ${r.total}</div>` : ''}`;
}

async function viewImg(ck, i) {
  const p = PHOTO_CACHE[ck] && PHOTO_CACHE[ck].items[i];
  if (!p) return;
  await busy(async () => {
    const { data, error } = await sb.storage.from('photos').createSignedUrl(p.path, 3600);
    if (error) throw error;
    const blob = await (await fetch(data.signedUrl)).blob();
    const url = URL.createObjectURL(blob);
    const isImg = (p.mime || '').indexOf('image/') === 0;
    const o = document.createElement('div');
    o.className = 'viewer';
    o.innerHTML = `${isImg ? `<img src="${url}" alt="">` : `<iframe src="${url}" style="flex:1;border:0;background:#fff"></iframe>`}
      <div class="hint">${isImg ? 'على التلفون: اضغط مطوّلاً على الصورة حتى تحفظها أو تشاركها' : esc(p.name)}</div>
      <div class="bar">
        <button class="btn wa" data-a="share">📤 مشاركة</button>
        <a class="btn" download="${esc(p.name || 'file')}" href="${url}">⬇️ تنزيل</a>
        ${isAdmin() ? '<button class="btn del" data-a="del">🗑 حذف</button>' : ''}
        <button class="btn" data-a="close">✕ إغلاق</button>
      </div>`;
    document.body.appendChild(o);
    const close = () => { o.remove(); URL.revokeObjectURL(url); };
    o.querySelector('[data-a=close]').onclick = close;
    o.querySelector('[data-a=share]').onclick = async () => {
      try {
        const file = new File([blob], p.name || 'photo.jpg', { type: p.mime || blob.type });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
        else toast('المشاركة المباشرة مو مدعومة هنا. استعمل «تنزيل»', true);
      } catch (e) { if (e.name !== 'AbortError') toast('استعمل «تنزيل» بدل المشاركة', true); }
    };
    const del = o.querySelector('[data-a=del]');
    if (del) del.onclick = async () => {
      if (!confirm('تحذف هاي الصورة نهائياً؟')) return;
      await busy(async () => {
        await deleteRecord('photo', p.id);
        close();
        delete PHOTO_CACHE[ck];
        const cur = S.stack[S.stack.length - 1]; render(cur.name, cur.arg);
        toast('انحذفت ✔');
      });
    };
  });
}

// اختيار الصور: تصغير على الجهاز قبل الرفع (أسرع وأوفر بالمساحة)
const PENDING = {};
function pickerHtml(key) {
  PENDING[key] = [];
  return `<label>الصور / الملفات</label>
    <div class="pick">
      <label class="btn">📷 كاميرا<input type="file" accept="image/*" capture="environment" class="hidden" onchange="addFiles('${key}', this)"></label>
      <label class="btn">🖼 من المعرض / ملف<input type="file" accept="image/*,application/pdf" multiple class="hidden" onchange="addFiles('${key}', this)"></label>
    </div>
    <div class="prev" id="pv_${key}"></div>`;
}
async function addFiles(key, input) {
  const files = Array.from(input.files || []);
  input.value = '';
  loading(true, 'جاري تجهيز الصور…');
  for (const f of files) {
    try {
      let item;
      if (f.type.indexOf('image/') === 0) {
        const main = await shrink(f, 1600, 0.8);
        const thumb = await shrink(f, 360, 0.7);
        item = { name: f.name.replace(/\.[^.]+$/, '') + '.jpg', mime: 'image/jpeg', blob: main, thumb };
      } else if (f.type === 'application/pdf') {
        item = { name: f.name, mime: f.type, blob: f, thumb: null };
      } else { toast('نوع الملف غير مدعوم: ' + f.name, true); continue; }
      if (item.blob.size > 15e6) { toast('الملف ' + f.name + ' كبير بزايد', true); continue; }
      item.preview = item.thumb ? URL.createObjectURL(item.thumb) : '';
      PENDING[key].push(item);
    } catch (e) { toast('ما كدرت أقرا ' + f.name, true); }
  }
  loading(false);
  drawPrev(key);
}
function drawPrev(key) {
  $('pv_' + key).innerHTML = PENDING[key].map((f, i) => `<div style="${f.preview ? `background-image:url('${f.preview}')` : ''}">${f.preview ? '' : '📄'}<b onclick="PENDING['${key}'].splice(${i},1);drawPrev('${key}')">✕</b></div>`).join('');
}
function shrink(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > max) { const k = max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(u);
      c.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); };
    img.src = u;
  });
}
function uid() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }

async function uploadFiles(kind, key, files) {
  if (!files || !files.length) return 0;
  let done = 0;
  const one = async (f) => {
    const id = uid(), ext = f.mime === 'application/pdf' ? 'pdf' : 'jpg';
    const path = `${kind}/${id}.${ext}`;
    const thumbPath = f.thumb ? `${kind}/${id}_t.jpg` : null;
    const st = sb.storage.from('photos');
    const a = await st.upload(path, f.blob, { contentType: f.mime, cacheControl: '31536000', upsert: false });
    if (a.error) throw a.error;
    if (thumbPath) {
      const b = await st.upload(thumbPath, f.thumb, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (b.error) throw b.error;
    }
    const r = await sb.from('photos').insert({ kind, key, path, thumb_path: thumbPath, name: f.name, mime: f.mime, size: f.blob.size, created_by: S.user.id });
    if (r.error) throw r.error;
    done++;
    $('loaderMsg').textContent = `رفع الصور ${done} / ${files.length}`;
  };
  // 3 بنفس الوقت
  const queue = files.slice();
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => { while (queue.length) await one(queue.shift()); });
  await Promise.all(workers);
  delete PHOTO_CACHE[kind + ':' + key];
  return done;
}

async function deleteRecord(kind, key) {
  const r = await rpc('delete_record', { p_kind: kind, p_key: String(key) });
  const paths = (r && r.paths) || [];
  if (paths.length) await sb.storage.from('photos').remove(paths);
}

// ---------- صفحة الزبون ----------
function warrChip(s) { return s === 'ساري' ? 'ok' : s === 'منتهي' ? 'bad' : s ? 'warn' : ''; }
function maintChip(s) { return s === 'منجزة' ? 'ok' : s ? 'warn' : ''; }

function pgCustomer(V, phone) {
  const B = S.boot, c = B.byPhone[phone];
  if (!c) { V.innerHTML = backLink() + `<div class="card"><div class="empty">ما لكيت هذا الزبون. اضغط ⟳ للتحديث.</div></div>`; return; }
  const sales = B.sales.filter((s) => s.p === phone);
  const maint = B.maint.filter((m) => m.p === phone).slice().reverse();
  const wa = 'https://wa.me/964' + c.p.slice(1);
  const ini = (String(c.n).replace(/^د\.\s*/, '').trim()[0] || '?');
  V.innerHTML = `${backLink()}
  <div class="card">
    <div class="ph"><div class="av">${esc(ini)}</div>
      <div class="grow"><h2>${esc(c.n)}</h2><div class="s" style="color:var(--muted)">${esc([c.c, c.prov].filter(Boolean).join(' · '))}</div>
      ${c.st ? `<span class="chip" style="margin-top:4px">${esc(c.st)}</span>` : ''}</div></div>
    <div class="actions">
      <a class="btn" href="tel:${esc(c.p)}">📞 اتصال</a>
      <button class="btn wa" onclick="openLink('${esc(wa)}')">💬 واتساب</button>
      ${c.folder ? `<button class="btn" onclick="openLink('${esc(c.folder)}')">📁 المجلد القديم</button>` : ''}
    </div>
    ${canEdit() ? `<div class="actions">
      <button class="btn pri" onclick="push('fSale', {phone:'${esc(c.p)}'})">💰 بيع جهاز</button>
      <button class="btn pri" onclick="push('fMaint', {phone:'${esc(c.p)}'})">🔧 صيانة</button>
      <button class="btn" onclick="addPhotosSheet('customer','${esc(c.p)}')">📷 صور</button>
      <button class="btn" onclick="push('fCustomer', '${esc(c.p)}')">✏️ تعديل</button>
      <button class="btn" onclick="touch('${esc(c.p)}')">🕒 تواصلت اليوم</button>
      ${isAdmin() ? `<button class="btn del" onclick="delCustomer('${esc(c.p)}')">🗑</button>` : ''}
    </div>` : ''}
  </div>
  <div class="card"><div class="kv">
    <div>الهاتف</div><div dir="ltr" style="text-align:right">${esc(c.p)}</div>
    <div>نوع الزبون</div><div>${esc(c.t || '—')}</div>
    <div>العنوان</div><div>${esc(c.addr || '—')}</div>
    <div>المصدر</div><div>${esc(c.src || '—')}</div>
    <div>أول تواصل</div><div>${esc(c.first || '—')}</div>
    <div>آخر تواصل</div><div>${esc(c.last || '—')}</div>
    ${canEdit() ? `<div>المتبقي عليه</div><div>${esc(c.remUsd)} $ · ${esc(c.remIqd)} د.ع</div>` : ''}
    <div>ملاحظات</div><div style="white-space:pre-wrap">${esc(c.notes || '—')}</div>
  </div></div>

  <div class="sec">📦 الأجهزة (${sales.length})</div>
  <div class="card">${sales.length ? sales.map((s) => `
    <div class="mini"><div class="row"><b style="cursor:pointer" onclick="push('device', ${esc(JSON.stringify(s.dev))})">${esc(s.dev)}</b><span class="chip ${warrChip(s.st)}">${esc(s.st ? 'الضمان: ' + s.st : 'بدون ضمان')}</span></div>
    <div class="s" style="color:var(--muted);font-size:13px">سيريال: ${esc(s.serial)} · بيع ${esc(s.date)}${s.end ? ' · ينتهي ' + esc(s.end) : ''}</div>
    ${canEdit() ? `<div style="font-size:13px">السعر ${esc(s.price)} ${esc(s.cur)} · المدفوع ${esc(s.paid)} · <b>المتبقي ${esc(s.rem)}</b></div>` : ''}
    ${s.notes ? `<div style="font-size:13px">${esc(s.notes)}</div>` : ''}
    ${isAdmin() ? `<div class="actions"><button class="btn del sm" onclick="delRow('sale', ${s.row}, 'البيع: ' + ${esc(JSON.stringify(s.serial))})">🗑 حذف البيع</button></div>` : ''}</div>`).join('') : '<div class="empty">ما كو أجهزة مسجّلة</div>'}</div>

  <div class="sec">🔧 الصيانة (${maint.length})</div>
  <div class="card">${maint.length ? maint.map(maintHtml).join('') : '<div class="empty">ما كو صيانات</div>'}</div>

  <div class="sec">🖼 الصور</div>
  <div class="card">${photosBox('customer', c.p)}</div>`;
}
function maintHtml(m) {
  return `<div class="mini"><div class="row"><b>${esc(m.date)} · ${esc(m.type || 'صيانة')}</b>
    <span class="chip ${maintChip(m.st)}">${esc(m.st || '')}</span></div>
    <div style="font-size:13.5px">${esc(m.dev || '')}${m.serial ? ' · ' + esc(m.serial) : ''}</div>
    <div style="font-size:13.5px"><span style="color:var(--muted)">المشكلة:</span> ${esc(m.prob)}</div>
    ${m.sol ? `<div style="font-size:13.5px"><span style="color:var(--muted)">الحل:</span> ${esc(m.sol)}</div>` : ''}
    ${m.parts ? `<div style="font-size:13.5px"><span style="color:var(--muted)">القطع:</span> ${esc(m.parts)}</div>` : ''}
    ${canEdit() && m.cost ? `<div style="font-size:13px">الكلفة ${esc(m.cost)} ${esc(m.cur)}${m.paid ? ' · المدفوع ' + esc(m.paid) : ''}</div>` : ''}
    <div class="actions">
      ${canEdit() && m.st !== 'منجزة' ? `<button class="btn ok sm" onclick="maintDone(${m.row})">✔ صارت منجزة</button>` : ''}
      ${isAdmin() ? `<button class="btn del sm" onclick="delRow('maint', ${m.row}, 'هاي الصيانة')">🗑</button>` : ''}
    </div></div>`;
}
async function touch(phone) {
  if (!confirm('تسجّل إنه تواصلت ويا هذا الزبون اليوم؟')) return;
  await busy(async () => { await rpc('touch_contact', { p_phone: phone }); await loadAll(); toast('تم'); render('customer', phone); });
}
async function maintDone(row) {
  if (!confirm('تأكيد: الصيانة صارت منجزة؟')) return;
  await busy(async () => {
    await rpc('set_maint_status', { p_id: row, p_status: 'منجزة' });
    await loadAll(); toast('تم');
    const cur = S.stack[S.stack.length - 1]; render(cur.name, cur.arg);
  });
}
async function delRow(kind, id, label) {
  if (!confirm('تحذف ' + label + ' نهائياً؟ ما يرجع.')) return;
  await busy(async () => {
    await deleteRecord(kind, id);
    await loadAll(); toast('انحذف ✔');
    const cur = S.stack[S.stack.length - 1]; render(cur.name, cur.arg);
  });
}
async function delCustomer(phone) {
  const c = S.boot.byPhone[phone];
  if (!confirm('تحذف الزبون ' + (c ? c.n : phone) + ' وكل صوره نهائياً؟')) return;
  await busy(async () => { await deleteRecord('customer', phone); await reloadData(); toast('انحذف ✔'); go('home'); });
}
async function delDevice(name) {
  if (!confirm('تحذف الجهاز ' + name + ' من الكتالوج وكل صوره نهائياً؟')) return;
  await busy(async () => { await deleteRecord('device', name); await reloadData(); toast('انحذف ✔'); go('devices'); });
}

// ---------- الأجهزة ----------
function pgDevice(V, name) {
  const B = S.boot, d = B.byDev[name];
  if (!d) { V.innerHTML = backLink() + `<div class="card"><div class="empty">ما لكيت هذا الجهاز. اضغط ⟳ للتحديث.</div></div>`; return; }
  const sold = B.sales.filter((s) => s.dev === name);
  const k = esc(JSON.stringify(d.n));
  V.innerHTML = `${backLink()}
  <div class="card"><div class="ph"><div class="av">📦</div><div class="grow"><h2>${esc(d.n)}</h2>
    <div style="color:var(--muted)">${esc([d.t, d.maker, d.sup].filter(Boolean).join(' · '))}</div></div></div>
    <div class="actions">
      ${canEdit() ? `<button class="btn" onclick="addPhotosSheet('device', ${k})">📷 صور</button>
      <button class="btn" onclick="push('fDevice', ${k})">✏️ تعديل</button>` : ''}
      ${d.folder ? `<button class="btn" onclick="openLink('${esc(d.folder)}')">📁 المجلد القديم</button>` : ''}
      ${d.manual ? `<button class="btn" onclick="openLink('${esc(d.manual)}')">📘 الكتيّب</button>` : ''}
      ${isAdmin() ? `<button class="btn del" onclick="delDevice(${k})">🗑</button>` : ''}
    </div>
  </div>
  <div class="card"><div class="kv">
    ${canEdit() ? `<div>سعر الشراء</div><div>${esc(d.buy || '—')} ${esc(d.cur)}</div>` : ''}
    <div>سعر البيع</div><div>${esc(d.sell || '—')} ${esc(d.cur)}</div>
    <div>الضمان</div><div>${esc(d.w ? d.w + ' شهر' : '—')}</div>
    <div>عدد المباع</div><div>${esc(d.sold)}</div>
    <div>عدد الصيانات</div><div>${esc(d.nMaint)}</div>
    <div>ملاحظات / براميترات</div><div style="white-space:pre-wrap">${esc(d.notes || '—')}</div>
  </div></div>
  <div class="sec">🖼 الصور</div>
  <div class="card">${photosBox('device', d.n)}</div>
  <div class="sec">👥 منو اشترى هذا الجهاز (${sold.length})</div>
  <div class="card list">${sold.length ? sold.map((s) => itemHtml({ type: 'customer', key: s.p, title: s.name, sub: s.serial + ' · ' + s.date, tag: s.st })).join('') : '<div class="empty">ما كو</div>'}</div>`;
}
function pgDevices(V) {
  const list = S.boot.devices;
  V.innerHTML = `<div class="search"><input id="dq" type="search" placeholder="🔍 فلترة الموديلات"></div><div class="card list" id="dl"></div>`;
  const draw = (f) => {
    const r = list.filter((d) => !f || (d.n + ' ' + d.t + ' ' + d.maker).toLowerCase().indexOf(f.toLowerCase()) > -1);
    $('dl').innerHTML = r.length ? r.map((d) => itemHtml({ type: 'device', key: d.n, title: d.n, sub: [d.t, d.maker].filter(Boolean).join(' · '), tag: 'مباع ' + (d.sold || 0) })).join('')
      : `<div class="empty">ما كو موديلات${canEdit() ? '. اضغط + ثم «جهاز بالكتالوج»' : ''}</div>`;
  };
  draw('');
  $('dq').oninput = (e) => draw(e.target.value.trim());
}

// ---------- الصيانة ----------
function pgMaint(V) {
  const r = S.boot.maint.filter((m) => m.st && m.st !== 'منجزة');
  V.innerHTML = `<div class="sec">الصيانات المفتوحة (${r.length})</div><div class="card">${r.length ? r.map((m) => `<div class="mini">
    <div class="row"><b style="cursor:pointer" onclick="push('customer','${esc(m.p)}')">${esc(m.name || m.p)} ←</b><span class="chip warn">${esc(m.st)}</span></div>
    <div style="font-size:13.5px">${esc(m.date)} · ${esc(m.dev)} · ${esc(m.type)}</div>
    <div style="font-size:13.5px">${esc(m.prob)}</div>
    ${canEdit() ? `<div class="actions"><button class="btn ok sm" onclick="maintDone(${m.row})">✔ صارت منجزة</button></div>` : ''}</div>`).join('')
    : '<div class="empty">ما كو صيانات مفتوحة 👌</div>'}</div>`;
}

// ---------- القوائم المنبثقة ----------
function addMenu() {
  sheet(`<div class="menu">
    <button onclick="closeSheet();push('fCustomer')"><span style="font-size:22px">👤</span> زبون جديد</button>
    <button onclick="closeSheet();push('fSale')"><span style="font-size:22px">💰</span> بيع جهاز</button>
    <button onclick="closeSheet();push('fMaint')"><span style="font-size:22px">🔧</span> صيانة</button>
    <button onclick="closeSheet();push('fDevice')"><span style="font-size:22px">📦</span> جهاز بالكتالوج</button>
  </div>`);
}
function sheet(html) { $('ovl').innerHTML = `<div class="ov" onclick="if(event.target===this)closeSheet()"><div class="pan">${html}</div></div>`; }
function closeSheet() { $('ovl').innerHTML = ''; }

// ---------- النماذج ----------
function opts(listName, sel) {
  const L = (S.boot.lists[listName] || []);
  const extra = sel && L.indexOf(sel) < 0 ? [sel] : [];
  return `<option value=""></option>` + L.concat(extra).map((v) => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
}
function dl(id, arr) { return `<datalist id="${id}">${arr.map(([v, l]) => `<option value="${esc(v)}">${esc(l || '')}</option>`).join('')}</datalist>`; }
function val(id) { const e = $(id); return e ? e.value.trim() : ''; }
function todayStr() { return S.boot.today; }
function confirmSave(title, lines, onOk) {
  sheet(`<h2>${esc(title)}</h2>
    <div class="kv">${lines.filter((l) => l[1] !== '' && l[1] != null).map(([k, v]) => `<div>${esc(k)}</div><div>${esc(v)}</div>`).join('')}</div>
    <div class="actions" style="margin-top:16px"><button class="btn ok" id="cfOk">✔ تأكيد الحفظ</button><button class="btn" onclick="closeSheet()">رجوع للتعديل</button></div>`);
  $('cfOk').onclick = () => { closeSheet(); onOk(); };
}
async function saveWithPhotos(saveFn, kind, keyOf, files) {
  const r = await saveFn();
  let n = 0;
  if (files && files.length) {
    try { n = await uploadFiles(kind, keyOf(r), files); }
    catch (e) { toast('انحفظت البيانات، بس رفع الصور فشل: ' + errMsg(e), true); }
  }
  await loadAll();
  return { r, n };
}

function fCustomer(V, phone) {
  const x = phone ? S.boot.byPhone[phone] : null;
  const ed = !!x;
  const c = x ? { phone: x.p, name: x.n, clinic: x.c, ctype: x.t, prov: x.prov, addr: x.addr, source: x.src, status: x.st, notes: x.notes } : {};
  V.innerHTML = `${backLink()}<div class="card f"><h2>${ed ? '✏️ تعديل زبون' : '👤 زبون جديد'}</h2>
    <label class="req">رقم الهاتف</label><input id="cPhone" inputmode="tel" dir="ltr" placeholder="07XXXXXXXXX" value="${esc(c.phone || '')}" ${ed ? 'readonly' : ''}>
    <label class="req">الاسم</label><input id="cName" value="${esc(c.name || '')}">
    <label>العيادة / المركز</label><input id="cClinic" value="${esc(c.clinic || '')}">
    <div class="two"><div><label>نوع الزبون</label><select id="cType">${opts('نوع الزبون', c.ctype)}</select></div>
      <div><label>المحافظة</label><select id="cProv">${opts('المحافظة', c.prov)}</select></div></div>
    <label>العنوان</label><input id="cAddr" value="${esc(c.addr || '')}">
    <div class="two"><div><label>مصدر الزبون</label><select id="cSource">${opts('مصدر الزبون', c.source)}</select></div>
      <div><label>الحالة</label><select id="cStatus">${opts('حالة الزبون', c.status || 'مهتم')}</select></div></div>
    <label>ملاحظات</label><textarea id="cNotes">${esc(c.notes || '')}</textarea>
    ${pickerHtml('cust')}
    <button class="btn pri block" style="margin-top:16px" id="cSave">حفظ</button></div>`;
  $('cSave').onclick = () => {
    const d = { mode: ed ? 'edit' : 'new', phone: val('cPhone'), name: val('cName'), clinic: val('cClinic'), ctype: val('cType'), prov: val('cProv'),
      addr: val('cAddr'), source: val('cSource'), status: val('cStatus'), notes: val('cNotes') };
    const files = PENDING.cust;
    if (!d.phone || !d.name) return toast('الرقم والاسم ضروريات', true);
    confirmSave(ed ? 'تأكيد تعديل الزبون' : 'تأكيد إضافة زبون', [['الهاتف', d.phone], ['الاسم', d.name], ['العيادة', d.clinic], ['المحافظة', d.prov], ['الحالة', d.status], ['الصور', files.length || '']], async () => {
      await busy(async () => {
        const { r, n } = await saveWithPhotos(() => rpc('save_customer', { d }), 'customer', (r) => r.phone, files);
        toast('تم الحفظ ✔' + (n ? ' مع ' + n + ' صورة' : ''));
        S.stack.pop(); if (!ed) S.stack = [{ name: 'home' }];
        push('customer', r.phone);
      }, 'جاري الحفظ…');
    });
  };
}

function fSale(V, pre) {
  pre = pre || {};
  V.innerHTML = `${backLink()}<div class="card f"><h2>💰 بيع جهاز</h2>
    <label class="req">رقم الزبون</label><input id="sPhone" list="dlPhones" inputmode="tel" dir="ltr" value="${esc(pre.phone || '')}" placeholder="اكتب الرقم أو الاسم">
    <div id="sWho" style="font-size:13px;color:var(--muted);margin-top:4px"></div>
    <label class="req">الجهاز / الموديل</label><input id="sDev" list="dlDevs">
    <label class="req">السيريال</label><input id="sSerial" dir="ltr">
    <div class="two"><div><label>تاريخ البيع</label><input id="sDate" type="date" value="${todayStr()}"></div>
      <div><label>الضمان (أشهر)</label><input id="sWarr" inputmode="numeric"></div></div>
    <div class="two"><div><label>سعر البيع</label><input id="sPrice" inputmode="decimal"></div>
      <div><label>العملة</label><select id="sCur">${opts('العملة', '$')}</select></div></div>
    <label>المدفوع</label><input id="sPaid" inputmode="decimal">
    <label>ملاحظات</label><textarea id="sNotes"></textarea>
    ${pickerHtml('sale')}
    <div style="font-size:12.5px;color:var(--muted);margin-top:6px">الصور تنحفظ بملف الزبون.</div>
    <button class="btn pri block" style="margin-top:16px" id="sSave">حفظ البيع</button></div>
    ${dl('dlPhones', S.boot.customers.map((c) => [c.p, c.n + (c.c ? ' · ' + c.c : '')]))}
    ${dl('dlDevs', S.boot.devices.map((d) => [d.n, d.t]))}`;
  const who = () => {
    const p = val('sPhone'); const c = S.boot.customers.find((x) => x.p === p || x.n === p);
    if (c && c.p !== p) $('sPhone').value = c.p;
    $('sWho').textContent = c ? '👤 ' + c.n : (p ? '⚠️ رقم غير مسجّل' : '');
  };
  $('sPhone').oninput = who; who();
  $('sDev').oninput = () => {
    const d = S.boot.devices.find((x) => x.n === val('sDev'));
    if (d && d.w && !val('sWarr')) $('sWarr').value = d.w;
    if (d && d.sell && !val('sPrice') && canEdit()) { $('sPrice').value = String(d.sell).replace(/,/g, ''); $('sCur').value = d.cur; }
  };
  $('sSave').onclick = () => {
    const d = { phone: val('sPhone'), device: val('sDev'), serial: val('sSerial'), date: val('sDate'), warranty: val('sWarr'),
      price: val('sPrice'), cur: val('sCur'), paid: val('sPaid'), notes: val('sNotes') };
    const files = PENDING.sale;
    if (!d.phone || !d.device || !d.serial) return toast('الرقم والجهاز والسيريال ضروريات', true);
    const c = S.boot.customers.find((x) => x.p === d.phone);
    confirmSave('تأكيد البيع', [['الزبون', c ? c.n : d.phone], ['الجهاز', d.device], ['السيريال', d.serial], ['التاريخ', d.date], ['السعر', d.price && (d.price + ' ' + d.cur)], ['المدفوع', d.paid], ['الضمان', d.warranty && d.warranty + ' شهر'], ['الصور', files.length || '']], async () => {
      await busy(async () => {
        const { r } = await saveWithPhotos(() => rpc('save_sale', { d }), 'customer', (r) => r.phone, files);
        toast('تم حفظ البيع ✔');
        S.stack.pop(); push('customer', r.phone);
      }, 'جاري الحفظ…');
    });
  };
}

function fMaint(V, pre) {
  pre = pre || {};
  V.innerHTML = `${backLink()}<div class="card f"><h2>🔧 صيانة</h2>
    <label>السيريال (إذا الجهاز من مبيعاتنا يكمّل الباقي وحده)</label><input id="mSerial" list="dlSer" dir="ltr">
    <label class="req">رقم الزبون</label><input id="mPhone" list="dlPhones" inputmode="tel" dir="ltr" value="${esc(pre.phone || '')}" placeholder="اكتب الرقم أو الاسم">
    <div id="mWho" style="font-size:13px;color:var(--muted);margin-top:4px"></div>
    <label>الجهاز / الموديل</label><input id="mDev" list="dlDevs">
    <div class="two"><div><label>التاريخ</label><input id="mDate" type="date" value="${todayStr()}"></div>
      <div><label>نوع الخدمة</label><select id="mType">${opts('نوع الخدمة', 'صيانة عطل')}</select></div></div>
    <label class="req">المشكلة</label><textarea id="mProb"></textarea>
    <label>الحل</label><textarea id="mSol"></textarea>
    <label>القطع المستخدمة</label><input id="mParts">
    <div class="two"><div><label>الكلفة</label><input id="mCost" inputmode="decimal"></div>
      <div><label>العملة</label><select id="mCur">${opts('العملة', '$')}</select></div></div>
    <div class="two"><div><label>المدفوع</label><input id="mPaid" inputmode="decimal"></div>
      <div><label>الحالة</label><select id="mStatus">${opts('حالة الصيانة', 'مفتوحة')}</select></div></div>
    <label>ملاحظات</label><textarea id="mNotes"></textarea>
    ${pickerHtml('maint')}
    <div style="font-size:12.5px;color:var(--muted);margin-top:6px">الصور تنحفظ بملف الزبون.</div>
    <button class="btn pri block" style="margin-top:16px" id="mSave">حفظ الصيانة</button></div>
    ${dl('dlPhones', S.boot.customers.map((c) => [c.p, c.n + (c.c ? ' · ' + c.c : '')]))}
    ${dl('dlDevs', S.boot.devices.map((d) => [d.n, d.t]))}
    ${dl('dlSer', S.boot.serials.map((s) => [s.s, s.d]))}`;
  const who = () => {
    const p = val('mPhone'); const c = S.boot.customers.find((x) => x.p === p || x.n === p);
    if (c && c.p !== p) $('mPhone').value = c.p;
    $('mWho').textContent = c ? '👤 ' + c.n : (p ? '⚠️ رقم غير مسجّل. سجّله أول كزبون' : '');
  };
  $('mPhone').oninput = who; who();
  $('mSerial').oninput = () => {
    const s = S.boot.serials.find((x) => x.s.toLowerCase() === val('mSerial').toLowerCase());
    if (s) { $('mPhone').value = s.p; $('mDev').value = s.d; who(); }
  };
  $('mSave').onclick = () => {
    const d = { serial: val('mSerial'), phone: val('mPhone'), device: val('mDev'), date: val('mDate'), type: val('mType'), problem: val('mProb'),
      solution: val('mSol'), parts: val('mParts'), cost: val('mCost'), cur: val('mCur'), paid: val('mPaid'), status: val('mStatus'), notes: val('mNotes') };
    const files = PENDING.maint;
    if (!d.phone || !d.problem) return toast('رقم الزبون والمشكلة ضروريات', true);
    const c = S.boot.customers.find((x) => x.p === d.phone);
    confirmSave('تأكيد الصيانة', [['الزبون', c ? c.n : d.phone], ['الجهاز', d.device], ['السيريال', d.serial], ['النوع', d.type], ['المشكلة', d.problem], ['الحالة', d.status], ['الكلفة', d.cost && d.cost + ' ' + d.cur], ['الصور', files.length || '']], async () => {
      await busy(async () => {
        const { r } = await saveWithPhotos(() => rpc('save_maint', { d }), 'customer', (r) => r.phone, files);
        toast('تم حفظ الصيانة ✔');
        S.stack.pop(); push('customer', r.phone);
      }, 'جاري الحفظ…');
    });
  };
}

function fDevice(V, devName) {
  const y = devName ? S.boot.byDev[devName] : null;
  const ed = !!y;
  const d = y ? { name: y.n, type: y.t, maker: y.maker, supplier: y.sup, buy: y.buy, sell: y.sell, cur: y.cur, warranty: y.w, manual: y.manual, notes: y.notes } : {};
  const n = (x) => String(x || '').replace(/,/g, '');
  V.innerHTML = `${backLink()}<div class="card f"><h2>${ed ? '✏️ تعديل جهاز' : '📦 جهاز بالكتالوج'}</h2>
    <label class="req">اسم الجهاز / الموديل</label><input id="dName" value="${esc(d.name || '')}" ${ed ? 'readonly' : ''}>
    <div class="two"><div><label>النوع</label><select id="dType">${opts('نوع الجهاز', d.type)}</select></div>
      <div><label>الشركة المصنعة</label><input id="dMaker" value="${esc(d.maker || '')}"></div></div>
    <label>المورد / البلد</label><input id="dSup" value="${esc(d.supplier || '')}">
    <div class="two"><div><label>سعر الشراء</label><input id="dBuy" inputmode="decimal" value="${esc(n(d.buy))}"></div>
      <div><label>سعر البيع</label><input id="dSell" inputmode="decimal" value="${esc(n(d.sell))}"></div></div>
    <div class="two"><div><label>العملة</label><select id="dCur">${opts('العملة', d.cur || '$')}</select></div>
      <div><label>الضمان الافتراضي (أشهر)</label><input id="dWarr" inputmode="numeric" value="${esc(d.warranty || '')}"></div></div>
    <label>رابط الكتيّب (اختياري)</label><input id="dMan" dir="ltr" value="${esc(d.manual || '')}">
    <label>ملاحظات / براميترات</label><textarea id="dNotes">${esc(d.notes || '')}</textarea>
    ${pickerHtml('dev')}
    <button class="btn pri block" style="margin-top:16px" id="dSave">حفظ</button></div>`;
  $('dSave').onclick = () => {
    const x = { mode: ed ? 'edit' : 'new', name: val('dName'), type: val('dType'), maker: val('dMaker'), supplier: val('dSup'), buy: val('dBuy'), sell: val('dSell'),
      cur: val('dCur'), warranty: val('dWarr'), manual: val('dMan'), notes: val('dNotes') };
    const files = PENDING.dev;
    if (!x.name) return toast('اكتب اسم الجهاز', true);
    confirmSave(ed ? 'تأكيد تعديل الجهاز' : 'تأكيد إضافة جهاز', [['الموديل', x.name], ['النوع', x.type], ['سعر البيع', x.sell && x.sell + ' ' + x.cur], ['الضمان', x.warranty && x.warranty + ' شهر'], ['الصور', files.length || '']], async () => {
      await busy(async () => {
        const { r } = await saveWithPhotos(() => rpc('save_device', { d: x }), 'device', (r) => r.name, files);
        toast('تم الحفظ ✔');
        S.stack.pop(); push('device', r.name);
      }, 'جاري الحفظ…');
    });
  };
}

function addPhotosSheet(kind, key) {
  sheet(`<h2>📷 إضافة صور</h2><div class="f">${pickerHtml('quick')}</div>
    <div class="actions" style="margin-top:14px"><button class="btn ok" id="qpOk">رفع</button><button class="btn" onclick="closeSheet()">إلغاء</button></div>`);
  $('qpOk').onclick = async () => {
    if (!PENDING.quick.length) return toast('اختار صور أول', true);
    const files = PENDING.quick;
    closeSheet();
    await busy(async () => {
      const n = await uploadFiles(kind, key, files);
      toast('تم رفع ' + n + ' ملف ✔');
      render(kind, key);
    }, 'جاري الرفع…');
  };
}

// ---------- إدارة المستخدمين (المدير) ----------
const ROLE_NAMES = { pending: '⏳ بانتظار الموافقة', viewer: '👁 عرض فقط', editor: '✏️ عرض وتعديل', admin: '👑 مدير' };
$('adminBtn').onclick = () => usersSheet();
async function usersSheet() {
  await busy(async () => {
    const users = await rpc('list_users');
    sheet(`<h2>👥 المستخدمين</h2>
      <div style="font-size:13px;color:var(--muted);margin-bottom:6px">الموظف يسجّل حساب من شاشة الدخول، وإنت تختار صلاحيته هنا.</div>
      ${users.map((u) => `<div class="urow"><div class="grow"><b>${esc(u.name)}</b><div class="s" style="color:var(--muted);font-size:12.5px" dir="ltr">${esc(u.email)}</div></div>
        <select data-id="${esc(u.id)}" data-old="${esc(u.role)}" ${u.id === S.me.id ? 'disabled' : ''}>${Object.keys(ROLE_NAMES).map((r) => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${ROLE_NAMES[r]}</option>`).join('')}</select></div>`).join('')}
      <div class="actions" style="margin-top:14px"><button class="btn" onclick="auditSheet()">📜 سجل التعديلات</button><button class="btn" onclick="closeSheet()">إغلاق</button></div>`);
    $('ovl').querySelectorAll('select[data-id]').forEach((sel) => {
      sel.onchange = async () => {
        if (!confirm('تغيّر الصلاحية إلى: ' + ROLE_NAMES[sel.value] + '؟')) { sel.value = sel.dataset.old; return; }
        await busy(async () => { await rpc('set_user_role', { p_id: sel.dataset.id, p_role: sel.value }); sel.dataset.old = sel.value; toast('تم ✔'); });
      };
    });
  });
}
async function auditSheet() {
  await busy(async () => {
    const rows = await rpc('audit_recent', { p_limit: 150 });
    const brief = (d) => {
      if (!d) return '';
      const parts = [d.name, d.phone, d.device, d.serial, d.status].filter(Boolean);
      return parts.join(' · ');
    };
    sheet(`<h2>📜 آخر التعديلات</h2>${rows.length ? rows.map((r) => `<div class="audit"><b>${esc(r.action)}</b> · ${esc(r.who || '')} <span style="color:var(--muted)">${esc(r.at)}</span><div>${esc(brief(r.detail))}</div></div>`).join('') : '<div class="empty">ما كو</div>'}
      <div class="actions" style="margin-top:14px"><button class="btn" onclick="usersSheet()">→ رجوع</button></div>`);
  });
}

// ---------- التثبيت على التلفون ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').classList.remove('hidden'); });
$('installBtn').onclick = async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice.catch(() => {});
  installEvt = null; $('installBtn').classList.add('hidden');
};
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ---------- البداية ----------
(function init() {
  netState();
  if (!sb) { showOnly('noconfig'); return; }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { setTimeout(newPasswordSheet, 300); return; }
    if (event === 'SIGNED_IN' && session && (!S.user || S.user.id !== session.user.id)) { S.stack = []; setTimeout(() => enter(), 0); }
    if (event === 'SIGNED_OUT') { showOnly('login'); }
  });
  enter();
})();
