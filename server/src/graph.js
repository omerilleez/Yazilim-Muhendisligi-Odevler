// İnsan grafı: üyeler düğüm; takip, güven, oy benzerliği ve yanıtlaşmalar kenar.
// Topluluklar (etiket yayılımı) ve etki (PageRank) hesaplanır. Bu analiz, "çoğunluğun azınlığı
// ezmesi" riskini ölçmek için oylama sonuçlarında kullanılır (köprü skoru / azınlık uyarısı).
import { db } from './db.js';

const EPS = 1e-9;

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function labelPropagation(ids, adj) {
  const label = new Map(ids.map((id) => [id, id]));
  const rand = seededRandom(20261002);
  for (let iter = 0; iter < 40; iter++) {
    let changed = false;
    const order = [...ids];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const v of order) {
      const nb = adj.get(v);
      if (!nb || nb.size === 0) continue;
      const score = new Map();
      for (const [u, w] of nb) score.set(label.get(u), (score.get(label.get(u)) || 0) + w);
      const current = label.get(v);
      let best = current;
      let bestScore = score.get(current) || 0;
      for (const [l, s] of score) {
        if (s > bestScore + EPS || (Math.abs(s - bestScore) <= EPS && best !== current && l < best)) {
          best = l;
          bestScore = s;
        }
      }
      if (best !== current) {
        label.set(v, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return label;
}

function pageRank(ids, adj, iterations = 40, d = 0.85) {
  const n = ids.length || 1;
  let pr = new Map(ids.map((id) => [id, 1 / n]));
  const strength = new Map(ids.map((id) => [id, [...(adj.get(id)?.values() || [])].reduce((a, b) => a + b, 0)]));
  for (let i = 0; i < iterations; i++) {
    const next = new Map(ids.map((id) => [id, (1 - d) / n]));
    let dangling = 0;
    for (const v of ids) {
      const s = strength.get(v);
      if (!s) {
        dangling += pr.get(v);
        continue;
      }
      for (const [u, w] of adj.get(v)) next.set(u, next.get(u) + (d * pr.get(v) * w) / s);
    }
    for (const v of ids) next.set(v, next.get(v) + (d * dangling) / n);
    pr = next;
  }
  return pr;
}

export const COMMUNITY_COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#c026d3', '#475569'];

export function buildGraph() {
  const users = db.all('SELECT id, nickname, created_at FROM users ORDER BY created_at, id');
  const ids = users.map((u) => u.id);
  const experts = db.all("SELECT user_id, domain FROM expert_domains WHERE status = 'onayli'");
  const social = db.all('SELECT from_user, to_user, type FROM edges');
  const covote = db.all(`
    SELECT a.user_id AS u1, b.user_id AS u2,
           SUM(CASE WHEN a.choice = b.choice THEN 1 ELSE 0 END) AS agree, COUNT(*) AS common
    FROM votes a JOIN votes b ON a.poll_id = b.poll_id AND a.user_id < b.user_id
    WHERE a.choice != 'cekimser' AND b.choice != 'cekimser'
    GROUP BY a.user_id, b.user_id`);
  const replies = db.all(`
    SELECT m.user_id AS u1, p.user_id AS u2, COUNT(*) AS n
    FROM messages m JOIN messages p ON m.reply_to = p.id
    WHERE m.user_id != p.user_id GROUP BY m.user_id, p.user_id`);
  const voteCounts = new Map(db.all('SELECT user_id, COUNT(*) AS n FROM votes GROUP BY user_id').map((r) => [r.user_id, r.n]));
  const msgCounts = new Map(db.all('SELECT user_id, COUNT(*) AS n FROM messages GROUP BY user_id').map((r) => [r.user_id, r.n]));
  const topicCounts = new Map(db.all('SELECT created_by, COUNT(*) AS n FROM topics GROUP BY created_by').map((r) => [r.created_by, r.n]));

  const idSet = new Set(ids);
  const adj = new Map(ids.map((id) => [id, new Map()]));
  const addW = (a, b, w) => {
    if (a === b || !idSet.has(a) || !idSet.has(b) || w <= 0) return;
    adj.get(a).set(b, (adj.get(a).get(b) || 0) + w);
    adj.get(b).set(a, (adj.get(b).get(a) || 0) + w);
  };

  const edges = [];
  for (const e of social) {
    const w = e.type === 'guven' ? 2 : 1;
    addW(e.from_user, e.to_user, w);
    edges.push({ source: e.from_user, target: e.to_user, type: e.type, weight: w, directed: true });
  }
  const pairs = [];
  for (const c of covote) {
    const ratio = c.agree / c.common;
    if (c.common >= 2 && ratio >= 0.6) {
      // Açık sosyal bağlar (takip/güven) oy benzerliğinden daha ağır basar: 0.6 → 0.2, 1.0 → 1
      const w = Math.round(2 * (ratio - 0.5) * 100) / 100;
      addW(c.u1, c.u2, w);
      edges.push({ source: c.u1, target: c.u2, type: 'oy_benzerligi', weight: w, agreement: Math.round(ratio * 100) / 100, common: c.common, directed: false });
    }
    pairs.push(c);
  }
  for (const r of replies) {
    const w = Math.min(2, 0.5 * r.n);
    addW(r.u1, r.u2, w);
    edges.push({ source: r.u1, target: r.u2, type: 'yanit', weight: w, count: r.n, directed: true });
  }

  const labels = labelPropagation(ids, adj);
  const groups = new Map();
  for (const id of ids) {
    const l = labels.get(id);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(id);
  }
  const pr = pageRank(ids, adj);
  const nickOf = new Map(users.map((u) => [u.id, u.nickname]));
  const sorted = [...groups.values()].sort((a, b) => b.length - a.length || (nickOf.get(a[0]) < nickOf.get(b[0]) ? -1 : 1));
  const communityOf = new Map();
  const communities = sorted.map((members, i) => {
    const cid = i + 1;
    members.forEach((m) => communityOf.set(m, cid));
    const top = [...members].sort((a, b) => pr.get(b) - pr.get(a)).slice(0, 3).map((m) => nickOf.get(m));
    return {
      id: cid,
      size: members.length,
      color: members.length > 1 ? COMMUNITY_COLORS[i % COMMUNITY_COLORS.length] : '#94a3b8',
      label: members.length > 1 ? `Topluluk ${cid}` : 'Bağımsız',
      onde: top,
    };
  });

  // Blok oy davranışı: en az 6 ortak oylamada hep aynı oyu veren çiftler (olası koordineli hesaplar).
  // Bu yalnızca bilgilendirmedir; kimse cezalandırılmaz.
  const blocs = pairs
    .filter((p) => p.common >= 6 && p.agree === p.common)
    .sort((a, b) => b.common - a.common)
    .slice(0, 8)
    .map((p) => ({ uyeler: [nickOf.get(p.u1), nickOf.get(p.u2)].sort(), ortakOylama: p.common }));

  const expertMap = new Map();
  for (const e of experts) {
    if (!expertMap.has(e.user_id)) expertMap.set(e.user_id, []);
    expertMap.get(e.user_id).push(e.domain);
  }
  const nodes = users.map((u) => ({
    id: u.id,
    nickname: u.nickname,
    community: communityOf.get(u.id),
    pagerank: Math.round(pr.get(u.id) * 10000) / 10000,
    degree: adj.get(u.id).size,
    expert: expertMap.get(u.id) || [],
    votes: voteCounts.get(u.id) || 0,
    messages: msgCounts.get(u.id) || 0,
    topics: topicCounts.get(u.id) || 0,
  }));
  return { nodes, edges, communities, blocs, generatedAt: Date.now() };
}

/**
 * Bir oylamanın topluluklara göre dağılımı. Karar geçiyor ama kayda değer büyüklükte bir topluluk
 * büyük ölçüde karşıysa "azınlık uyarısı" üretir. Köprü skoru: topluluklar arasındaki en düşük
 * destek oranı (yüksekse karar farklı toplulukları kucaklıyor demektir).
 */
export function analyzePoll(poll, graph = buildGraph()) {
  const communityOf = new Map(graph.nodes.map((n) => [n.id, n.community]));
  const meta = new Map(graph.communities.map((c) => [c.id, c]));
  const votes = db.all('SELECT user_id, choice FROM votes WHERE poll_id = ?', poll.id);
  const groups = new Map();
  let yes = 0;
  let no = 0;
  for (const v of votes) {
    const c = communityOf.get(v.user_id) ?? 0;
    if (!groups.has(c)) groups.set(c, { topluluk: c, evet: 0, hayir: 0, cekimser: 0 });
    groups.get(c)[v.choice]++;
    if (v.choice === 'evet') yes++;
    if (v.choice === 'hayir') no++;
  }
  const list = [...groups.values()]
    .map((g) => {
      const decisive = g.evet + g.hayir;
      const m = meta.get(g.topluluk);
      return { ...g, toplam: g.evet + g.hayir + g.cekimser, evetOrani: decisive ? g.evet / decisive : null, etiket: m?.label ?? 'Bilinmiyor', renk: m?.color ?? '#94a3b8', boyut: m?.size ?? 0 };
    })
    .sort((a, b) => a.topluluk - b.topluluk);
  const decisive = yes + no;
  const yesRatio = decisive ? yes / decisive : 0;
  const passing = decisive > 0 && (poll.strict ? yesRatio > poll.threshold : yesRatio >= poll.threshold - EPS);
  const significant = list.filter((g) => g.evet + g.hayir >= 2 && g.toplam >= 0.2 * votes.length && g.boyut > 1);
  const excluded = significant.filter((g) => g.evetOrani !== null && g.evetOrani <= 0.25);
  return {
    topluluklar: list,
    dislananlar: passing ? excluded.map((g) => g.etiket) : [],
    azinlikUyarisi: passing && excluded.length > 0,
    kopruSkoru: significant.length ? Math.round(Math.min(...significant.map((g) => g.evetOrani)) * 100) / 100 : null,
    hayirOrani: decisive ? Math.round((no / decisive) * 1000) / 1000 : 0,
    kayda_deger_azinlik: decisive > 0 && no / decisive >= 1 / 3,
  };
}

export function toGraphML(graph) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
    '  <key id="nick" for="node" attr.name="takma_ad" attr.type="string"/>',
    '  <key id="comm" for="node" attr.name="topluluk" attr.type="int"/>',
    '  <key id="pr" for="node" attr.name="pagerank" attr.type="double"/>',
    '  <key id="type" for="edge" attr.name="tur" attr.type="string"/>',
    '  <key id="w" for="edge" attr.name="agirlik" attr.type="double"/>',
    '  <graph id="insan_grafi" edgedefault="undirected">',
  ];
  for (const n of graph.nodes) {
    lines.push(`    <node id="${esc(n.id)}"><data key="nick">${esc(n.nickname)}</data><data key="comm">${n.community}</data><data key="pr">${n.pagerank}</data></node>`);
  }
  graph.edges.forEach((e, i) => {
    lines.push(`    <edge id="e${i}" source="${esc(e.source)}" target="${esc(e.target)}"><data key="type">${e.type}</data><data key="w">${e.weight}</data></edge>`);
  });
  lines.push('  </graph>', '</graphml>');
  return lines.join('\n');
}
