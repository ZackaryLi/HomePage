/* 展示层增强；沿用原有数据脚本和接口。 */
(() => {
    'use strict';
    const buttons = document.querySelectorAll('.tab-btn');
    const syncMarketButtons = () => buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.classList.contains('active')));
    });
    buttons.forEach(button => new MutationObserver(syncMarketButtons).observe(button, {
        attributes: true, attributeFilter: ['class']
    }));
    syncMarketButtons();

    const article = document.getElementById('report-body');
    if (!article) return;
    const toc = document.getElementById('report-toc');
    const progress = document.getElementById('reading-progress-fill');
    let headingObserver;
    const updateProgress = () => {
        const start = article.getBoundingClientRect().top + window.scrollY;
        const distance = Math.max(1, article.offsetHeight - window.innerHeight);
        const percent = Math.max(0, Math.min(100, (window.scrollY - start) / distance * 100));
        progress.style.width = `${percent}%`;
    };
    const buildContents = () => {
        if (headingObserver) headingObserver.disconnect();
        const all = [...article.querySelectorAll('h2, h3')];
        const headings = all.length ? all : [...article.querySelectorAll('h1')];
        toc.replaceChildren();
        if (!headings.length) {
            const item = document.createElement('li');
            item.className = 'toc-placeholder';
            item.textContent = article.querySelector('.loading-state') ? '报告加载后显示目录' : '暂无章节目录';
            toc.append(item);
        }
        const links = new Map();
        headings.forEach((heading, index) => {
            heading.id = `report-section-${index + 1}`;
            const item = document.createElement('li');
            if (heading.tagName === 'H3' && all.some(h => h.tagName === 'H2')) item.className = 'toc-child';
            const link = document.createElement('a');
            link.href = `#${heading.id}`;
            link.textContent = heading.textContent;
            item.append(link);
            toc.append(item);
            links.set(heading, link);
        });
        headingObserver = new IntersectionObserver(entries => {
            const visible = entries.filter(entry => entry.isIntersecting);
            if (!visible.length) return;
            links.forEach(link => link.removeAttribute('aria-current'));
            links.get(visible[0].target)?.setAttribute('aria-current', 'location');
        }, { rootMargin: '-5% 0px -65% 0px' });
        headings.forEach(heading => headingObserver.observe(heading));
        const paperEnd = document.querySelector('.paper-end');
        if (paperEnd) paperEnd.hidden = !article.querySelector('h1,h2,h3,p,pre');
        updateProgress();
    };
    new MutationObserver(buildContents).observe(article, { childList: true });
    buildContents();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    document.getElementById('print-report').addEventListener('click', () => window.print());
})();
