/* ==========================================
   侧栏交互：时间线滚动入场动画
   迁移自 lonRh 项目 script.js 的 initTimelineAnimation：
   节点进入视口时从左滑入，圆点脉冲一次
   ========================================== */

document.addEventListener('DOMContentLoaded', function() {
    const timelineItems = document.querySelectorAll('.timeline-item');

    const timelineObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateX(0)';

                    // 时间线圆点脉冲
                    const dot = entry.target.querySelector('.timeline-dot');
                    if (dot) {
                        dot.style.animation = 'timelinePulse 1s ease-in-out';
                    }
                }, index * 200);
                // 展示过即停止观察，避免反复触发
                timelineObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    timelineItems.forEach(item => {
        timelineObserver.observe(item);
    });
});
