import { get, post, getToken } from './api.js';
import { html, mount, $, $$, errorToast, loading, ago } from './ui.js';
import { state, onChange, refreshMe, logoutLocal, navigate } from './store.js';
import * as home from './pages/home.js';
import * as topics from './pages/topics.js';
import * as pollPages from './pages/polls.js';
import * as people from './pages/people.js';
import * as system from './pages/system.js';

const routes = [
  [/^$/, home.feed],
  [/^konular$/, topics.list],
  [/^konu\/(\d+)$/, topics.detail],
  [/^yeni-konu$/, topics.create],
  [/^oylamalar$/, pollPages.list],
  [/^oylama\/(\d+)$/, pollPages.detail],
  [/^graf$/, people.graph],
  [/^bilirkisi$/, people.experts],
  [/^uye\/([\w.-]+)$/, people.user],
  [/^profil$/, people.profile],
  [/^giris$/, people.login],
  [/^kayit$/, people.register],
  [/^defter$/, system.ledger],
  [/^yonetmelik$/, system.regulation],
  [/^hakkinda$/, home.about],
];

const app = document.getElementById('app');
let navId = 0;

async function route() {
  const id = ++navId;
  const hash = location.hash.replace(/^#\/?/, '');
  const [path, qs] = hash.split('?');
  const query = new URLSearchParams(qs || '');
  const first = path.split('/')[0];
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === first || (first === 'konu' && a.dataset.nav === 'konular') || (first === 'oylama' && a.dataset.nav === 'oylamalar')));
  $('#nav').classList.remove('open');
  document.getElementById('dropdown')?.remove();
  const match = routes.find(([re]) => re.test(path));
  const ctx = {
    params: match ? path.match(match[0]).slice(1) : [],
    query,
    alive: () => id === navId,
    render: (view) => { if (id === navId) mount(app, view); },
    reload: () => route(),
  };
  if (!match) return ctx.render(html`<div class="card empty"><h2>Sayfa bulunamadı</h2><a class="btn" href="#/">Akışa dön</a></div>`);
  ctx.render(loading());
  window.scrollTo({ top: 0 });
  try {
    await match[1](ctx);
  } catch (err) {
    console.error(err);
    ctx.render(html`<div class="card empty"><h2>Bir sorun oluştu</h2><p>${err.message}</p><button class="btn" onclick="location.reload()">Yeniden dene</button></div>`);
  }
}

function renderTopActions() {
  const box = document.getElementById('top-actions');
  if (state.me) {
    mount(box, html`
      <button class="icon-btn" id="bell" aria-label="Bildirimler">🔔${state.unread ? html`<span class="dot">${state.unread > 9 ? '9+' : state.unread}</span>` : ''}</button>
      <a class="btn small" href="#/profil">@${state.me.nickname}</a>
      <button class="btn small ghost hide-sm" id="logout">Çıkış</button>`);
    $('#logout').onclick = async () => {
      try { await post('/auth/logout'); } catch { /* yoksay */ }
      logoutLocal();
      navigate('#/');
    };
    $('#bell').onclick = toggleNotifications;
  } else {
    mount(box, html`<a class="btn small ghost" href="#/giris">Giriş</a><a class="btn small primary" href="#/kayit">Kayıt ol</a>`);
  }
}

async function toggleNotifications() {
  const existing = document.getElementById('dropdown');
  if (existing) return existing.remove();
  const box = document.createElement('div');
  box.id = 'dropdown';
  box.className = 'dropdown';
  box.innerHTML = String(loading());
  document.body.appendChild(box);
  try {
    const n = await get('/me/notifications');
    box.innerHTML = String(n.liste.length
      ? html`${n.liste.map((x) => html`<a class="item ${x.is_read ? '' : 'unread'}" href="${x.link || '#/'}">${x.text}<br><small>${ago(x.created_at)}</small></a>`)}`
      : html`<div class="empty">Bildirim yok</div>`);
    box.addEventListener('click', (e) => { if (e.target.closest('a')) box.remove(); });
    if (n.okunmamis) {
      await post('/me/notifications/read');
      state.unread = 0;
      renderTopActions();
    }
  } catch (err) {
    box.remove();
    errorToast(err);
  }
}

async function pollNotifications() {
  if (!state.me) return;
  try {
    const n = await get('/me/notifications');
    if (n.okunmamis !== state.unread) {
      state.unread = n.okunmamis;
      renderTopActions();
    }
  } catch { /* sessiz */ }
}

async function boot() {
  document.getElementById('menu-toggle').onclick = () => $('#nav').classList.toggle('open');
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('dropdown');
    if (dd && !dd.contains(e.target) && !e.target.closest('#bell')) dd.remove();
  });
  onChange(renderTopActions);
  try {
    state.meta = await get('/meta');
  } catch (err) {
    mount(app, html`<div class="card empty"><h2>Sunucuya ulaşılamadı</h2><p>${err.message}</p></div>`);
    return;
  }
  if (getToken()) await refreshMe();
  renderTopActions();
  pollNotifications();
  setInterval(pollNotifications, 30_000);
  window.addEventListener('hashchange', route);
  route();
}

boot();
