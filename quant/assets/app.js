/* ==========================================
   量化日报 —— 数据拉取与渲染
   数据契约见 docs：06/07 文档 + deploy.yml
   全部相对路径 fetch，运行时零 key、零 API 依赖
   ========================================== */

// 一次全拉（benchmarks 全局一份 + 两市场各三份，共 7 个文件 <100KB），tab 切换零延迟
const MARKETS = ['us', 'cn'];
const FILES = {
    manifest: (m) => `./data/manifest-${m}.json`,
    report:   (m) => `./data/report-${m}-latest.json`,
    matrix:   (m) => `./data/matrix-${m}-latest.json`,
    benchmarks: () => `./data/benchmarks.json`
};

const MARKET_NAME = { us: '美股', cn: 'A股' };

// 内存缓存：{ us: {manifest, report, matrix}, cn: {...} }
const cache = {};
let currentMarket = 'us';

/* ---------- 工具 ---------- */

// fetch 静态 JSON：no-store 防浏览器缓存旧版（文件名固定、内容每日更新）
async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.ok === false) throw new Error('API 返回 ok:false');
    return json;
}

// 数值格式化：null/undefined → fallback 文案（契约规定 null 必须容错）
function fmtNum(v, digits = 2, fallback = '积累中') {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return fallback;
    return Number(v).toLocaleString('zh-CN', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
}

function fmtPct(v, fallback = '—') {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return fallback;
    const n = Number(v);
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function chgClass(v) {
    if (v === null || v === undefined || Number(v) === 0) return '';
    return Number(v) > 0 ? 'up' : 'down'; // 红涨绿跌（中国惯例）
}

function esc(str) {
    // 展示用最小转义（数据是自己系统生成的，仅防意外尖括号破坏结构）
    return String(str ?? '').replace(/[&<>"]/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function blockError(id, msg) {
    const host = document.getElementById(id);
    if (host) host.innerHTML = `<div class="block-error">${esc(msg)}</div>`;
}

/* ---------- 数据加载 ---------- */

async function loadMarket(market) {
    const [manifest, report, matrix] = await Promise.allSettled([
        fetchJSON(FILES.manifest(market)),
        fetchJSON(FILES.report(market)),
        fetchJSON(FILES.matrix(market))
    ]);
    cache[market] = {
        manifest: manifest.status === 'fulfilled' ? manifest.value : null,
        report:   report.status === 'fulfilled' ? report.value : null,
        matrix:   matrix.status === 'fulfilled' ? matrix.value : null
    };
    // 每个区块独立容错：任一文件失败只影响对应区块，不白屏
    if (!cache[market].manifest) console.warn(`[${market}] manifest 加载失败`);
    if (!cache[market].report)   console.warn(`[${market}] report 加载失败`);
    if (!cache[market].matrix)   console.warn(`[${market}] matrix 加载失败`);
}

/* ---------- 渲染：数据截至 ---------- */

function renderAsOf() {
    const el = document.getElementById('data-asof');
    const m = cache[currentMarket]?.matrix?.data;
    // 真实数据里矩阵顶层无 data_date：优先 data_date → 报告日期 → generated_at 的日期部分
    const date = m?.data_date
        || cache[currentMarket]?.report?.data?.date
        || (m?.generated_at ? m.generated_at.slice(0, 10) : null);
    el.textContent = date ? `数据截至 ${date} · ${MARKET_NAME[currentMarket]}` : '数据暂不可用';
}

/* ---------- 渲染：全局基准盘（benchmarks，市场无关） ---------- */

// risk_gauges 里标量键的中文名；对象键（us_treasury/qvix）单独处理
const RISK_LABELS = {
    spx_hv20_pct: '恐慌指数(HV20)',
    copper_gold_ratio: '铜金比'
};

// 指数/商品卡片：固定五字段 name/close/ret_20d_pct/ret_60d_pct/rsi_14（ret 可能为 null）
function benchSeriesCard(item) {
    const sub = [];
    if (item && item.ret_20d_pct !== null && item.ret_20d_pct !== undefined) {
        sub.push(`<span class="chg ${chgClass(item.ret_20d_pct)}">20日 ${esc(fmtPct(item.ret_20d_pct))}</span>`);
    }
    if (item && item.rsi_14 !== null && item.rsi_14 !== undefined) {
        sub.push(`RSI ${esc(fmtNum(item.rsi_14, 1))}`);
    }
    return macroCard(item?.name, fmtNum(item?.close, 2, '—'), sub.join(' · '));
}

// "2026-11-13" → "@ 11-13"（快照日期短格式）
function shortAsOf(dateStr) {
    return dateStr ? `@ ${String(dateStr).slice(5)}` : '';
}

// risk_gauges 混合结构：数值或对象逐键判断，任何键都可能缺席
function riskGaugeCards(gauges) {
    let html = '';
    for (const [key, val] of Object.entries(gauges || {})) {
        if (val === null || val === undefined) continue;

        if (typeof val === 'number') {
            // 标量读数：HV20 / 铜金比等
            html += macroCard(RISK_LABELS[key] || key, fmtNum(val, 2));
        } else if (key === 'us_treasury') {
            // 美债组（报告快照，标 as_of_report 防误读为实时）
            const parts = [];
            if (val.us_10y_2y_spread !== null && val.us_10y_2y_spread !== undefined) {
                parts.push(`10Y-2Y ${esc(fmtNum(val.us_10y_2y_spread))}pp`);
            }
            if (val.cn_10y !== null && val.cn_10y !== undefined) {
                parts.push(`中债10Y ${esc(fmtNum(val.cn_10y))}%`);
            }
            html += macroCard('美债10Y', `${esc(fmtNum(val.us_10y))}%`,
                [parts.join(' · '), shortAsOf(val.as_of_report)].filter(Boolean).join(' '));
        } else if (key === 'qvix') {
            html += macroCard('QVIX(A股恐慌)', fmtNum(val.qvix, 1), shortAsOf(val.as_of_report));
        }
        // 未知形态的键静默跳过（不丢日志也不崩）
    }
    return html;
}

function renderBenchmarks() {
    const host = document.getElementById('bench-cards');
    const d = cache.benchmarks?.data;

    // 兜底：全局基准盘不可用时，回退到分市场矩阵的 macro_environment（旧数据路径）
    if (!d) {
        renderMacro();
        return;
    }

    const groups = [
        ['权益指数', d.equity_indices],
        ['商品', d.commodities]
    ];

    let html = '';
    for (const [label, series] of groups) {
        const entries = Object.entries(series || {});
        if (!entries.length) continue;
        html += `<div class="group-label">${esc(label)}</div>`;
        html += `<div class="macro-grid">${entries.map(([, item]) => benchSeriesCard(item)).join('')}</div>`;
    }

    const riskHtml = riskGaugeCards(d.risk_gauges);
    if (riskHtml) {
        html += `<div class="group-label">风险读数</div><div class="macro-grid">${riskHtml}</div>`;
    }

    host.innerHTML = html || '<div class="block-error">基准盘数据为空</div>';
}

/* ---------- 兜底渲染：分市场宏观（matrix.macro_environment，仅 benchmarks 失效时使用） ---------- */

// 已知键的展示名；未知键原样显示（量化系统加字段时不至于丢信息）
const MACRO_LABELS = {
    spx: '标普500', nasdaq: '纳斯达克', gold: '黄金', oil: '原油', copper: '铜',
    spx_hv20_pct: '恐慌指数(HV20)', copper_gold_ratio: '铜金比'
};

function macroCard(name, value, sub) {
    return `
        <div class="macro-card">
            <div class="macro-name">${esc(name)}</div>
            <div class="macro-value">${esc(value)}</div>
            ${sub ? `<div class="macro-sub">${sub}</div>` : ''}
        </div>`;
}

function renderMacro() {
    const host = document.getElementById('bench-cards');
    const macro = cache[currentMarket]?.matrix?.data?.macro_environment;

    if (!macro) {
        host.innerHTML = '<div class="block-error">基准盘数据暂不可用，稍后再试</div>';
        return;
    }

    let html = '';

    // 对象型资产（spx/gold/oil/copper...）：价格 + 20日涨跌
    for (const [key, val] of Object.entries(macro)) {
        if (val && typeof val === 'object') {
            const label = MACRO_LABELS[key] || key;
            const ret = val.ret_20d_pct;
            const rsi = val.rsi_14;
            const sub = [];
            if (ret !== undefined && ret !== null) {
                sub.push(`<span class="chg ${chgClass(ret)}">20日 ${esc(fmtPct(ret))}</span>`);
            }
            if (rsi !== undefined && rsi !== null) {
                sub.push(`RSI ${esc(fmtNum(rsi, 1))}`);
            }
            html += macroCard(label, fmtNum(val.close), sub.join(' · '));
        }
    }

    // 标量型指标（spx_hv20_pct / copper_gold_ratio...）
    for (const [key, val] of Object.entries(macro)) {
        if (val !== null && typeof val !== 'object') {
            const label = MACRO_LABELS[key] || key;
            html += macroCard(label, fmtNum(val));
        }
    }

    // 美债字段组（us_treasury：挑 10Y 与期限利差）
    const tsy = macro.us_treasury;
    if (tsy && typeof tsy === 'object') {
        const parts = [];
        if (tsy.us_10y != null) parts.push(`10Y ${fmtNum(tsy.us_10y)}%`);
        if (tsy.us_10y_2y_spread != null) parts.push(`10Y-2Y ${fmtNum(tsy.us_10y_2y_spread)}pp`);
        if (parts.length) html += macroCard('美债收益率', parts[0], parts.slice(1).join(' · '));
    }

    host.innerHTML = html || '<div class="block-error">宏观数据为空</div>';
}

/* ---------- 渲染：自选池卡片 ---------- */

function trendClass(trend) {
    const t = String(trend || '');
    if (t.includes('多') && !t.includes('空')) return 'trend-bull';
    if (t.includes('空')) return 'trend-bear';
    return '';
}

function renderAssets() {
    const host = document.getElementById('asset-cards');
    const matrix = cache[currentMarket]?.matrix?.data;

    if (!matrix || !Array.isArray(matrix.asset_matrix) || !matrix.asset_matrix.length) {
        blockError('asset-cards', '自选池数据暂不可用，稍后再试');
        return;
    }

    host.innerHTML = matrix.asset_matrix.map(a => {
        const short = a.short_term || {};
        const mid = a.mid_term || {};
        const long = a.long_term || {};

        const tags = [];
        if (mid.trend) {
            tags.push(`<span class="tag-pill ${trendClass(mid.trend)}">${esc(mid.trend)}</span>`);
        }
        if (short.rsi_status) {
            tags.push(`<span class="tag-pill">RSI ${esc(fmtNum(short.rsi_14, 1))} ${esc(short.rsi_status)}</span>`);
        }
        // vs MA200：null → "积累中"（契约规定的容错点）
        const vs200 = long.vs_ma200_pct;
        tags.push(`<span class="tag-pill">vs MA200 ${
            vs200 === null || vs200 === undefined ? '积累中' : esc(fmtPct(vs200))
        }</span>`);

        // 估值字段全部可能为 null（美股分位自积累中）
        const valuation = [];
        if (long.pe_ttm != null) valuation.push(`PE ${fmtNum(long.pe_ttm)}`);
        if (long.pe_percentile_3y != null) valuation.push(`PE分位 ${fmtPct(long.pe_percentile_3y)}`);
        if (long.pb != null) valuation.push(`PB ${fmtNum(long.pb)}`);

        return `
        <div class="asset-card">
            <div class="asset-head">
                <span class="asset-name">${esc(a.name || a.ticker)}</span>
                <span class="asset-ticker">${esc(a.ticker || '')}</span>
            </div>
            <div class="asset-price-row">
                <span class="asset-price">${esc(fmtNum(mid.close, 2, '—'))}</span>
                <span class="asset-ret chg ${chgClass(mid.ret_20d_pct)}">${esc(fmtPct(mid.ret_20d_pct))}</span>
            </div>
            <div class="asset-tags">${tags.join('')}</div>
            ${short.macd_state ? `<div class="asset-note">${esc(short.macd_state)}</div>` : ''}
            ${valuation.length ? `<div class="asset-note">${esc(valuation.join(' · '))}</div>` : ''}
        </div>`;
    }).join('');
}

/* ---------- 渲染：报告列表（美股/A股两张表，双市场始终展示，与 tab 无关） ---------- */

function reportTableRows(market) {
    const manifest = cache[market]?.manifest?.data;

    if (!manifest || !Array.isArray(manifest.reports) || !manifest.reports.length) {
        return `<tr><td colspan="3" class="table-empty">暂无报告（等该市场流水线产出首份）</td></tr>`;
    }

    const latestDate = cache[market]?.report?.data?.date;
    return manifest.reports.map(r => `
        <tr class="${r.date === latestDate ? 'latest-row' : ''}">
            <td>${esc(r.date)}</td>
            <td>${r.date === latestDate ? '<span class="latest-pill">最新</span>' : '—'}</td>
            <td><a class="detail-btn" href="report.html?market=${esc(market)}&date=${esc(r.date)}">查看报告</a></td>
        </tr>`).join('');
}

function renderReportTables() {
    document.getElementById('report-tbody-us').innerHTML = reportTableRows('us');
    document.getElementById('report-tbody-cn').innerHTML = reportTableRows('cn');
}

/* ---------- 渲染：数据说明 + 切换 ---------- */

function renderNotes() {
    const el = document.getElementById('data-notes');
    const notes = cache[currentMarket]?.matrix?.data?.data_notes;
    el.textContent = Array.isArray(notes) && notes.length
        ? '注：' + notes.join('；')
        : '';
}

function renderAll() {
    renderAsOf();
    renderBenchmarks();
    renderAssets();
    renderReportTables();
    renderNotes();
}

function switchMarket(market) {
    currentMarket = market;
    document.querySelectorAll('.tab-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.market === market));
    renderAll(); // 全部从内存缓存渲染，零网络请求
}

/* ---------- 初始化 ---------- */

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.tab-btn').forEach(btn =>
        btn.addEventListener('click', () => switchMarket(btn.dataset.market)));

    // benchmarks 全局一份 + 双市场数据，全部并行加载，互不阻塞
    const benchPromise = fetchJSON(FILES.benchmarks())
        .then(json => { cache.benchmarks = json; })
        .catch(() => { cache.benchmarks = null; console.warn('[global] benchmarks 加载失败，将回退矩阵宏观'); });

    await Promise.allSettled([benchPromise, ...MARKETS.map(loadMarket)]);

    // 默认展示美股
    switchMarket('us');
});
