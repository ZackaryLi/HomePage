/* ==========================================
   GitHub 贡献图
   迁移自 HomePage-main/static/script.js，去掉了
   API 数据层与假数据回退：拉取失败即显示错误
   ========================================== */

// GitHub 用户名（无后端，直接硬编码）
const GITHUB_USERNAME = 'ZackaryLi';

// 获取贡献数据：第三方 API → 失败则显示错误提示
async function fetchGitHubContributions(username) {
    const chartContainer = document.getElementById('contribution-chart');
    try {
        const { data, source } = await fetchGitHubContributionsFromAPI(username);
        updateContributionChart(data, source);
    } catch (error) {
        console.error('获取GitHub贡献数据失败:', error);
        if (chartContainer) {
            chartContainer.innerHTML = '<div class="loading-placeholder"><span>贡献数据加载失败</span></div>';
        }
    }
}

// 使用第三方API获取GitHub贡献数据
async function fetchGitHubContributionsFromAPI(username) {
    // 尝试多个API源
    const apiSources = [
        {
            name: 'GitHub Contributions API',
            url: `https://github-contributions-api.jogruber.de/v4/${username}`,
            parser: (data) => {
                const contributions = [];
                if (data.contributions) {
                    data.contributions.forEach(contribution => {
                        contributions.push({
                            date: contribution.date,
                            count: contribution.count,
                            level: getContributionLevel(contribution.count)
                        });
                    });
                }
                return contributions;
            }
        },
        {
            name: 'Alternative API',
            url: `https://github-calendar-api.vercel.app/api/${username}`,
            parser: (data) => {
                const contributions = [];
                if (data && data.contributions) {
                    Object.entries(data.contributions).forEach(([date, count]) => {
                        contributions.push({
                            date: date,
                            count: count,
                            level: getContributionLevel(count)
                        });
                    });
                }
                return contributions;
            }
        }
    ];

    // 尝试每个API源
    for (const source of apiSources) {
        try {
            const response = await fetch(source.url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const contributions = source.parser(data);
            if (contributions.length > 0) {
                return { data: contributions, source: 'api' };
            }
        } catch (error) {
            console.warn(`${source.name} 失败:`, error);
        }
    }

    throw new Error('所有贡献数据API均不可用');
}

// 根据贡献数量获取等级
function getContributionLevel(count) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 10) return 3;
    return 4;
}

// 按容器宽度截断周数据：超出时从最早（左侧）的周开始截去，保证图以"今天"结尾且不出现横向滚动条
function truncateWeeksToWidth(weeklyData, container) {
    if (!container || !weeklyData.length) return weeklyData;

    const isSmallMobile = window.innerWidth <= 480;
    const cellSize = isSmallMobile ? 9 : 14;
    const gap = 3;
    const weekLabelWidth = (isSmallMobile ? 15 : 18) + 5; // 星期标签列宽 + 右间距

    const available = container.clientWidth - weekLabelWidth;
    if (available <= 0) return weeklyData;

    const maxWeeks = Math.max(10, Math.floor((available + gap) / (cellSize + gap)));
    return weeklyData.length > maxWeeks ? weeklyData.slice(-maxWeeks) : weeklyData;
}

// 按周组织贡献数据 - GitHub风格
function organizeDataByWeeks(contributions) {
    // 创建日期映射以便快速查找
    const dataMap = new Map();
    contributions.forEach(item => {
        dataMap.set(item.date, item);
    });

    // 计算一年前的日期（从周日开始）
    const today = new Date();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());

    // 找到开始日期的周日
    const startDate = new Date(oneYearAgo);
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // 找到结束日期的周六（当前周）
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));

    const weeks = [];
    let currentWeek = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        const dateString = currentDate.toISOString().split('T')[0];
        const dayData = dataMap.get(dateString) || {
            date: dateString,
            count: 0,
            level: 0
        };

        currentWeek.push(dayData);

        // 如果是周六，完成当前周
        if (currentDate.getDay() === 6) {
            weeks.push([...currentWeek]);
            currentWeek = [];
        }

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // 处理最后一周（如果未完成）
    if (currentWeek.length > 0) {
        // 补齐最后一周到7天
        while (currentWeek.length < 7) {
            const nextDate = new Date(currentDate);
            const nextDateString = nextDate.toISOString().split('T')[0];
            currentWeek.push({
                date: nextDateString,
                count: 0,
                level: 0
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
        weeks.push(currentWeek);
    }

    return weeks;
}

// 最近一次渲染的数据，供窗口尺寸变化时重算截断
let lastContributions = null;
let lastDataSource = 'unknown';
let resizeTimer = null;

// 更新贡献图表
function updateContributionChart(contributions, dataSource = 'unknown') {
    const chartContainer = document.getElementById('contribution-chart');
    if (!chartContainer) return;

    lastContributions = contributions;
    lastDataSource = dataSource;

    // 检测是否为移动设备
    const isMobile = window.innerWidth <= 768;

    chartContainer.innerHTML = '';

    // 按周组织数据，并按容器宽度截断（保留最近的周）
    const weeklyData = truncateWeeksToWidth(organizeDataByWeeks(contributions), chartContainer);

    // 将标题行内容移到标题占位符中
    const headerPlaceholder = document.getElementById('contribution-header-placeholder');
    const titleElement = document.getElementById('contribution-title');

    if (headerPlaceholder) {
        headerPlaceholder.innerHTML = '';

        if (isMobile) {
            // 手机端：只将标题移到占位符中，添加统计数据
            if (titleElement) {
                const titleClone = titleElement.cloneNode(true);
                titleElement.style.display = 'none'; // 隐藏原标题
                headerPlaceholder.appendChild(titleClone);
            }

            headerPlaceholder.appendChild(createMobileStats(contributions));

            // 手机端不显示贡献图，直接返回
            return;
        } else {
            // 桌面端：显示原标题，添加图例和数据源信息
            if (titleElement) {
                titleElement.style.display = 'inline-flex'; // 显示原标题
            }

            headerPlaceholder.appendChild(createContributionHeader(dataSource));
        }
    }

    // 创建月份标签
    chartContainer.appendChild(createMonthLabels(weeklyData));

    // 创建贡献格子容器
    const gridContainer = document.createElement('div');
    gridContainer.className = 'contribution-grid-container';

    // 创建星期标签
    gridContainer.appendChild(createWeekLabels());

    // 创建贡献格子
    const grid = document.createElement('div');
    grid.className = 'contribution-grid';

    // 设置网格列数为实际周数，根据屏幕大小调整
    const isSmallMobile = window.innerWidth <= 480;
    const cellSize = isSmallMobile ? '9px' : '14px';
    grid.style.gridTemplateColumns = `repeat(${weeklyData.length}, ${cellSize})`;

    // 按周填充数据
    weeklyData.forEach((week, weekIndex) => {
        week.forEach((day, dayIndex) => {
            const cell = document.createElement('div');
            cell.className = `contribution-cell level-${day.level}`;
            cell.title = `${day.date}: ${day.count} 次贡献`;

            // 添加延迟动画
            cell.style.animationDelay = `${(weekIndex * 7 + dayIndex) * 2}ms`;

            // 鼠标悬停效果
            cell.addEventListener('mouseenter', function() {
                this.style.transform = 'scale(1.3)';
                this.style.zIndex = '10';

                // 显示工具提示
                showTooltip(this, day);
            });

            cell.addEventListener('mouseleave', function() {
                this.style.transform = 'scale(1)';
                this.style.zIndex = '1';
                // 鼠标移开：取消未触发的显示延时，并隐藏已显示的工具提示
                if (tooltipTimeout) {
                    clearTimeout(tooltipTimeout);
                    tooltipTimeout = null;
                }
                hideAllTooltips();
            });

            grid.appendChild(cell);
        });
    });

    gridContainer.appendChild(grid);
    chartContainer.appendChild(gridContainer);

    // 创建统计摘要
    chartContainer.appendChild(createContributionSummary(contributions));

    // 触发入场动画
    setTimeout(() => {
        chartContainer.classList.add('chart-loaded');
    }, 100);
}

// 获取数据源指示器样式
function getSourceIndicatorClass(dataSource) {
    switch (dataSource) {
        case 'api': return 'source-api';
        case 'svg': return 'source-svg';
        case 'generated': return 'source-generated';
        default: return 'source-unknown';
    }
}

// 获取数据源文本
function getSourceText(dataSource) {
    switch (dataSource) {
        case 'api': return '实时数据';
        case 'svg': return '解析数据';
        case 'generated': return '智能生成';
        default: return '数据加载中';
    }
}

// 计算统计数据
function computeContributionStats(contributions) {
    const totalContributions = contributions.reduce((sum, day) => sum + day.count, 0);
    const activeDays = contributions.filter(day => day.count > 0).length;
    const maxDay = contributions.reduce((max, day) => day.count > max.count ? day : max, contributions[0]);
    const activityRate = Math.round((activeDays / contributions.length) * 100);
    return { totalContributions, activeDays, maxDay, activityRate };
}

// 创建贡献摘要
function createContributionSummary(contributions) {
    const summary = document.createElement('div');
    summary.className = 'contribution-summary';

    const { totalContributions, activeDays, maxDay, activityRate } = computeContributionStats(contributions);

    summary.innerHTML = `
        <div class="summary-item">
            <span class="summary-number">${totalContributions.toLocaleString()}</span>
            <span class="summary-label">总贡献</span>
        </div>
        <div class="summary-item">
            <span class="summary-number">${activeDays}</span>
            <span class="summary-label">活跃天数</span>
        </div>
        <div class="summary-item">
            <span class="summary-number">${maxDay.count}</span>
            <span class="summary-label">单日最高</span>
        </div>
        <div class="summary-item">
            <span class="summary-number">${activityRate}%</span>
            <span class="summary-label">活跃率</span>
        </div>
    `;

    return summary;
}

// 创建手机端统计信息
function createMobileStats(contributions) {
    const mobileStats = document.createElement('div');
    mobileStats.className = 'mobile-contribution-stats';

    const { totalContributions, activeDays, maxDay, activityRate } = computeContributionStats(contributions);

    mobileStats.innerHTML = `
        <div class="mobile-stat-item">
            <span class="mobile-stat-number">${totalContributions.toLocaleString()}</span>
            <span class="mobile-stat-label">总贡献</span>
        </div>
        <div class="mobile-stat-item">
            <span class="mobile-stat-number">${activeDays}</span>
            <span class="mobile-stat-label">活跃天数</span>
        </div>
        <div class="mobile-stat-item">
            <span class="mobile-stat-number">${maxDay.count}</span>
            <span class="mobile-stat-label">单日最高</span>
        </div>
        <div class="mobile-stat-item">
            <span class="mobile-stat-number">${activityRate}%</span>
            <span class="mobile-stat-label">活跃率</span>
        </div>
    `;

    return mobileStats;
}

// 创建月份标签
function createMonthLabels(weeklyData) {
    const monthsContainer = document.createElement('div');
    monthsContainer.className = 'month-labels';

    if (!weeklyData || weeklyData.length === 0) {
        return monthsContainer;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthPositions = [];

    // 计算每个月份在网格中的位置
    weeklyData.forEach((week, weekIndex) => {
        if (week.length > 0) {
            const firstDayOfWeek = new Date(week[0].date);
            const month = firstDayOfWeek.getMonth();
            const day = firstDayOfWeek.getDate();

            // 如果是月初的前几天，显示月份标签
            if (day <= 7 && !monthPositions.find(m => m.month === month)) {
                monthPositions.push({
                    month: month,
                    weekIndex: weekIndex,
                    label: months[month]
                });
            }
        }
    });

    // 创建月份标签容器，宽度与网格对应
    const isSmallMobile = window.innerWidth <= 480;
    const cellSize = isSmallMobile ? '9px' : '14px';
    const labelSize = isSmallMobile ? '18px' : '22px';

    monthsContainer.style.display = 'grid';
    monthsContainer.style.gridTemplateColumns = `${labelSize} repeat(${weeklyData.length}, ${cellSize})`;
    monthsContainer.style.gap = '3px';
    monthsContainer.style.marginBottom = '8px';

    // 添加空白占位符（对应周标签的位置）
    const spacer = document.createElement('span');
    monthsContainer.appendChild(spacer);

    // 为每周添加月份标签或空白
    for (let i = 0; i < weeklyData.length; i++) {
        const monthLabel = document.createElement('span');
        monthLabel.className = 'month-label';

        const monthPos = monthPositions.find(m => m.weekIndex === i);
        if (monthPos) {
            monthLabel.textContent = monthPos.label;
        }

        monthsContainer.appendChild(monthLabel);
    }

    return monthsContainer;
}

// 创建星期标签
function createWeekLabels() {
    const weekContainer = document.createElement('div');
    weekContainer.className = 'week-labels';

    const days = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
    days.forEach(day => {
        const dayLabel = document.createElement('span');
        dayLabel.className = 'week-label';
        dayLabel.textContent = day;
        weekContainer.appendChild(dayLabel);
    });

    return weekContainer;
}

// 创建贡献图标题行（包含数据源和图例）
function createContributionHeader(dataSource) {
    const headerRow = document.createElement('div');
    headerRow.className = 'contribution-header-row';

    // 图例（少和多）
    const legend = document.createElement('div');
    legend.className = 'contribution-legend';

    const lessLabel = document.createElement('span');
    lessLabel.textContent = '少';
    lessLabel.className = 'legend-label';
    legend.appendChild(lessLabel);

    for (let i = 0; i <= 4; i++) {
        const levelCell = document.createElement('div');
        levelCell.className = `legend-cell level-${i}`;
        legend.appendChild(levelCell);
    }

    const moreLabel = document.createElement('span');
    moreLabel.textContent = '多';
    moreLabel.className = 'legend-label';
    legend.appendChild(moreLabel);

    // 数据源信息
    const sourceInfo = document.createElement('div');
    sourceInfo.className = 'contribution-source-info';
    sourceInfo.innerHTML = `
        <span class="source-indicator ${getSourceIndicatorClass(dataSource)}"></span>
        <span class="source-text">${getSourceText(dataSource)}</span>
    `;

    headerRow.appendChild(legend);
    headerRow.appendChild(sourceInfo);

    return headerRow;
}

// 工具提示节流变量
let tooltipTimeout = null;

// 显示工具提示
function showTooltip(element, contribution) {
    // 清除之前的延时
    if (tooltipTimeout) {
        clearTimeout(tooltipTimeout);
    }

    // 先清理所有现有的工具提示
    hideAllTooltips();

    // 延时显示，避免快速移动时频繁创建
    tooltipTimeout = setTimeout(() => {
        const tooltip = document.createElement('div');
        tooltip.className = 'contribution-tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-date">${formatTooltipDate(contribution.date)}</div>
            <div class="tooltip-count">${contribution.count} 次贡献</div>
        `;

        const rect = element.getBoundingClientRect();
        tooltip.style.left = rect.left + rect.width / 2 + 'px';
        tooltip.style.top = rect.top - 10 + 'px';

        document.body.appendChild(tooltip);

        // 动画显示
        setTimeout(() => tooltip.classList.add('show'), 10);

        // 2秒后自动隐藏
        setTimeout(() => {
            if (tooltip.parentNode) {
                tooltip.classList.remove('show');
                setTimeout(() => {
                    if (tooltip.parentNode) {
                        tooltip.remove();
                    }
                }, 200);
            }
        }, 2000);
    }, 100); // 100ms延时
}

// 隐藏所有工具提示
function hideAllTooltips() {
    const tooltips = document.querySelectorAll('.contribution-tooltip');
    tooltips.forEach(tooltip => {
        if (tooltip.parentNode) {
            tooltip.remove();
        }
    });
}

// 格式化工具提示日期（GitHub 风格：Nov 8, 2026）
function formatTooltipDate(dateString) {
    const date = new Date(dateString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    fetchGitHubContributions(GITHUB_USERNAME);

    // 窗口尺寸变化时重算截断（防抖），跨过 768px 断点时也会切换桌面/移动布局
    window.addEventListener('resize', function() {
        if (!lastContributions) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            updateContributionChart(lastContributions, lastDataSource);
        }, 200);
    });

    // 点击非贡献格子区域时隐藏工具提示
    document.addEventListener('click', function(e) {
        if (!e.target.classList.contains('contribution-cell')) {
            hideAllTooltips();
        }
    });
});
