/* ==========================================
   报告详情页 —— report.html?market=us&date=2026-11-16
   按需 fetch 当日报告正文，整页渲染
   ========================================== */

const MARKET_NAME_R = { us: '美股', cn: 'A股' };

// URL 参数白名单化：market 只认 us/cn，date 只留数字与连字符
const params = new URLSearchParams(location.search);
const market = params.get('market') === 'cn' ? 'cn' : 'us';
const date = (params.get('date') || '').replace(/[^\d-]/g, '');

function blockErrorR(msg) {
    document.getElementById('report-body').innerHTML =
        `<div class="block-error">${msg}</div>`;
}

async function initReport() {
    const titleEl = document.getElementById('report-title');
    const asofEl = document.getElementById('report-asof');

    if (!date) {
        titleEl.textContent = '量化报告';
        asofEl.textContent = '缺少日期参数';
        blockErrorR('报告地址不完整，请从 <a href="./index.html">报告列表</a> 进入');
        return;
    }

    titleEl.textContent = `${MARKET_NAME_R[market]}报告 · ${date}`;
    document.title = `${MARKET_NAME_R[market]}报告 ${date} · ZipperLi`;

    try {
        const res = await fetch(`./data/report-${market}-${date}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json && json.ok === false) throw new Error('API 返回 ok:false');

        const data = json?.data;
        const md = data?.markdown;
        if (!md) throw new Error('markdown 为空');

        asofEl.textContent = `数据日期 ${data.date || date} · ${MARKET_NAME_R[market]}`;
        document.getElementById('report-body').innerHTML = typeof marked !== 'undefined'
            ? marked.parse(md)
            : `<pre>${String(md).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>`;
    } catch (e) {
        asofEl.textContent = '';
        blockErrorR('该日期报告数据未生成或暂不可用，请返回列表选择其他日期');
    }
}

document.addEventListener('DOMContentLoaded', initReport);
