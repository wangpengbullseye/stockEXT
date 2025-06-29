// 全局变量
let klineChart;  // K线图表
let volumeChart; // 成交量图表
let candleSeries;
let ma5Series;
let ma10Series;
let ma20Series;
let volumeSeries;
let currentPage = 1;
let isLoading = false;
let allCandleData = [];
let startDate = null;
let checkDataCallDepth = 0; // 防止递归调用的计数器
let lastKlineDate = null; // 记录最后一根K线的日期

// 步幅相关变量
let strideLastKlineTimestamp = 0
let strideData = [];
let currentKLine = null; // 当前的k线
let currentStride = 0; // 当前步幅累加值
let strideTarget = 0; // 目标步幅值
let strideEnabled = false; // 是否启用步幅功能

// 动画播放相关变量
let isPlaying = false; // 是否正在播放
let playbackSpeed = 5; // 播放速度倍数
let animationTimer = null; // 动画定时器
let minuteData = []; // 分钟级数据
let currentAnimationIndex = 0; // 当前动画播放到的分钟数据索引
let currentKlineBuffer = null; // 当前正在构建的K线数据缓冲区
let animationState = 'stopped'; // 动画状态: 'stopped', 'playing', 'paused'

// 前端日志记录
let frontendLogs = [];
const MAX_LOGS = 1000;

// 画线工具相关变量
let currentDrawingTool = 'select';
let isDrawing = false;
let drawingStartPoint = null;
let drawings = [];
let drawingId = 0;
let isDragEnabled = true; // 控制拖拽功能是否启用

// 画线工具系统
let drawingToolSystem = null;

// ==================== 专业画线工具系统类定义 ====================

// 画线工具基类
class DrawingTool {
    constructor(chart, candleSeries) {
        this.chart = chart;
        this.candleSeries = candleSeries;
        this.state = 'idle'; // idle, drawing, preview
        this.points = [];
        this.previewSeries = null;
        this.snapIndicator = null;
        this.snapDistance = 5; // 捕捉距离（像素）
    }

    // 开始绘制
    start() {
        this.state = 'drawing';
        this.points = [];
        this.userAdjustedView = false; // 重置用户调整标记
        console.log(`🎨 开始绘制 ${this.constructor.name}`);
    }

    // 结束绘制
    finish() {
        this.state = 'idle';
        this.clearPreview();
        this.clearSnapIndicator();
        console.log(`✅ 完成绘制 ${this.constructor.name}`);
    }

    // 取消绘制
    cancel() {
        this.state = 'idle';
        this.points = [];
        this.clearPreview();
        this.clearSnapIndicator();
        console.log(`❌ 取消绘制 ${this.constructor.name}`);
    }

    // 处理鼠标移动
    onMouseMove(param) {
        if (!param.point || !param.time) return;

        const price = this.candleSeries.coordinateToPrice(param.point.y);
        if (price === null) return;

        const snapPoint = this.findSnapPoint(param.time, price, param.point);
        this.showSnapIndicator(snapPoint);

        if (this.state === 'drawing' && this.points.length > 0) {
            this.updatePreview(snapPoint);
        } else if (this.state === 'drawing') {
            this.showPreview(snapPoint);
        }
    }

    // 处理鼠标点击
    onMouseClick(param) {
        if (!param.point || !param.time) return;

        const price = this.candleSeries.coordinateToPrice(param.point.y);
        if (price === null) return;

        const snapPoint = this.findSnapPoint(param.time, price, param.point);
        this.addPoint(snapPoint);
    }

    // 查找捕捉点
    findSnapPoint(time, price, screenPoint) {
        // 获取当前时间附近的K线数据
        const nearbyCandles = this.getNearbyCandles(time);
        let bestSnap = { time, price, isSnapped: false };
        let minDistance = this.snapDistance;

        for (const candle of nearbyCandles) {
            // 检查所有四个价格点：开盘、收盘、最高、最低
            const pricePoints = [
                { price: candle.high, type: 'high', name: '最高价' },
                { price: candle.low, type: 'low', name: '最低价' },
                { price: candle.open, type: 'open', name: '开盘价' },
                { price: candle.close, type: 'close', name: '收盘价' }
            ];

            for (const point of pricePoints) {
                const screenY = this.candleSeries.priceToCoordinate(point.price);
                if (screenY !== null) {
                    const distance = Math.abs(screenPoint.y - screenY);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestSnap = {
                            time: candle.time,
                            price: point.price,
                            isSnapped: true,
                            snapType: point.type,
                            snapName: point.name,
                            candle: candle
                        };
                    }
                }
            }
        }

        return bestSnap;
    }

    // 获取附近的K线数据
    getNearbyCandles(targetTime) {
        const candles = [];
        const timeIndex = allCandleData.findIndex(candle => candle.time >= targetTime);

        // 获取前后各2根K线
        for (let i = Math.max(0, timeIndex - 2); i <= Math.min(allCandleData.length - 1, timeIndex + 2); i++) {
            if (allCandleData[i]) {
                candles.push(allCandleData[i]);
            }
        }

        return candles;
    }

    // 显示捕捉指示器
    showSnapIndicator(point) {
        this.clearSnapIndicator();

        if (!point.isSnapped) return;

        try {
            // 创建一个临时的标记系列来显示捕捉点
            this.snapIndicator = this.chart.addLineSeries({
                color: '#FF6B6B',
                lineWidth: 3,
                priceLineVisible: false,
                lastValueVisible: false,
                lineStyle: LightweightCharts.LineStyle.Dashed,
            });

            // 创建一个小的十字标记
            const crossSize = 0.01; // 相对于价格的大小
            const crossData = [
                // 水平线
                { time: point.time, value: point.price - crossSize },
                { time: point.time, value: point.price + crossSize }
            ];

            this.snapIndicator.setData(crossData);

            console.log(`🎯 捕捉到${point.snapName}: ${point.price.toFixed(2)}`);
        } catch (error) {
            console.error('❌ 显示捕捉指示器失败:', error);
        }
    }

    // 清除捕捉指示器
    clearSnapIndicator() {
        if (this.snapIndicator) {
            try {
                this.chart.removeSeries(this.snapIndicator);
            } catch (error) {
                console.error('❌ 清除捕捉指示器失败:', error);
            }
            this.snapIndicator = null;
        }
    }

    // 显示预览（子类实现）
    showPreview(point) {
        // 子类实现
    }

    // 更新预览（子类实现）
    updatePreview(point) {
        // 子类实现
    }

    // 清除预览
    clearPreview() {
        if (this.previewSeries) {
            try {
                if (Array.isArray(this.previewSeries)) {
                    this.previewSeries.forEach(series => {
                        if (series) {
                            try {
                                this.chart.removeSeries(series);
                            } catch (e) {
                                console.warn('⚠️ 移除预览系列失败:', e);
                            }
                        }
                    });
                } else {
                    // 水平线工具使用价格线，其他工具使用线系列
                    if (this.constructor.name === 'HorizontalLineTool') {
                        try {
                            this.candleSeries.removePriceLine(this.previewSeries);
                        } catch (e) {
                            console.warn('⚠️ 移除价格线失败:', e);
                        }
                    } else {
                        try {
                            this.chart.removeSeries(this.previewSeries);
                        } catch (e) {
                            console.warn('⚠️ 移除线系列失败:', e);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ 清除预览失败:', error);
            }
            this.previewSeries = null;
        }
    }

    // 添加点（子类实现）
    addPoint(point) {
        // 子类实现
    }

    // 创建最终图形（子类实现）
    createDrawing() {
        // 子类实现
    }
}

function logToFile(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        data: data ? JSON.stringify(data, null, 2) : null,
        stack: level === 'ERROR' ? new Error().stack : null
    };

    frontendLogs.push(logEntry);
    if (frontendLogs.length > MAX_LOGS) {
        frontendLogs.shift(); // 保持日志数量在限制内
    }

    // 同时输出到控制台
    const consoleMsg = `[${timestamp}] ${level}: ${message}`;
    if (level === 'ERROR') {
        console.error(consoleMsg, data);
    } else if (level === 'WARN') {
        console.warn(consoleMsg, data);
    } else {
        console.log(consoleMsg, data);
    }
}

// 专门记录最后一根K线的详细日志
let lastKlineLogs = [];

function logLastKlineDetails(step, data, additionalInfo = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        step,
        data,
        additionalInfo
    };

    lastKlineLogs.push(logEntry);

    // 同时在控制台输出简化信息
    console.log(`🔍 [${step}] 最后一根K线:`, data);
}

function downloadLastKlineLogs() {
    const logsText = lastKlineLogs.map(log => {
        let entry = `[${log.timestamp}] ${log.step}`;
        entry += `\n数据: ${JSON.stringify(log.data, null, 2)}`;
        if (Object.keys(log.additionalInfo).length > 0) {
            entry += `\n附加信息: ${JSON.stringify(log.additionalInfo, null, 2)}`;
        }
        return entry;
    }).join('\n\n' + '='.repeat(80) + '\n\n');

    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `last_kline_logs_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadLogs() {
    const logsText = frontendLogs.map(log => {
        let entry = `[${log.timestamp}] ${log.level}: ${log.message}`;
        if (log.data) entry += `\nData: ${log.data}`;
        if (log.stack) entry += `\nStack: ${log.stack}`;
        return entry;
    }).join('\n\n');

    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `frontend_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 拖拽和缩放状态记录
let isDragging = false;
let isZooming = false;
let referenceBarTime = null;
let referenceBarLogicalPosition = null;
let savedZoomLevel = null; // 保存的缩放级别（每个K线的像素宽度）
let isBlockedByEndDateLimit = false; // 是否因截止日期限制而阻止了数据加载

// 更新图表标题
function updateChartTitle(titleElement = null) {
    const stockCode = document.getElementById('stockCode').value;
    const period = document.getElementById('period').value;
    const periodNames = {
        '1': '1分钟',
        '5': '5分钟',
        '15': '15分钟',
        '30': '30分钟',
        '60': '1小时',
        'D': '日线'
    };

    const titleText = `${stockCode} ${periodNames[period] || period}线`;

    if (titleElement) {
        titleElement.textContent = titleText;
    } else {
        // 如果没有传入元素，查找现有的标题元素
        const klineContainer = document.getElementById('klineChart');
        const existingTitle = klineContainer.querySelector('.chart-title');
        if (existingTitle) {
            existingTitle.textContent = titleText;
        }
    }
}

// 初始化图表
function initChart() {
    // 如果已存在图表，先销毁
    if (klineChart) {
        klineChart.remove();
    }
    if (volumeChart) {
        volumeChart.remove();
    }

    // 创建K线图表容器
    const klineContainer = document.getElementById('klineChart');

    // 移除之前的标题（如果存在）
    const existingTitle = klineContainer.querySelector('.chart-title');
    if (existingTitle) {
        existingTitle.remove();
    }

    // 创建浮动标题
    const chartTitle = document.createElement('div');
    chartTitle.className = 'chart-title';
    chartTitle.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 1000;
        background-color: rgba(255, 255, 255, 0.9);
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 16px;
        font-weight: bold;
        color: #333;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        pointer-events: none;
    `;

    // 设置初始标题
    updateChartTitle(chartTitle);
    klineContainer.appendChild(chartTitle);

    // 初始化专业画线工具系统（延迟执行，等待所有类加载完成）
    setTimeout(() => {
        // 尝试自动初始化，如果失败则等待手动初始化
        if (!initProfessionalDrawingSystem()) {
            console.log('⚠️ 自动初始化失败，请手动运行: initProfessionalDrawingSystem()');
        }
    }, 1000); // 增加延迟时间，确保所有类都已定义

    // 创建K线图表
    klineChart = LightweightCharts.createChart(klineContainer, {
        width: klineContainer.clientWidth,
        height: klineContainer.clientHeight,
        layout: {
            background: { color: '#ffffff' },
            textColor: '#333',
        },
        grid: {
            vertLines: {
                color: 'rgba(197, 203, 206, 0.5)',
            },
            horzLines: {
                color: 'rgba(197, 203, 206, 0.5)',
            },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
        },
        timeScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
            timeVisible: true,
            visible: true, // 显示K线图的时间轴
            // 移除时区设置，使用本地时区
        },
        // 交互功能配置
        handleScroll: true,
        handleScale: true,
        kineticScroll: {
            touch: true,
            mouse: true
        }
    });

    // 创建成交量图表容器
    const volumeContainer = document.getElementById('volumeChart');

    // 创建成交量图表
    volumeChart = LightweightCharts.createChart(volumeContainer, {
        width: volumeContainer.clientWidth,
        height: volumeContainer.clientHeight,
        layout: {
            background: { color: '#ffffff' },
            textColor: '#333',
        },
        grid: {
            vertLines: {
                color: 'rgba(197, 203, 206, 0.5)',
            },
            horzLines: {
                color: 'rgba(197, 203, 206, 0.5)',
            },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
        },
        timeScale: {
            borderColor: 'rgba(197, 203, 206, 0.8)',
            timeVisible: true,
            // 移除时区设置，使用本地时区
        },
        // 交互功能配置
        handleScroll: true,
        handleScale: true,
        kineticScroll: {
            touch: true,
            mouse: true
        }
    });

    // 在K线图表中创建K线图系列
    candleSeries = klineChart.addCandlestickSeries({
        upColor: '#00da3c',
        downColor: '#ec0000',
        borderUpColor: '#00da3c',
        borderDownColor: '#ec0000',
        wickUpColor: '#00da3c',
        wickDownColor: '#ec0000',
    });

    // 创建MA5线系列
    ma5Series = klineChart.addLineSeries({
        color: '#2196F3',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    // 创建MA10线系列
    ma10Series = klineChart.addLineSeries({
        color: '#E91E63',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    // 创建MA20线系列
    ma20Series = klineChart.addLineSeries({
        color: '#FF9800',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    // 在成交量图表中创建成交量系列
    volumeSeries = volumeChart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
            type: 'volume'
        },
    });

    // 同步两个图表的时间轴（简化版本，避免干扰数据加载检测）
    let isUpdatingTimeScale = false;

    klineChart.timeScale().subscribeVisibleLogicalRangeChange((newVisibleLogicalRange) => {
        console.log('📊 K线图逻辑范围变化:', newVisibleLogicalRange);
        if (newVisibleLogicalRange && !isUpdatingTimeScale) {
            isUpdatingTimeScale = true;
            console.log('🔄 同步K线图范围到成交量图');
            try {
                volumeChart.timeScale().setVisibleLogicalRange(newVisibleLogicalRange);
            } catch (e) {
                console.log('❌ 时间轴同步失败:', e);
            }
            setTimeout(() => { isUpdatingTimeScale = false; }, 50);
        }
    });

    volumeChart.timeScale().subscribeVisibleLogicalRangeChange((newVisibleLogicalRange) => {
        console.log('📈 成交量图逻辑范围变化:', newVisibleLogicalRange);
        if (newVisibleLogicalRange && !isUpdatingTimeScale) {
            isUpdatingTimeScale = true;
            console.log('🔄 同步成交量图范围到K线图');
            try {
                klineChart.timeScale().setVisibleLogicalRange(newVisibleLogicalRange);
            } catch (e) {
                console.log('❌ 时间轴同步失败:', e);
            }
            setTimeout(() => { isUpdatingTimeScale = false; }, 50);
        }
    });

    // 窗口大小改变时，重新调整图表大小
    window.addEventListener('resize', function() {
        const klineContainer = document.getElementById('klineChart');
        const volumeContainer = document.getElementById('volumeChart');

        if (klineChart) {
            klineChart.applyOptions({
                width: klineContainer.clientWidth,
                height: klineContainer.clientHeight
            });
        }

        if (volumeChart) {
            volumeChart.applyOptions({
                width: volumeContainer.clientWidth,
                height: volumeContainer.clientHeight
            });
        }
    });

    // 添加图表滚动事件监听器（使用K线图的时间轴）
    let lastCheckTime = 0;
    let eventCounter = 0;

    // 添加鼠标事件监听器来记录拖拽状态

    klineContainer.addEventListener('mousedown', (e) => {
        if (e.button === 0 && isDragEnabled) { // 左键且拖拽功能启用
            isDragging = true;
            recordReferenceBar();
            console.log('🖱️ 开始拖拽，记录参考K线');
        } else if (e.button === 0 && !isDragEnabled) {
            console.log('🎨 拖拽功能已禁用（画线模式）');
        }
    });

    klineContainer.addEventListener('mouseup', (e) => {
        if (e.button === 0 && isDragEnabled) { // 左键且拖拽功能启用
            isDragging = false;
            console.log('🖱️ 结束拖拽');
        }
    });

    klineContainer.addEventListener('mouseleave', () => {
        if (isDragEnabled) {
            isDragging = false;
            console.log('🖱️ 鼠标离开图表区域，结束拖拽');
        }
    });

    // 监听鼠标滚轮事件来检测缩放
    klineContainer.addEventListener('wheel', () => {
        isZooming = true;
        recordReferenceBar(); // 缩放时记录参考K线和缩放级别
        console.log('🔍 检测到缩放操作');

        // 延长缩放状态持续时间，确保数据检查能够识别缩放操作
        setTimeout(() => {
            isZooming = false;
            console.log('🔍 缩放状态结束');
        }, 500); // 延长到500ms
    });

    // 只使用 subscribeVisibleLogicalRangeChange，这个方法是确实存在的
    klineChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        eventCounter++;
        console.log(`🎯 [${eventCounter}] K线图逻辑范围变化事件触发:`, range);

        // 优化防抖：区分缩放和拖拽操作
        const now = Date.now();
        const timeSinceLastCheck = now - lastCheckTime;
        console.log(`⏱️ 距离上次检查: ${timeSinceLastCheck}ms, 是否正在缩放: ${isZooming}`);

        // 缩放操作使用较短的防抖时间，拖拽操作使用较长的防抖时间
        const debounceTime = isZooming ? 300 : 1000; // 缩放300ms，拖拽1000ms

        if (timeSinceLastCheck > debounceTime) {
            lastCheckTime = now;
            console.log(`✅ 防抖通过（${debounceTime}ms），准备检查数据需求`);

            // 缩放操作立即检查，拖拽操作延迟检查
            const checkDelay = isZooming ? 100 : 200;
            setTimeout(() => {
                console.log('🔍 开始执行数据需求检查');
                checkAndLoadMoreIfNeeded();
            }, checkDelay);
        } else {
            console.log(`⏸️ 防抖阻止（需要${debounceTime}ms），跳过检查`);
        }
    });
}

// 记录参考K线的位置
function recordReferenceBar() {
    if (!klineChart || allCandleData.length === 0) return;

    try {
        const visibleRange = klineChart.timeScale().getVisibleRange();
        const logicalRange = klineChart.timeScale().getVisibleLogicalRange();

        if (visibleRange && logicalRange) {
            // 选择可见范围中间的时间点作为参考
            const middleTime = (visibleRange.from + visibleRange.to) / 2;

            // 找到最接近中间时间的K线
            let closestBar = null;
            let minDiff = Infinity;

            for (const bar of allCandleData) {
                const diff = Math.abs(bar.time - middleTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestBar = bar;
                }
            }

            if (closestBar) {
                referenceBarTime = closestBar.time;
                // 计算该K线在逻辑范围中的相对位置
                const totalBars = logicalRange.to - logicalRange.from;
                const barIndex = allCandleData.findIndex(bar => bar.time === closestBar.time);
                if (barIndex !== -1) {
                    referenceBarLogicalPosition = (barIndex - logicalRange.from) / totalBars;
                    console.log('📍 记录参考K线:', new Date(referenceBarTime * 1000).toISOString().split('T')[0], '相对位置:', referenceBarLogicalPosition.toFixed(3));
                }
            }

            // 同时记录缩放级别
            recordZoomLevel();
        }
    } catch (e) {
        console.log('⚠️ 记录参考K线失败:', e);
    }
}

// 记录当前缩放级别
function recordZoomLevel() {
    if (!klineChart || allCandleData.length === 0) return;

    try {
        const logicalRange = klineChart.timeScale().getVisibleLogicalRange();
        const visibleRange = klineChart.timeScale().getVisibleRange();

        if (logicalRange && visibleRange) {
            // 计算每个K线的像素宽度作为缩放级别指标
            const visibleBars = logicalRange.to - logicalRange.from;
            const chartWidth = klineChart.options().width || 800; // 默认宽度
            savedZoomLevel = chartWidth / visibleBars;

            console.log('📏 记录缩放级别:', savedZoomLevel.toFixed(2), 'px/bar, 可见K线数:', visibleBars.toFixed(1));
        }
    } catch (e) {
        console.log('⚠️ 记录缩放级别失败:', e);
    }
}

// 恢复参考K线到记录的位置，同时恢复缩放级别
function restoreReferenceBarPosition() {
    if (!klineChart || !referenceBarTime || referenceBarLogicalPosition === null || allCandleData.length === 0) {
        console.log('⚠️ 无法恢复参考K线位置，缺少必要信息');
        return;
    }

    // 🚫 如果因截止日期限制而阻止了数据加载，不恢复位置
    if (isBlockedByEndDateLimit) {
        console.log('🚫 因截止日期限制，跳过位置恢复，保持用户调整');
        return;
    }

    try {
        // 找到参考K线在新数据中的索引
        const barIndex = allCandleData.findIndex(bar => bar.time === referenceBarTime);
        if (barIndex === -1) {
            console.log('⚠️ 参考K线在新数据中不存在');
            return;
        }

        // 如果有保存的缩放级别，先恢复缩放
        if (savedZoomLevel !== null) {
            const chartWidth = klineChart.options().width || 800;
            const targetVisibleBars = chartWidth / savedZoomLevel;

            // 计算新的逻辑范围，以参考K线为中心
            const newFrom = barIndex - (referenceBarLogicalPosition * targetVisibleBars);
            const newTo = newFrom + targetVisibleBars;

            // 设置新的逻辑范围
            klineChart.timeScale().setVisibleLogicalRange({
                from: Math.max(0, newFrom),
                to: Math.min(allCandleData.length - 1, newTo)
            });

            console.log('✅ 成功恢复参考K线位置和缩放级别');
        } else {
            // 没有缩放级别信息，只恢复位置
            const currentLogicalRange = klineChart.timeScale().getVisibleLogicalRange();
            if (!currentLogicalRange) return;

            const totalVisibleBars = currentLogicalRange.to - currentLogicalRange.from;
            const newFrom = barIndex - (referenceBarLogicalPosition * totalVisibleBars);
            const newTo = newFrom + totalVisibleBars;

            klineChart.timeScale().setVisibleLogicalRange({
                from: Math.max(0, newFrom),
                to: Math.min(allCandleData.length - 1, newTo)
            });

            console.log('✅ 成功恢复参考K线位置（无缩放信息）');
        }
    } catch (e) {
        console.log('❌ 恢复参考K线位置失败:', e);
    }
}

// 设置默认股票代码
document.getElementById('stockCode').value = '002951';

// 加载K线数据
function loadKlineData(loadMore = false) {
    logToFile('INFO', `🚀 开始加载K线数据`, { loadMore });

    if (isLoading) {
        logToFile('WARN', '⏳ 正在加载中，跳过请求');
        return;
    }

    const stockCode = document.getElementById('stockCode').value.trim();
    const period = document.getElementById('period').value;
    const limit = document.getElementById('limit').value || 1000; // 获取用户设置的K线数量
    const endDate = document.getElementById('endDate').value; // 获取截止日期

    logToFile('INFO', '📋 请求参数', { stockCode, period, limit, endDate, loadMore });

    if (!stockCode) {
        logToFile('ERROR', '❌ 股票代码为空');
        alert('请输入股票代码');
        return;
    }
    
    // 如果不是加载更多，重置页码和数据
    if (!loadMore) {
        currentPage = 1;
        allCandleData = [];
        startDate = null;
    }
    
    isLoading = true;
    
    // 显示加载中
    document.getElementById('loading').style.display = 'flex';
    
    // 构建API URL
    let apiUrl = `/api/kline?code=${stockCode}&period=${period}&limit=${limit}&page=${currentPage}`;
    if (endDate) {
        apiUrl += `&end_date=${endDate}`;
    }
    if (startDate) {
        apiUrl += `&start_date=${startDate}`;
    }
    
    // 从后端API获取数据
    logToFile('INFO', `🌐 发送API请求: ${apiUrl}`);
    fetch(apiUrl)
        .then(response => {
            logToFile('INFO', `📡 收到响应`, { status: response.status, ok: response.ok });
            if (!response.ok) {
                throw new Error(`网络请求错误: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            logToFile('INFO', `📊 解析JSON数据`, { dataType: typeof data, isArray: Array.isArray(data), length: data?.length });

            // 隐藏加载中
            document.getElementById('loading').style.display = 'none';
            isLoading = false;

            if (data.error) {
                logToFile('ERROR', `❌ 后端返回错误: ${data.error}`);
                alert('获取数据失败: ' + data.error);
                return;
            }
            
            // 如果是首次加载或切换了周期/股票，初始化图表
            if (!loadMore) {
                initChart();
            }
            
            // 处理并渲染K线图
            processAndRenderData(data, loadMore);

            // 只有在加载更多数据时才检查是否需要继续加载，避免周期切换时的递归调用
            if (loadMore) {
                // 延迟检查，确保图表完全渲染完成
                setTimeout(() => {
                    checkAndLoadMoreIfNeeded();
                }, 500);
            }
        })
        .catch(error => {
            logToFile('ERROR', `❌ API请求失败`, {
                message: error.message,
                stack: error.stack,
                apiUrl: apiUrl
            });
            document.getElementById('loading').style.display = 'none';
            isLoading = false;
            alert('获取数据失败: ' + error.message);
        });
}

// 处理并渲染数据
function processAndRenderData(data, loadMore) {
    logToFile('INFO', `🔄 开始处理数据`, { dataLength: data.length, loadMore });

    // 如果数据量太大，限制数量并警告用户
    const MAX_DATA_POINTS = 10000; // 最大数据点数，降低到10000
    if (data.length > MAX_DATA_POINTS) {
        logToFile('WARN', `⚠️ 数据量过大，限制为${MAX_DATA_POINTS}条`, { originalLength: data.length });
        data = data.slice(-MAX_DATA_POINTS); // 取最新的数据
        alert(`数据量过大(${data.length}条)，已自动限制为最新的${MAX_DATA_POINTS}条数据`);
    }

    // 分批转换数据格式，避免栈溢出
    const BATCH_SIZE = 1000;
    const newCandleData = [];

    // 特别记录最后几根K线的处理过程
    const currentPeriod = document.getElementById('period').value;
    if (currentPeriod === '60') {
        logLastKlineDetails('1-开始处理', {
            总数据量: data.length,
            最后一根原始数据: data[data.length - 1]
        });
    }

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const batchData = batch.map((item, index) => {
            // 解析日期，保留完整的时间信息
            let timestamp;

            // 获取当前周期来判断数据类型
            const currentPeriod = document.getElementById('period').value;

            if (currentPeriod === '1') {
                // 1分钟线，直接使用原始时间
                timestamp = new Date(item.date).getTime() / 1000;
            } else {
                // 其他周期（日线、小时线等），使用本地时间但加上8小时偏移
                const dateTime = item.date.replace(' ', 'T');
                const localDate = new Date(dateTime);
                // 加上8小时偏移，这样TradingView显示时会正确
                timestamp = (localDate.getTime() + 8 * 60 * 60 * 1000) / 1000;
            }

            const result = {
                time: timestamp,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
                volume: parseFloat(item.volume || 0),
                date: item.date // 保存原始日期字符串
            };

            // 特别记录小时K线的最后一根数据
            if (currentPeriod === '60' && i + index === data.length - 1) {
                logLastKlineDetails('2-数据转换', {
                    原始数据: {
                        date: item.date,
                        open: item.open,
                        close: item.close,
                        high: item.high,
                        low: item.low,
                        volume: item.volume
                    },
                    转换后: {
                        time: timestamp,
                        timeString: new Date(timestamp * 1000).toISOString(),
                        open: result.open,
                        close: result.close,
                        high: result.high,
                        low: result.low,
                        volume: result.volume
                    }
                });
            }

            return result;
        });
        newCandleData.push(...batchData);

        // 给浏览器一些时间处理其他任务
        if (i % (BATCH_SIZE * 5) === 0) {
            logToFile('INFO', `📊 已处理 ${i + batch.length}/${data.length} 条数据`);
        }
    }

    logToFile('INFO', `✅ 数据转换完成`, { convertedLength: newCandleData.length });

    // 特别记录小时K线转换完成后的最后一根数据
    if (currentPeriod === '60') {
        const lastKline = newCandleData[newCandleData.length - 1];
        logLastKlineDetails('3-转换完成', {
            date: lastKline.date,
            timeString: new Date(lastKline.time * 1000).toISOString(),
            open: lastKline.open,
            close: lastKline.close,
            high: lastKline.high,
            low: lastKline.low,
            volume: lastKline.volume
        });
    }

    // 按时间排序（确保数据按时间顺序）
    logToFile('INFO', `🔄 开始排序数据`, { length: newCandleData.length });
    newCandleData.sort((a, b) => a.time - b.time);
    logToFile('INFO', `✅ 数据排序完成`);

    // 特别记录小时K线排序后的最后一根数据
    if (currentPeriod === '60') {
        const lastKline = newCandleData[newCandleData.length - 1];
        logLastKlineDetails('4-排序完成', {
            date: lastKline.date,
            timeString: new Date(lastKline.time * 1000).toISOString(),
            open: lastKline.open,
            close: lastKline.close,
            high: lastKline.high,
            low: lastKline.low,
            volume: lastKline.volume
        });
    }

    // 如果是加载更多，合并数据
    if (loadMore && allCandleData.length > 0) {
        logToFile('INFO', `🔄 合并数据`, { existingLength: allCandleData.length, newLength: newCandleData.length });

        // 确保没有重复数据
        const existingTimes = new Set(allCandleData.map(item => item.time));
        const uniqueNewData = newCandleData.filter(item => !existingTimes.has(item.time));

        logToFile('INFO', `📊 去重后新数据`, { uniqueLength: uniqueNewData.length });

        // 合并数据，由于都已排序，可以更高效地合并
        if (uniqueNewData.length > 0) {
            allCandleData = [...allCandleData, ...uniqueNewData];
            // 重新排序合并后的数据
            allCandleData.sort((a, b) => a.time - b.time);
        }
    } else {
        allCandleData = newCandleData;
    }

    logToFile('INFO', `✅ 数据合并完成`, { totalLength: allCandleData.length });

    // 如果有数据，更新startDate为最早的数据日期
    if (allCandleData.length > 0) {
        // 使用reduce避免栈溢出，不使用Math.min(...array)
        const earliestTime = allCandleData.reduce((min, item) => Math.min(min, item.time), Infinity);
        startDate = new Date(earliestTime * 1000).toISOString().split('T')[0];
        logToFile('INFO', `📅 更新startDate`, { earliestTime, startDate, dataLength: allCandleData.length });
    }

    // 渲染K线图
    logToFile('INFO', `🎨 开始渲染K线图`, {
        totalDataLength: allCandleData.length,
        firstDataTime: allCandleData.length > 0 ? new Date(allCandleData[0].time * 1000).toISOString() : 'N/A',
        lastDataTime: allCandleData.length > 0 ? new Date(allCandleData[allCandleData.length - 1].time * 1000).toISOString() : 'N/A'
    });
    renderKlineChart(allCandleData);
}

// 渲染K线图
function renderKlineChart(data) {
    logToFile('INFO', `🎨 renderKlineChart开始`, {
        dataLength: data.length,
        hasChart: !!klineChart,
        hasCandleSeries: !!candleSeries
    });

    if (!candleSeries) {
        logToFile('ERROR', '❌ candleSeries不存在，无法渲染');
        return;
    }

    // 特别记录小时K线渲染前的最后一根数据
    const currentPeriod = document.getElementById('period').value;
    if (currentPeriod === '60') {
        const lastKline = data[data.length - 1];
        logLastKlineDetails('5-准备渲染', {
            原始日期: lastKline.date,
            时间戳: lastKline.time,
            转换时间: new Date(lastKline.time * 1000).toISOString(),
            开盘价: lastKline.open,
            最高价: lastKline.high,
            最低价: lastKline.low,
            收盘价: lastKline.close,
            成交量: lastKline.volume
        });
    }

    // 设置K线数据
    logToFile('INFO', `📊 设置K线数据到图表`);
    candleSeries.setData(data);

    // 验证图表中的最后一根K线数据
    if (currentPeriod === '60') {
        setTimeout(() => {
            try {
                // 获取图表中的所有数据
                const chartData = candleSeries.data();
                if (chartData && chartData.length > 0) {
                    const lastChartKline = chartData[chartData.length - 1];
                    logLastKlineDetails('6-图表验证', {
                        图表中的最后一根K线: {
                            时间戳: lastChartKline.time,
                            转换时间: new Date(lastChartKline.time * 1000).toISOString(),
                            开盘价: lastChartKline.open,
                            最高价: lastChartKline.high,
                            最低价: lastChartKline.low,
                            收盘价: lastChartKline.close
                        }
                    });
                }
            } catch (error) {
                console.log('获取图表数据失败:', error);
            }
        }, 100);
    }
    
    // 计算并设置MA5数据
    const ma5Data = calculateMA(5, data);
    ma5Series.setData(ma5Data);
    
    // 计算并设置MA10数据
    const ma10Data = calculateMA(10, data);
    ma10Series.setData(ma10Data);
    
    // 计算并设置MA20数据
    const ma20Data = calculateMA(20, data);
    ma20Series.setData(ma20Data);
    
    // 设置成交量数据
    const volumeData = data.map(item => ({
        time: item.time,
        value: item.volume,
        color: item.close >= item.open ? 'rgba(0, 150, 136, 0.8)' : 'rgba(255, 82, 82, 0.8)'
    }));
    volumeSeries.setData(volumeData);
    
    // 如果是首次加载，自动调整图表大小
    if (currentPage === 1) {
        klineChart.timeScale().fitContent();
        volumeChart.timeScale().fitContent();
    }

    // 更新最后一根K线的日期
    if (data && data.length > 0) {
        const lastCandle = data[data.length - 1];
        if (lastCandle && lastCandle.time) {
            const date = new Date(lastCandle.time * 1000);
            lastKlineDate = date.toISOString().split('T')[0];
            logToFile('INFO', '📅 更新最后一根K线日期:', { lastKlineDate });
        }
    }

    // 隐藏加载提示框
    document.getElementById('loading').style.display = 'none';
    isLoading = false;
}

// 检查并在需要时加载更多数据
function checkAndLoadMoreIfNeeded() {
    // 重置截止日期限制标志
    isBlockedByEndDateLimit = false;

    // 防止递归调用
    checkDataCallDepth++;
    logToFile('INFO', `🔍 开始检查数据需求`, { callDepth: checkDataCallDepth });

    if (checkDataCallDepth > 3) {
        logToFile('WARN', '⚠️ 检查数据需求递归调用过深，停止检查', { callDepth: checkDataCallDepth });
        checkDataCallDepth = 0;
        return;
    }

    if (!klineChart) {
        console.log('❌ K线图表不存在');
        checkDataCallDepth--;
        return;
    }

    if (isLoading) {
        console.log('⏳ 正在加载中，跳过检查');
        checkDataCallDepth--;
        return;
    }

    if (allCandleData.length === 0) {
        console.log('📊 没有当前数据，跳过检查');
        checkDataCallDepth--;
        return;
    }

    // 添加防护：确保图表已经完全初始化
    try {
        const testRange = klineChart.timeScale().getVisibleRange();
        if (!testRange) {
            console.log('⚠️ 图表尚未完全初始化，延迟检查');
            checkDataCallDepth--;
            setTimeout(() => checkAndLoadMoreIfNeeded(), 1000);
            return;
        }
    } catch (e) {
        console.log('⚠️ 图表访问异常，跳过检查:', e.message);
        checkDataCallDepth--;
        return;
    }

    const visibleRange = klineChart.timeScale().getVisibleRange();
    if (!visibleRange) {
        console.log('❌ 无法获取可见范围');
        return;
    }

    // 获取当前数据的时间范围，使用reduce避免栈溢出
    const dataStartTime = allCandleData.reduce((min, item) => Math.min(min, item.time), Infinity);
    const dataEndTime = allCandleData.reduce((max, item) => Math.max(max, item.time), -Infinity);

    logToFile('INFO', `📊 数据时间范围`, {
        dataStartTime,
        dataEndTime,
        startDate: new Date(dataStartTime * 1000).toISOString().split('T')[0],
        endDate: new Date(dataEndTime * 1000).toISOString().split('T')[0],
        dataLength: allCandleData.length
    });

    console.log('📅 可见范围:', new Date(visibleRange.from * 1000).toISOString().split('T')[0], '到', new Date(visibleRange.to * 1000).toISOString().split('T')[0]);
    console.log('📊 数据范围:', new Date(dataStartTime * 1000).toISOString().split('T')[0], '到', new Date(dataEndTime * 1000).toISOString().split('T')[0]);
    console.log('📈 当前数据量:', allCandleData.length);

    // 检查可见范围是否超出了数据范围（留一些缓冲区）
    const bufferDays = 5 * 24 * 60 * 60; // 5天的缓冲区（秒）
    const needEarlierData = visibleRange.from < (dataStartTime + bufferDays);
    let needLaterData = visibleRange.to > (dataEndTime - bufferDays);

    // 🚫 检查截止日期限制：拖拽和缩放不能获取截止日期之后的数据
    const endDateInput = document.getElementById('endDate');
    if (endDateInput && endDateInput.value) {
        const endDateLimit = new Date(endDateInput.value + 'T23:59:59').getTime() / 1000;
        if (needLaterData && visibleRange.to > endDateLimit) {
            logToFile('INFO', '🚫 拖拽/缩放受截止日期限制，不加载未来数据', {
                visibleTo: new Date(visibleRange.to * 1000).toISOString().split('T')[0],
                endDateLimit: new Date(endDateLimit * 1000).toISOString().split('T')[0]
            });

            // 显示用户友好的提示
            console.log(`🚫 已达到截止日期限制 (${endDateInput.value})，使用键盘右方向键或播放功能查看未来数据`);
            console.log('📍 图表位置将保持不变，允许您精确调整最后一根K线的显示位置');

            // 设置标志，表示因截止日期限制而阻止了数据加载
            isBlockedByEndDateLimit = true;

            needLaterData = false; // 禁止加载截止日期之后的数据
        }
    }

    console.log('🔍 检查结果:');
    console.log(`   需要更早数据: ${needEarlierData} (可见开始: ${visibleRange.from}, 数据开始+缓冲: ${dataStartTime + bufferDays})`);
    console.log(`   需要更晚数据: ${needLaterData} (可见结束: ${visibleRange.to}, 数据结束-缓冲: ${dataEndTime - bufferDays})`);

    if (needEarlierData) {
        console.log('🚀 触发加载更早的数据');
        loadHistoricalData('earlier', new Date(dataStartTime * 1000));
    }

    if (needLaterData) {
        console.log('🚀 触发加载更晚的数据');
        loadHistoricalData('later', new Date(dataEndTime * 1000));
    }

    if (!needEarlierData && !needLaterData) {
        console.log('✅ 当前数据充足，无需加载');
    }

    console.log('🔍 === 检查数据需求完成 ===');
    checkDataCallDepth--; // 递减计数器
}

// 加载历史数据
function loadHistoricalData(direction, referenceDate) {
    if (isLoading) {
        console.log('正在加载中，跳过请求');
        return;
    }

    isLoading = true;
    console.log(`开始加载${direction === 'earlier' ? '更早' : '更晚'}的数据`);

    const stockCode = document.getElementById('stockCode').value;
    const period = document.getElementById('period').value;

    // 计算需要请求的日期范围
    let startDate, endDate;
    const oneDay = 24 * 60 * 60 * 1000; // 一天的毫秒数
    const loadDays = 60; // 每次加载60天的数据

    if (direction === 'earlier') {
        // 加载更早的数据 - 从参考日期往前推
        endDate = new Date(referenceDate.getTime() - oneDay);
        startDate = new Date(endDate.getTime() - loadDays * oneDay);

        // 确保不会请求太早的数据（比如2020年之前）
        const earliestDate = new Date('2020-01-01');
        if (startDate < earliestDate) {
            startDate = earliestDate;
        }
    } else {
        // 加载更晚的数据 - 从参考日期往后推
        startDate = new Date(referenceDate.getTime() + oneDay);
        endDate = new Date(startDate.getTime() + loadDays * oneDay);

        // 🚫 首先检查截止日期限制
        const endDateInput = document.getElementById('endDate');
        if (endDateInput && endDateInput.value) {
            const endDateLimit = new Date(endDateInput.value + 'T23:59:59');
            if (endDate > endDateLimit) {
                endDate = endDateLimit;
                logToFile('INFO', '🚫 拖拽/缩放数据加载受截止日期限制', {
                    originalEndDate: new Date(startDate.getTime() + loadDays * oneDay).toISOString().split('T')[0],
                    limitedEndDate: endDate.toISOString().split('T')[0]
                });
            }

            // 如果开始日期已经超过截止日期，则不加载任何数据
            if (startDate > endDateLimit) {
                logToFile('INFO', '🚫 开始日期超过截止日期，取消加载', {
                    startDate: startDate.toISOString().split('T')[0],
                    endDateLimit: endDateLimit.toISOString().split('T')[0]
                });
                isLoading = false;
                return;
            }
        }

        // 确保不会请求未来的数据
        const today = new Date();
        if (endDate > today) {
            endDate = today;
        }
    }

    // 格式化日期
    const formatDate = (date) => date.toISOString().split('T')[0];
    const startDateStr = formatDate(startDate);
    const endDateStr = formatDate(endDate);

    console.log(`请求数据范围: ${startDateStr} 到 ${endDateStr}`);

    // 构建API URL
    const url = `/api/kline?code=${stockCode}&period=${period}&limit=1000&start_date=${startDateStr}&end_date=${endDateStr}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.log('加载历史数据失败:', data.error);
                return;
            }

            if (!Array.isArray(data) || data.length === 0) {
                console.log('没有更多历史数据');
                return;
            }

            console.log(`API返回 ${data.length} 条历史数据`);

            // 处理新数据
            const newCandleData = data.map(item => {
                // 解析日期，保留完整的时间信息
                let timestamp;

                // 获取当前周期来判断数据类型
                const currentPeriod = document.getElementById('period').value;

                if (currentPeriod === '1') {
                    // 1分钟线，直接使用原始时间
                    timestamp = new Date(item.date).getTime() / 1000;
                } else {
                    // 其他周期（日线、小时线等），使用UTC方法避免时区问题
                    const dateTime = item.date.replace(' ', 'T');
                    timestamp = new Date(dateTime + 'Z').getTime() / 1000;
                }

                return {
                    time: timestamp,
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close),
                    volume: parseFloat(item.volume || 0),
                    date: item.date // 保存原始日期字符串
                };
            });

            // 合并数据，避免重复
            const existingTimes = new Set(allCandleData.map(item => item.time));
            const uniqueNewData = newCandleData.filter(item => !existingTimes.has(item.time));

            if (uniqueNewData.length > 0) {
                console.log(`📊 准备合并 ${uniqueNewData.length} 条新数据`);

                // 合并数据并排序
                allCandleData = [...allCandleData, ...uniqueNewData].sort((a, b) => a.time - b.time);

                // 更新图表数据
                updateChartData(allCandleData);

                // 只有在没有被截止日期限制阻止时才恢复参考K线位置
                if (!isBlockedByEndDateLimit) {
                    setTimeout(() => {
                        restoreReferenceBarPosition();
                    }, 100);
                    console.log('✅ 恢复参考K线位置');
                } else {
                    console.log('🚫 因截止日期限制，保持用户调整的位置');
                }

                console.log(`✅ 合并了 ${uniqueNewData.length} 条新数据，总数据量: ${allCandleData.length}`);
            } else {
                console.log('ℹ️ 没有新的唯一数据需要合并');
            }
        })
        .catch(error => {
            console.error('加载历史数据出错:', error);
        })
        .finally(() => {
            isLoading = false;
            console.log('数据加载完成');
        });
}

// 更新图表数据而不重新创建图表
function updateChartData(candleData) {
    console.log('🔄 更新图表数据，数据量:', candleData.length);

    if (!klineChart || !volumeChart || !candleSeries || !volumeSeries || !ma5Series || !ma10Series || !ma20Series) {
        console.log('⚠️ 图表组件不存在，跳过更新以避免递归');
        return;
    }

    try {
        // 准备K线数据
        const klineData = candleData.map(item => ({
            time: item.time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        }));

        // 准备成交量数据
        const volumeData = candleData.map(item => ({
            time: item.time,
            value: item.volume,
            color: item.close >= item.open ? 'rgba(0, 150, 136, 0.8)' : 'rgba(255, 82, 82, 0.8)'
        }));

        // 计算移动平均线数据
        const ma5Data = calculateMA(5, candleData);
        const ma10Data = calculateMA(10, candleData);
        const ma20Data = calculateMA(20, candleData);

        // 更新所有数据
        candleSeries.setData(klineData);
        volumeSeries.setData(volumeData);
        ma5Series.setData(ma5Data);
        ma10Series.setData(ma10Data);
        ma20Series.setData(ma20Data);

        // 更新最后一根K线的日期
        if (candleData && candleData.length > 0) {
            const lastCandle = candleData[candleData.length - 1];
            if (lastCandle && lastCandle.time) {
                const date = new Date(lastCandle.time * 1000);
                lastKlineDate = date.toISOString().split('T')[0];
                console.log('📅 更新最后一根K线日期:', lastKlineDate);
            }
        }

        console.log('✅ 图表数据更新完成（包括移动平均线）');
    } catch (e) {
        console.log('❌ 更新图表数据失败:', e.message);
        // 不再回退到重新渲染，避免递归调用
    }
}



// 计算移动平均线
function calculateMA(dayCount, data) {
    if (!data || data.length === 0) return [];

    logToFile('INFO', `🔄 计算MA${dayCount}`, { dataLength: data.length });

    const result = [];
    // 数据已经排序，不需要重新排序
    const sortedData = data;

    // 使用滑动窗口算法优化计算
    let sum = 0;

    // 初始化前dayCount-1个数据的和
    for (let i = 0; i < Math.min(dayCount - 1, sortedData.length); i++) {
        sum += sortedData[i].close;
    }

    // 计算移动平均线
    for (let i = dayCount - 1; i < sortedData.length; i++) {
        // 添加新数据
        sum += sortedData[i].close;

        // 如果窗口大小超过dayCount，移除最旧的数据
        if (i >= dayCount) {
            sum -= sortedData[i - dayCount].close;
        }

        const maValue = sum / dayCount;
        result.push({
            time: sortedData[i].time,
            value: parseFloat(maValue.toFixed(2))
        });
    }

    logToFile('INFO', `✅ MA${dayCount}计算完成`, { resultLength: result.length });
    return result;
}

// 页面加载完成后自动加载K线图
document.addEventListener('DOMContentLoaded', function() {
    // 初始化图表
    initChart();
    
    // 设置截止日期默认值为当前日期
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    document.getElementById('endDate').value = `${year}-${month}-${day}`;
    
    // 监听周期选择器的变化
    document.getElementById('period').addEventListener('change', function() {
        loadKlineData();
    });
    
    // 监听截止日期选择器的变化
    document.getElementById('endDate').addEventListener('change', function() {
        loadKlineData();
    });

    // 添加键盘事件监听器
    document.addEventListener('keydown', handleKeyboardEvent);

    // 加载K线数据
    loadKlineData();

// 计算下一个交易日（跳过周末）
function getNextTradingDay(dateStr) {
    if (!dateStr) return null;

    console.log('📅 计算下一个交易日，输入:', dateStr);

    let date = new Date(dateStr);
    console.log('📅 解析的日期:', date, '星期:', date.getDay());

    // 添加一天
    date.setDate(date.getDate() + 1);
    console.log('📅 加一天后:', date, '星期:', date.getDay());

    // 如果是周六（6），跳到下周一
    if (date.getDay() === 6) {
        date.setDate(date.getDate() + 2);
        console.log('📅 跳过周六，到周一:', date);
    }
    // 如果是周日（0），跳到下周一
    else if (date.getDay() === 0) {
        date.setDate(date.getDate() + 1);
        console.log('📅 跳过周日，到周一:', date);
    }

    // 返回 YYYY-MM-DD 格式
    const result = date.toISOString().split('T')[0];
    console.log('📅 最终结果:', result);
    return result;
}

// 根据当前周期计算下一根K线的时间
function getNextKlineTime(lastKline, period) {
    if (!lastKline) {
        console.log('❌ lastKline 为空');
        return null;
    }

    console.log('🔍 [NEW VERSION] 解析最后K线信息:', {
        time: lastKline.time,
        date: lastKline.date,
        period: period
    });

    switch (period) {
        case 'D': // 日线
            const dateStr = lastKline.date ? lastKline.date.split(' ')[0] : new Date(lastKline.time * 1000).toISOString().split('T')[0];
            return getNextTradingDay(dateStr);

        case '60': // 小时线
            // 使用原始的K线数据中的日期字符串来避免时区问题
            const originalDate = lastKline.date;
            console.log('� 使用原始日期字符串:', originalDate);
            console.log('🔍 完整的lastKline对象:', lastKline);

            if (originalDate) {
                const timePart = originalDate.split(' ')[1]; // 提取时间部分
                console.log('🕐 提取的时间部分:', timePart);

                if (timePart === '10:30:00') {
                    // 10:30 → 11:30
                    console.log('📈 10:30 → 11:30');
                    const dateOnly = originalDate.split(' ')[0];
                    return new Date(dateOnly + ' 11:30:00');
                } else if (timePart === '11:30:00') {
                    // 11:30 → 14:00
                    console.log('📈 11:30 → 14:00');
                    const dateOnly = originalDate.split(' ')[0];
                    return new Date(dateOnly + ' 14:00:00');
                } else if (timePart === '14:00:00') {
                    // 14:00 → 15:00
                    console.log('📈 14:00 → 15:00');
                    const dateOnly = originalDate.split(' ')[0];
                    return new Date(dateOnly + ' 15:00:00');
                } else if (timePart === '15:00:00') {
                    // 15:00 → 下一个交易日的10:30
                    console.log('📈 15:00 → 下一个交易日10:30');
                    const dateOnly = originalDate.split(' ')[0];
                    console.log('🗓️ 当前日期:', dateOnly);
                    const nextDay = getNextTradingDay(dateOnly);
                    console.log('🗓️ 下一个交易日:', nextDay);
                    if (nextDay) {
                        const nextDateTime = new Date(nextDay + ' 10:30:00');
                        console.log('🕐 计算的下一个时间:', nextDateTime);
                        return nextDateTime;
                    }
                } else {
                    console.log('⚠️ 未匹配的小时线时间:', timePart);
                }
            } else {
                // 如果没有原始日期字符串，从时间戳反推
                console.log('⚠️ 没有原始日期字符串，从时间戳反推');
                const lastDate = new Date(lastKline.time * 1000);
                console.log('🕐 从时间戳解析的时间:', lastDate);

                // 检查是否是15:00（北京时间可能显示为23:00 UTC）
                const hour = lastDate.getHours();
                const minute = lastDate.getMinutes();
                console.log('🕐 解析的小时分钟:', { hour, minute });

                if ((hour === 15 && minute === 0) || (hour === 7 && minute === 0)) {
                    // 15:00 或者UTC时间的7:00（对应北京时间15:00）
                    console.log('📈 检测到15:00，计算下一个交易日10:30');
                    const dateStr = lastDate.toISOString().split('T')[0];
                    const nextDay = getNextTradingDay(dateStr);
                    if (nextDay) {
                        return new Date(nextDay + ' 10:30:00');
                    }
                }
            }

            // 如果无法解析，返回null
            console.log('❌ 无法解析小时线时间');
            return null;

        case '30': // 30分钟线
            const currentMinute = lastDate.getMinutes();
            const currentHour = lastDate.getHours();

            if (currentMinute === 0) {
                // 整点 → 30分
                return new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate(), currentHour, 30, 0);
            } else if (currentMinute === 30) {
                // 30分 → 下一个整点
                if (currentHour === 11) {
                    // 11:30 → 13:00
                    return new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate(), 13, 0, 0);
                } else if (currentHour === 15) {
                    // 15:00 → 下一个交易日的9:30
                    const nextDay = getNextTradingDay(lastDate.toISOString().split('T')[0]);
                    return new Date(nextDay + 'T09:30:00');
                } else {
                    // 其他情况：下一个整点
                    return new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate(), currentHour + 1, 0, 0);
                }
            }
            break;

        case '15': // 15分钟线
            const current15Min = lastDate.getMinutes();
            const current15Hour = lastDate.getHours();

            if (current15Min === 45 && current15Hour === 11) {
                // 11:45 → 13:00
                return new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate(), 13, 0, 0);
            } else if (current15Min === 0 && current15Hour === 15) {
                // 15:00 → 下一个交易日的9:30
                const nextDay = getNextTradingDay(lastDate.toISOString().split('T')[0]);
                return new Date(nextDay + 'T09:30:00');
            } else {
                // 其他情况：加15分钟
                return new Date(lastDate.getTime() + 15 * 60 * 1000);
            }
            break;

        case '5': // 5分钟线
        case '1': // 1分钟线
            const minutes = parseInt(period);
            const nextTime = new Date(lastDate.getTime() + minutes * 60 * 1000);

            // 检查是否跨越了非交易时间
            const nextHour = nextTime.getHours();
            const nextMinute = nextTime.getMinutes();

            if (nextHour === 11 && nextMinute > 30) {
                // 跨越午休时间，跳到13:00
                return new Date(nextTime.getFullYear(), nextTime.getMonth(), nextTime.getDate(), 13, 0, 0);
            } else if (nextHour >= 15 && nextMinute > 0) {
                // 跨越收盘时间，跳到下一个交易日的9:30
                const nextDay = getNextTradingDay(nextTime.toISOString().split('T')[0]);
                return new Date(nextDay + 'T09:30:00');
            }

            return nextTime;

        default:
            return null;
    }

    return null;
}

// 计算上一个交易日（跳过周末）
function getPreviousTradingDay(dateStr) {
    if (!dateStr) return null;

    let date = new Date(dateStr);

    // 减少一天
    date.setDate(date.getDate() - 1);

    // 如果是周日（0），跳到上周五
    if (date.getDay() === 0) {
        date.setDate(date.getDate() - 2);
    }
    // 如果是周六（6），跳到上周五
    else if (date.getDay() === 6) {
        date.setDate(date.getDate() - 1);
    }

    // 返回 YYYY-MM-DD 格式
    return date.toISOString().split('T')[0];
}

// 从K线数据中获取最后一根K线的日期
function getLastKlineDate() {
    if (!allCandleData || allCandleData.length === 0) {
        return null;
    }

    // 获取最后一根K线的时间戳
    const lastCandle = allCandleData[allCandleData.length - 1];
    if (!lastCandle || !lastCandle.time) {
        return null;
    }

    // 将时间戳转换为日期字符串
    const date = new Date(lastCandle.time * 1000);
    return date.toISOString().split('T')[0];
}

// 新的键盘事件处理函数（带步幅选择）
function handleKeyboardEventWithStride(event) {
    // 处理右方向键和左方向键
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); // 阻止默认行为

        const isRightKey = event.key === 'ArrowRight';
        logToFile('INFO', `🔑 检测到${isRightKey ? '右' : '左'}方向键按下`);
        console.log('键盘事件触发，按键:', event.key);

        if (isRightKey) {
            // 获取当前步幅选择
            const strideSelect = document.getElementById('stride');
            const periodSelect = document.getElementById('period');
            
            if (!strideSelect || !periodSelect) {
                console.error('步幅或周期选择元素未找到');
                addNextKline();
                return;
            }

            const selectedStride = parseInt(strideSelect.value) || 0;
            const selectedPeriod = periodSelect.value;
            
            console.log('当前步幅:', selectedStride, '当前周期:', selectedPeriod);
            
            // 如果是日线且选择了步幅
            if (selectedPeriod === 'D' && selectedStride > 0) {
                strideTarget = selectedStride;
                logToFile('INFO', `🚀 启用步幅功能，步幅为${selectedStride}`);
                strideEnabled = true;
                addNextKlineStride(strideEnabled,strideTarget);
            } else {
                // 非日线或未选择步幅，保持原有逻辑
                strideEnabled = false;
                addNextKline();
            }
        } else {
            // 左方向键逻辑保持不变
            // ...
        }
    }
}

// 旧的键盘事件处理函数（保留兼容）
function handleKeyboardEvent(event) {
    // 处理右方向键和左方向键
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); // 阻止默认行为

        const isRightKey = event.key === 'ArrowRight';
        logToFile('INFO', `🔑 检测到${isRightKey ? '右' : '左'}方向键按下`);

        if (isRightKey) {
            // 右方向键：添加下一根K线
            addNextKline();
        } else {
            // 左方向键：移除最后一根K线（如果需要的话）
            // 这里可以实现向前导航的逻辑
            logToFile('INFO', '⬅️ 左方向键功能暂未实现');
        }
    }
}
function addNextKlineStride(strideEnabled, strideTarget) {
    if (!allCandleData || allCandleData.length === 0) {
        logToFile('WARN', '⚠️ 没有K线数据，无法添加下一根');
        return;
    }
    let reduceDays = 0;
    if(currentStride == 240)
    {
        reduceDays = 1;
        currentStride = 0;
    }
    else if(currentStride == 0)
    {
        reduceDays = 1;
    }
    else{
        reduceDays = 2;
    }
    const currentPeriod = document.getElementById('period').value;
    const lastKline = allCandleData[allCandleData.length - reduceDays];
    
    // 使用新的基于数据的方法查找下一根K线
    findNextKlineFromDataStride(lastKline, currentPeriod,strideEnabled, strideTarget);
}

// 添加下一根K线
function addNextKline() {
    if (!allCandleData || allCandleData.length === 0) {
        logToFile('WARN', '⚠️ 没有K线数据，无法添加下一根');
        return;
    }
    

    const currentPeriod = document.getElementById('period').value;
    const lastKline = allCandleData[allCandleData.length - 1];

    console.log('🔍 开始查找下一根K线:', {
        currentPeriod: currentPeriod,
        lastKlineDate: lastKline.date,
        lastKlineTime: new Date(lastKline.time * 1000).toISOString(),
        allCandleDataLength: allCandleData.length,
        lastKlineTimestamp: lastKline.time
    });

    // 验证我们获取的确实是最后一根K线
    console.log('🔍 验证最后几根K线:', allCandleData.slice(-3).map(k => ({
        date: k.date,
        time: new Date(k.time * 1000).toISOString()
    })));

    // 使用新的基于数据的方法查找下一根K线
    findNextKlineFromData(lastKline, currentPeriod);
}
async function findNextKlineFromDataStride(lastKline, period, strideEnabled, strideTarget) {
    
    if(currentStride == 0)
    {
        const stockCode = document.getElementById('stockCode').value.trim();
        if (!stockCode) {
            logToFile('ERROR', '❌ 股票代码为空');
            return;
        }
        // 获取当前截止日期
        const endDateInput = document.getElementById('endDate');
        const currentEndDate = endDateInput.value;

        // 获取最后一根K线的日期
        const lastKlineDate = lastKline.date ? lastKline.date.split(' ')[0] : new Date(lastKline.time * 1000).toISOString().split('T')[0];

        console.log('📅 智能计算下一根K线:', {
            currentEndDate: currentEndDate,
            lastKlineDate: lastKlineDate,
            period: period
        });

        // 为了获取足够的数据，我们需要请求包含下一个交易日的数据
        const nextTradingDay = getNextTradingDay(currentEndDate);
        console.log('📅 请求数据到下一个交易日以确保有足够数据:', nextTradingDay);

        console.log('📅 查找下一根K线:', {
            currentEndDate: currentEndDate,
            nextTradingDay: nextTradingDay,
            period: period
        });

        if (!nextTradingDay) {
            logToFile('ERROR', '❌ 无法计算下一个交易日');
            return;
        }

        // 请求包含下一个交易日的数据，确保有足够的分钟数据
        try {
            const apiUrl = '/api/kline?code=${stockCode}&period=1&limit=1000&end_date=${nextTradingDay}';
            console.log('🌐 请求包含下一个交易日的分钟数据:', apiUrl);

            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`网络请求错误: ${response.status} ${response.statusText}`);
            }

            const minuteData = await response.json();
            strideData = minuteData;
            if (minuteData && minuteData.length > 0) {
                console.log('✅ 获取到下一个交易日的分钟数据:', minuteData.length, '条');

                // 检查分钟数据的日期范围
                console.log('📅 分钟数据日期范围:');
                console.log('  第一条:', minuteData[0].date);
                console.log('  最后一条:', minuteData[minuteData.length - 1].date);
                console.log('  期望日期: 2025-02-10');

                // 从分钟数据中聚合出下一根K线
                let nextKline;
                if(strideTarget == 240)
                {
                    // 日线：直接使用新的日线聚合函数
                    nextKline = aggregateNextDailyKline(minuteData, lastKlineDate);
                }
                else 
                {
                    currentStride += strideTarget;
                    // 其他周期：使用原有逻辑
                    nextKline = aggregateNextKlineFromMinuteData(minuteData, period, lastKline, currentStride);
                }

                if (nextKline) {
                    console.log('✅ 聚合出的新K线:', nextKline);

                    // 验证新K线的时间戳是否正确
                    // 使用与addKlineToChart相同的时间戳转换逻辑
                    let newKlineTimestamp;
                    if (period === '1') {
                        newKlineTimestamp = new Date(nextKline.date).getTime() / 1000;
                    } else {
                        // 使用UTC时间但加上8小时偏移，这样显示时会正确
                        const dateTime = nextKline.date.replace(' ', 'T');
                        const localDate = new Date(dateTime);
                        // 减去8小时的偏移，这样TradingView显示时会加回8小时
                        newKlineTimestamp = (localDate.getTime() + 8 * 60 * 60 * 1000) / 1000;
                    }

                    console.log('🕐 新K线时间戳转换详细信息:');
                    console.log('  原始日期:', nextKline.date);
                    console.log('  转换后的dateTime:', nextKline.date.replace(' ', 'T'));
                    console.log('  新K线时间戳:', newKlineTimestamp);
                    console.log('  转换回的日期:', new Date(newKlineTimestamp * 1000).toISOString());
                    console.log('  期望的日期应该根据当前K线计算');

                    const lastKlineTimestamp = allCandleData[allCandleData.length - 1].time;
                    strideLastKlineTimestamp = lastKlineTimestamp;
                    const comparisonResult = {
                        lastKlineTimestamp: lastKlineTimestamp,
                        lastKlineDate: new Date(lastKlineTimestamp * 1000).toISOString(),
                        newKlineTimestamp: newKlineTimestamp,
                        newKlineDate: new Date(newKlineTimestamp * 1000).toISOString(),
                        isNewer: newKlineTimestamp > lastKlineTimestamp
                    };

                    console.log('🕐 时间戳比较详细信息:');
                    console.log('  最后一根K线时间戳:', lastKlineTimestamp, '→', new Date(lastKlineTimestamp * 1000).toISOString());
                    console.log('  新K线时间戳:', newKlineTimestamp, '→', new Date(newKlineTimestamp * 1000).toISOString());
                    console.log('  新K线是否更新:', newKlineTimestamp > lastKlineTimestamp);
                    console.log('  时间差（秒）:', newKlineTimestamp - lastKlineTimestamp);

                    if (newKlineTimestamp > lastKlineTimestamp) {
                        // 添加到图表
                        addKlineToChart(nextKline, period);

                        // 更新截止日期
                        updateEndDateFromKline(nextKline.date);

                        logToFile('INFO', '✅ 成功添加下一根K线');
                    } else {
                        logToFile('ERROR', '❌ 新K线时间戳不正确，无法添加');
                    }
                } else {
                    logToFile('WARN', '⚠️ 无法从分钟数据聚合出K线');
                }
            } else {
                logToFile('WARN', '⚠️ 下一个交易日没有数据');
            }

        } catch (error) {
            logToFile('ERROR', '❌ 获取下一个交易日数据失败:', error);
        }
    }
    else
    {
        currentStride += strideTarget;
        let nextKline = aggregateNextKlineFromMinuteData(strideData, period, lastKline, 240);
        currentStride = 240;
        UpdateLastKlineToChart(nextKline, period);
        // 其他周期：使用原有逻辑
    }
}

// 基于现有数据查找下一根K线
async function findNextKlineFromData(lastKline, period) {
    const stockCode = document.getElementById('stockCode').value.trim();

    if (!stockCode) {
        logToFile('ERROR', '❌ 股票代码为空');
        return;
    }

    // 获取当前截止日期
    const endDateInput = document.getElementById('endDate');
    const currentEndDate = endDateInput.value;

    // 获取最后一根K线的日期
    const lastKlineDate = lastKline.date ? lastKline.date.split(' ')[0] : new Date(lastKline.time * 1000).toISOString().split('T')[0];

    console.log('📅 智能计算下一根K线:', {
        currentEndDate: currentEndDate,
        lastKlineDate: lastKlineDate,
        period: period
    });

    // 为了获取足够的数据，我们需要请求包含下一个交易日的数据
    const nextTradingDay = getNextTradingDay(currentEndDate);
    console.log('📅 请求数据到下一个交易日以确保有足够数据:', nextTradingDay);

    console.log('📅 查找下一根K线:', {
        currentEndDate: currentEndDate,
        nextTradingDay: nextTradingDay,
        period: period
    });

    if (!nextTradingDay) {
        logToFile('ERROR', '❌ 无法计算下一个交易日');
        return;
    }

    // 请求包含下一个交易日的数据，确保有足够的分钟数据
    try {
        const apiUrl = `/api/kline?code=${stockCode}&period=1&limit=1000&end_date=${nextTradingDay}`;
        console.log('🌐 请求包含下一个交易日的分钟数据:', apiUrl);

        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`网络请求错误: ${response.status} ${response.statusText}`);
        }

        const minuteData = await response.json();

        if (minuteData && minuteData.length > 0) {
            console.log('✅ 获取到下一个交易日的分钟数据:', minuteData.length, '条');

            // 检查分钟数据的日期范围
            console.log('📅 分钟数据日期范围:');
            console.log('  第一条:', minuteData[0].date);
            console.log('  最后一条:', minuteData[minuteData.length - 1].date);
            console.log('  期望日期: 2025-02-10');

            // 从分钟数据中聚合出下一根K线
            let nextKline;
            if (period === 'D') {
                // 日线：直接使用新的日线聚合函数
                nextKline = aggregateNextDailyKline(minuteData, lastKlineDate);
            } else {
                // 其他周期：使用原有逻辑
                nextKline = aggregateNextKlineFromMinuteData(minuteData, period, lastKline);
            }

            if (nextKline) {
                console.log('✅ 聚合出的新K线:', nextKline);

                // 验证新K线的时间戳是否正确
                // 使用与addKlineToChart相同的时间戳转换逻辑
                let newKlineTimestamp;
                if (period === '1') {
                    newKlineTimestamp = new Date(nextKline.date).getTime() / 1000;
                } else {
                    // 使用UTC时间但加上8小时偏移，这样显示时会正确
                    const dateTime = nextKline.date.replace(' ', 'T');
                    const localDate = new Date(dateTime);
                    // 减去8小时的偏移，这样TradingView显示时会加回8小时
                    newKlineTimestamp = (localDate.getTime() + 8 * 60 * 60 * 1000) / 1000;
                }

                console.log('🕐 新K线时间戳转换详细信息:');
                console.log('  原始日期:', nextKline.date);
                console.log('  转换后的dateTime:', nextKline.date.replace(' ', 'T'));
                console.log('  新K线时间戳:', newKlineTimestamp);
                console.log('  转换回的日期:', new Date(newKlineTimestamp * 1000).toISOString());
                console.log('  期望的日期应该根据当前K线计算');

                const lastKlineTimestamp = allCandleData[allCandleData.length - 1].time;

                const comparisonResult = {
                    lastKlineTimestamp: lastKlineTimestamp,
                    lastKlineDate: new Date(lastKlineTimestamp * 1000).toISOString(),
                    newKlineTimestamp: newKlineTimestamp,
                    newKlineDate: new Date(newKlineTimestamp * 1000).toISOString(),
                    isNewer: newKlineTimestamp > lastKlineTimestamp
                };

                console.log('🕐 时间戳比较详细信息:');
                console.log('  最后一根K线时间戳:', lastKlineTimestamp, '→', new Date(lastKlineTimestamp * 1000).toISOString());
                console.log('  新K线时间戳:', newKlineTimestamp, '→', new Date(newKlineTimestamp * 1000).toISOString());
                console.log('  新K线是否更新:', newKlineTimestamp > lastKlineTimestamp);
                console.log('  时间差（秒）:', newKlineTimestamp - lastKlineTimestamp);

                if (newKlineTimestamp > lastKlineTimestamp) {
                    // 添加到图表
                    addKlineToChart(nextKline, period);

                    // 更新截止日期
                    updateEndDateFromKline(nextKline.date);

                    logToFile('INFO', '✅ 成功添加下一根K线');
                } else {
                    logToFile('ERROR', '❌ 新K线时间戳不正确，无法添加');
                }
            } else {
                logToFile('WARN', '⚠️ 无法从分钟数据聚合出K线');
            }
        } else {
            logToFile('WARN', '⚠️ 下一个交易日没有数据');
        }

    } catch (error) {
        logToFile('ERROR', '❌ 获取下一个交易日数据失败:', error);
    }
}

// 从分钟数据聚合出下一根K线
function aggregateNextKlineFromMinuteData(minuteData, period, lastKline, minutes = 0) {
    if (!minuteData || minuteData.length === 0) {
        return null;
    }

    console.log('� 开始聚合下一根K线，周期:', period);
    console.log('🔍 最后一根K线:', lastKline.date);

    // 按时间排序
    minuteData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 获取最后一根K线的时间信息
    const lastKlineDate = lastKline.date;
    const lastTime = lastKlineDate.split(' ')[1]; // 提取时间部分
    const lastDateOnly = lastKlineDate.split(' ')[0]; // 提取日期部分

    console.log('🕐 最后一根K线时间分析:', {
        lastKlineDate: lastKlineDate,
        lastTime: lastTime,
        lastDateOnly: lastDateOnly
    });

    switch (period) {
        case 'D': // 日线：获取下一个交易日的日线
            return aggregateNextDailyKline(minuteData, lastDateOnly);

        case '60': // 小时线：获取下一根小时K线
            return aggregateNextHourlyKline(minuteData, lastTime, lastDateOnly);

        case '30': // 30分钟线：获取下一根30分钟K线
            return aggregateNext30MinKline(minuteData, lastTime, lastDateOnly);

        case '15': // 15分钟线：获取下一根15分钟K线
            return aggregateNext15MinKline(minuteData, lastTime, lastDateOnly);

        case '5': // 5分钟线：获取下一根5分钟K线
            return aggregateNext5MinKline(minuteData, lastTime, lastDateOnly);

        case '1': // 1分钟线：获取下一根1分钟K线
            return aggregateNext1MinKline(minuteData, lastKlineDate);
        case 'X':
            return aggregateNextPeriodKline(minuteData, lastTime, lastDateOnly, minutes);

        default:
            console.log('⚠️ 未支持的周期:', period);
            return null;
    }
}

// 聚合下一根小时K线
function aggregateNextPeriodKline(minuteData, lastTime, lastDateOnly, minutes) {
    console.log('📊 聚合下一根小时K线:', { lastTime, lastDateOnly });

    // 找到最后一根K线在分钟数据中的位置
    const lastKlineDateTime = `${lastDateOnly} ${lastTime}`;
    let lastKlineIndex = -1;

    for (let i = minuteData.length - 1; i >= 0; i--) {
        if (minuteData[i].date === lastKlineDateTime) {
            lastKlineIndex = i;
            break;
        }
    }

    console.log('🔍 在分钟数据中找到最后一根K线:', {
        lastKlineDateTime: lastKlineDateTime,
        lastKlineIndex: lastKlineIndex,
        totalMinuteData: minuteData.length
    });

    if (lastKlineIndex === -1) {
        console.log('⚠️ 在分钟数据中没有找到最后一根K线');
        return null;
    }

    // 从最后一根K线的下一分钟开始，取60分钟的数据
    const startIndex = lastKlineIndex + 1;
    const endIndex = startIndex + minutes; // 60分钟 = 1小时

    console.log('📊 计算下一根小时K线的数据范围:', {
        startIndex: startIndex,
        endIndex: endIndex,
        availableData: minuteData.length - startIndex
    });

    if (startIndex >= minuteData.length) {
        console.log('⚠️ 没有更多的分钟数据');
        return null;
    }

    // 取实际可用的数据（可能不足60分钟）
    const actualEndIndex = Math.min(endIndex, minuteData.length);
    const nextHourData = minuteData.slice(startIndex, actualEndIndex);

    if (nextHourData.length === 0) {
        console.log('⚠️ 没有下一小时的数据');
        return null;
    }

    console.log(`� 聚合下一根小时K线: ${nextHourData.length} 条分钟数据`);
    console.log('📅 数据时间范围:', {
        first: nextHourData[0].date,
        last: nextHourData[nextHourData.length - 1].date
    });

    // 详细分析聚合的数据
    console.log('🔍 聚合数据详细分析:');
    console.log('  前5条数据:', nextHourData.slice(0, 5).map(item => ({
        date: item.date,
        open: item.open,
        close: item.close,
        high: item.high,
        low: item.low
    })));
    console.log('  后5条数据:', nextHourData.slice(-5).map(item => ({
        date: item.date,
        open: item.open,
        close: item.close,
        high: item.high,
        low: item.low
    })));

    // 计算开高低收
    const openPrice = parseFloat(nextHourData[0].open);
    const closePrice = parseFloat(nextHourData[nextHourData.length - 1].close);
    const highPrice = Math.max(...nextHourData.map(item => parseFloat(item.high)));
    const lowPrice = Math.min(...nextHourData.map(item => parseFloat(item.low)));
    const totalVolume = nextHourData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0);

    console.log('💰 计算的OHLC:', {
        open: openPrice,
        high: highPrice,
        low: lowPrice,
        close: closePrice,
        volume: totalVolume
    });

    // 计算结束时间（使用最后一条数据的时间）
    const lastDataTime = nextHourData[nextHourData.length - 1].date;

    const result = {
        date: lastDataTime,
        open: openPrice,
        high: highPrice,
        low: lowPrice,
        close: closePrice,
        volume: totalVolume
    };

    console.log('✅ 最终聚合结果:', result);
    console.log('� 聚合结果详细检查:');
    console.log(`  � 日期: ${result.date}`);
    console.log(`  📈 开盘: ${result.open} (应该等于第一条数据: ${nextHourData[0].open})`);
    console.log(`  � 收盘: ${result.close} (应该等于最后一条数据: ${nextHourData[nextHourData.length - 1].close})`);
    console.log(`  📊 最高: ${result.high}`);
    console.log(`  📊 最低: ${result.low}`);
    console.log(`  📊 成交量: ${result.volume}`);

    return result;
}

// 从分钟数据聚合出指定周期的第一根K线
function aggregateFirstKlineFromMinuteData(minuteData, period) {
    if (!minuteData || minuteData.length === 0) {
        return null;
    }

    console.log('🔄 开始聚合第一根K线，周期:', period);

    // 按时间排序
    minuteData.sort((a, b) => new Date(a.date) - new Date(b.date));

    switch (period) {
        case 'D': // 日线：使用当天所有数据
            return aggregateDailyKline(minuteData);

        case '60': // 小时线：聚合当天所有小时K线
            return aggregateAllHourlyKlines(minuteData);

        case '30': // 30分钟线：使用9:30-10:00的数据
            return aggregate30MinKline(minuteData, '09:30:00', '10:00:00');

        case '15': // 15分钟线：使用9:30-9:45的数据
            return aggregate15MinKline(minuteData, '09:30:00', '09:45:00');

        case '5': // 5分钟线：使用9:30-9:35的数据
            return aggregate5MinKline(minuteData, '09:30:00', '09:35:00');

        case '1': // 1分钟线：使用9:30的数据
            return minuteData.find(item => item.date.includes('09:30:00'));

        default:
            console.log('⚠️ 未支持的周期:', period);
            return null;
    }
}

// 聚合当天所有小时K线
function aggregateAllHourlyKlines(minuteData) {
    if (!minuteData || minuteData.length === 0) {
        return [];
    }

    console.log('🔄 开始聚合当天所有小时K线');

    // 按时间排序
    minuteData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 找到目标日期（最后一条数据的日期）
    const targetDate = minuteData[minuteData.length - 1].date.split(' ')[0];
    console.log('🎯 目标日期:', targetDate);

    // 只筛选目标日期的数据
    const targetDateData = minuteData.filter(item => {
        return item.date.startsWith(targetDate);
    });

    console.log('📅 目标日期的数据量:', targetDateData.length);

    const hourlyKlines = [];

    // 上午第一小时: 9:30-10:30
    const morning1 = targetDateData.filter(item => {
        const time = item.date.split(' ')[1];
        return time >= '09:30:00' && time <= '10:30:00';
    });
    if (morning1.length > 0) {
        hourlyKlines.push(aggregateHourlyKline(morning1, '09:30:00', '10:30:00', targetDate));
    }

    // 上午第二小时: 10:30-11:30
    const morning2 = targetDateData.filter(item => {
        const time = item.date.split(' ')[1];
        return time > '10:30:00' && time <= '11:30:00';
    });
    if (morning2.length > 0) {
        hourlyKlines.push(aggregateHourlyKline(morning2, '10:30:00', '11:30:00', targetDate));
    }

    // 下午第一小时: 13:00-14:00
    const afternoon1 = targetDateData.filter(item => {
        const time = item.date.split(' ')[1];
        return time >= '13:00:00' && time <= '14:00:00';
    });
    if (afternoon1.length > 0) {
        hourlyKlines.push(aggregateHourlyKline(afternoon1, '13:00:00', '14:00:00', targetDate));
    }

    // 下午第二小时: 14:00-15:00
    const afternoon2 = targetDateData.filter(item => {
        const time = item.date.split(' ')[1];
        return time > '14:00:00' && time <= '15:00:00';
    });
    if (afternoon2.length > 0) {
        hourlyKlines.push(aggregateHourlyKline(afternoon2, '14:00:00', '15:00:00', targetDate));
    }

    console.log(`✅ 聚合出 ${hourlyKlines.length} 根小时K线`);

    // 返回所有小时K线
    return hourlyKlines;
}

// 聚合小时线K线（指定时间段）
function aggregateHourlyKline(filteredData, startTime, endTime, targetDate) {
    if (filteredData.length === 0) {
        console.log('⚠️ 没有找到指定时间段的数据');
        return null;
    }

    // 如果没有提供目标日期，从数据中提取
    if (!targetDate) {
        targetDate = filteredData[0].date.split(' ')[0];
    }

    console.log(`📊 聚合小时线 ${startTime}-${endTime}:`, filteredData.length, '条分钟数据');

    const result = {
        date: `${targetDate} ${endTime}`,
        open: parseFloat(filteredData[0].open),
        high: Math.max(...filteredData.map(item => parseFloat(item.high))),
        low: Math.min(...filteredData.map(item => parseFloat(item.low))),
        close: parseFloat(filteredData[filteredData.length - 1].close),
        volume: filteredData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
    };

    console.log(`📈 ${endTime} 小时K线:`, {
        open: result.open,
        high: result.high,
        low: result.low,
        close: result.close,
        volume: result.volume
    });

    return result;
}

// 聚合30分钟线K线
function aggregate30MinKline(minuteData, startTime, endTime) {
    const filteredData = minuteData.filter(item => {
        const time = item.date.split(' ')[1];
        return time >= startTime && time < endTime;
    });

    if (filteredData.length === 0) {
        return null;
    }

    const dateOnly = filteredData[0].date.split(' ')[0];

    return {
        date: `${dateOnly} ${endTime}`,
        open: parseFloat(filteredData[0].open),
        high: Math.max(...filteredData.map(item => parseFloat(item.high))),
        low: Math.min(...filteredData.map(item => parseFloat(item.low))),
        close: parseFloat(filteredData[filteredData.length - 1].close),
        volume: filteredData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
    };
}

// 聚合15分钟线K线
function aggregate15MinKline(minuteData, startTime, endTime) {
    const filteredData = minuteData.filter(item => {
        const time = item.date.split(' ')[1];
        return time >= startTime && time < endTime;
    });

    if (filteredData.length === 0) {
        return null;
    }

    const dateOnly = filteredData[0].date.split(' ')[0];

    return {
        date: `${dateOnly} ${endTime}`,
        open: parseFloat(filteredData[0].open),
        high: Math.max(...filteredData.map(item => parseFloat(item.high))),
        low: Math.min(...filteredData.map(item => parseFloat(item.low))),
        close: parseFloat(filteredData[filteredData.length - 1].close),
        volume: filteredData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
    };
}

// 聚合5分钟线K线
function aggregate5MinKline(minuteData, startTime, endTime) {
    const filteredData = minuteData.filter(item => {
        const time = item.date.split(' ')[1];
        return time >= startTime && time < endTime;
    });

    if (filteredData.length === 0) {
        return null;
    }

    const dateOnly = filteredData[0].date.split(' ')[0];

    return {
        date: `${dateOnly} ${endTime}`,
        open: parseFloat(filteredData[0].open),
        high: Math.max(...filteredData.map(item => parseFloat(item.high))),
        low: Math.min(...filteredData.map(item => parseFloat(item.low))),
        close: parseFloat(filteredData[filteredData.length - 1].close),
        volume: filteredData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
    };
}

// 聚合日线K线
function aggregateDailyKline(minuteData) {
    if (minuteData.length === 0) {
        return null;
    }

    const dateOnly = minuteData[0].date.split(' ')[0];

    return {
        date: `${dateOnly} 00:00:00`,
        open: parseFloat(minuteData[0].open),
        high: Math.max(...minuteData.map(item => parseFloat(item.high))),
        low: Math.min(...minuteData.map(item => parseFloat(item.low))),
        close: parseFloat(minuteData[minuteData.length - 1].close),
        volume: minuteData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
    };
}

// 聚合下一根日线K线
function aggregateNextDailyKline(minuteData, lastDateOnly) {
    console.log('📊 聚合下一根日线K线:', { lastDateOnly });

    if (minuteData.length === 0) {
        console.log('⚠️ 没有分钟数据');
        return null;
    }

    // 按时间排序
    minuteData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 获取下一个交易日的日期
    const nextTradingDay = getNextTradingDay(lastDateOnly);
    console.log('📅 下一个交易日:', nextTradingDay);

    if (!nextTradingDay) {
        console.log('❌ 无法计算下一个交易日');
        return null;
    }

    // 过滤出下一个交易日的数据
    const nextDayData = minuteData.filter(item => {
        const itemDate = item.date.split(' ')[0];
        return itemDate === nextTradingDay;
    });

    console.log('📊 下一个交易日的分钟数据:', {
        targetDate: nextTradingDay,
        dataCount: nextDayData.length,
        firstData: nextDayData.length > 0 ? nextDayData[0].date : 'none',
        lastData: nextDayData.length > 0 ? nextDayData[nextDayData.length - 1].date : 'none'
    });

    if (nextDayData.length === 0) {
        console.log('⚠️ 下一个交易日没有数据');
        return null;
    }

    // 聚合成日线
    const result = {
        date: `${nextTradingDay} 00:00:00`,
        open: parseFloat(nextDayData[0].open),
        high: Math.max(...nextDayData.map(item => parseFloat(item.high))),
        low: Math.min(...nextDayData.map(item => parseFloat(item.low))),
        close: parseFloat(nextDayData[nextDayData.length - 1].close),
        volume: nextDayData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
    };

    console.log('✅ 聚合下一根日线完成:', {
        date: result.date,
        open: result.open,
        close: result.close,
        volume: result.volume
    });

    return result;
}

// 获取单根K线数据
async function fetchSingleKline(klineTime, period) {
    const stockCode = document.getElementById('stockCode').value.trim();

    if (!stockCode) {
        logToFile('ERROR', '❌ 股票代码为空');
        return;
    }

    // 构建API请求，获取指定时间的K线数据
    const timeStr = klineTime.toISOString().split('T')[0]; // 只取日期部分

    console.log('🎯 计算的下一根K线时间:', {
        klineTime: klineTime,
        timeStr: timeStr,
        period: period
    });

    // 对于未来的数据，我们需要模拟生成，因为API无法返回未来数据
    if (new Date(timeStr) > new Date()) {
        console.log('📅 检测到未来日期，生成模拟数据');
        generateSimulatedKline(klineTime, period);
        return;
    }

    const apiUrl = `/api/kline?code=${stockCode}&period=${period}&limit=10&end_date=${timeStr}`;

    logToFile('INFO', '🌐 请求单根K线数据:', { apiUrl });

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`网络请求错误: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data && data.length > 0) {
            // 找到匹配目标时间的K线
            const targetTimeStr = klineTime.toISOString().replace('T', ' ').substring(0, 19);
            console.log('🔍 查找目标时间:', targetTimeStr);

            let targetKline = null;

            // 查找匹配的K线
            for (let i = data.length - 1; i >= 0; i--) {
                const kline = data[i];
                console.log('🔍 检查K线:', kline.date);

                if (kline.date === targetTimeStr ||
                    kline.date.startsWith(targetTimeStr.split(' ')[0])) {
                    targetKline = kline;
                    break;
                }
            }

            if (!targetKline) {
                // 如果没找到精确匹配，使用最后一根
                targetKline = data[data.length - 1];
                console.log('⚠️ 未找到精确匹配，使用最后一根K线');
            }

            logToFile('INFO', '✅ 获取到新K线数据:', {
                date: targetKline.date,
                close: targetKline.close
            });

            // 添加到图表
            addKlineToChart(targetKline, period);

            // 更新截止日期
            updateEndDateFromKline(targetKline.date);

        } else {
            logToFile('WARN', '⚠️ 没有获取到新的K线数据');
        }

    } catch (error) {
        logToFile('ERROR', '❌ 获取单根K线数据失败:', error);
    }
}
function  UpdateLastKlineToChart(klineData, period) {
    // 转换时间戳
    let timestamp;
    console.log('🕐 转换K线时间戳:', {
        originalDate: klineData.date,
        period: period
    });

    if (period === '1') {
        timestamp = new Date(klineData.date).getTime() / 1000;
    } else {
        // 使用UTC时间但加上8小时偏移，这样显示时会正确
        const dateTime = klineData.date.replace(' ', 'T');
        const localDate = new Date(dateTime);
        // 减去8小时的偏移，这样TradingView显示时会加回8小时
        timestamp = (localDate.getTime() + 8 * 60 * 60 * 1000) / 1000;
    }

    console.log('� 转换结果:', {
        timestamp: timestamp,
        convertedDate: new Date(timestamp * 1000).toISOString()
    });

    console.log('� 准备添加到图表的K线数据:');
    console.log(`  � 原始日期: ${klineData.date}`);
    console.log(`  � 时间戳: ${timestamp}`);
    console.log(`  📈 开盘价: ${klineData.open}`);
    console.log(`  📈 最高价: ${klineData.high}`);
    console.log(`  📈 最低价: ${klineData.low}`);
    console.log(`  � 收盘价: ${klineData.close}`);
    console.log(`  📊 成交量: ${klineData.volume}`);

    // 创建新的K线数据
    const newCandle = {
        time: timestamp,
        open: parseFloat(klineData.open),
        high: parseFloat(klineData.high),
        low: parseFloat(klineData.low),
        close: parseFloat(klineData.close),
        volume: parseFloat(klineData.volume || 0),
        date: klineData.date
    };

    // 添加到全局数据数组
    //allCandleData.push(newCandle);
    allCandleData.pop();
    allCandleData.push(newCandle);

    // 更新图表（只添加新数据，不重新设置所有数据）
    if (candleSeries) {
        candleSeries.update({
            time: timestamp,
            open: newCandle.open,
            high: newCandle.high,
            low: newCandle.low,
            close: newCandle.close
        });
    }

    // 更新成交量
    if (volumeSeries) {
        volumeSeries.update({
            time: timestamp,
            value: newCandle.volume,
            color: newCandle.close >= newCandle.open ? 'rgba(0, 150, 136, 0.8)' : 'rgba(255, 82, 82, 0.8)'
        });
    }

    // 更新移动平均线
    updateMovingAveragesForNewKline();

    logToFile('INFO', '✅ 新K线已添加到图表');
}
// 将新K线添加到图表
function  addKlineToChart(klineData, period) {
    // 转换时间戳
    let timestamp;
    console.log('🕐 转换K线时间戳:', {
        originalDate: klineData.date,
        period: period
    });

    if (period === '1') {
        timestamp = new Date(klineData.date).getTime() / 1000;
    } else {
        // 使用UTC时间但加上8小时偏移，这样显示时会正确
        const dateTime = klineData.date.replace(' ', 'T');
        const localDate = new Date(dateTime);
        // 减去8小时的偏移，这样TradingView显示时会加回8小时
        timestamp = (localDate.getTime() + 8 * 60 * 60 * 1000) / 1000;
    }

    console.log('� 转换结果:', {
        timestamp: timestamp,
        convertedDate: new Date(timestamp * 1000).toISOString()
    });

    console.log('� 准备添加到图表的K线数据:');
    console.log(`  � 原始日期: ${klineData.date}`);
    console.log(`  � 时间戳: ${timestamp}`);
    console.log(`  📈 开盘价: ${klineData.open}`);
    console.log(`  📈 最高价: ${klineData.high}`);
    console.log(`  📈 最低价: ${klineData.low}`);
    console.log(`  � 收盘价: ${klineData.close}`);
    console.log(`  📊 成交量: ${klineData.volume}`);

    // 创建新的K线数据
    const newCandle = {
        time: timestamp,
        open: parseFloat(klineData.open),
        high: parseFloat(klineData.high),
        low: parseFloat(klineData.low),
        close: parseFloat(klineData.close),
        volume: parseFloat(klineData.volume || 0),
        date: klineData.date
    };

    // 添加到全局数据数组
    allCandleData.push(newCandle);

    // 更新图表（只添加新数据，不重新设置所有数据）
    if (candleSeries) {
        candleSeries.update({
            time: timestamp,
            open: newCandle.open,
            high: newCandle.high,
            low: newCandle.low,
            close: newCandle.close
        });
    }

    // 更新成交量
    if (volumeSeries) {
        volumeSeries.update({
            time: timestamp,
            value: newCandle.volume,
            color: newCandle.close >= newCandle.open ? 'rgba(0, 150, 136, 0.8)' : 'rgba(255, 82, 82, 0.8)'
        });
    }

    // 更新移动平均线
    updateMovingAveragesForNewKline();

    logToFile('INFO', '✅ 新K线已添加到图表');
}

// 为新K线更新移动平均线
function updateMovingAveragesForNewKline() {
    if (!ma5Series || !ma10Series || !ma20Series || allCandleData.length < 5) return;

    // 重新计算移动平均线（只计算最后几个点）
    const ma5Data = calculateMA(5, allCandleData);
    const ma10Data = calculateMA(10, allCandleData);
    const ma20Data = calculateMA(20, allCandleData);

    // 更新最后一个点
    if (ma5Data.length > 0) {
        const lastMA5 = ma5Data[ma5Data.length - 1];
        ma5Series.update(lastMA5);
    }

    if (ma10Data.length > 0) {
        const lastMA10 = ma10Data[ma10Data.length - 1];
        ma10Series.update(lastMA10);
    }

    if (ma20Data.length > 0) {
        const lastMA20 = ma20Data[ma20Data.length - 1];
        ma20Series.update(lastMA20);
    }
}

// 生成模拟K线数据（用于未来数据）
function generateSimulatedKline(klineTime, period) {
    if (!allCandleData || allCandleData.length === 0) {
        logToFile('WARN', '⚠️ 没有历史数据，无法生成模拟K线');
        return;
    }

    // 获取最后一根K线作为基础
    const lastKline = allCandleData[allCandleData.length - 1];
    const basePrice = lastKline.close;

    // 生成随机波动（±2%）
    const variation = (Math.random() - 0.5) * 0.04; // -2% 到 +2%
    const newClose = basePrice * (1 + variation);
    const newOpen = basePrice * (1 + (Math.random() - 0.5) * 0.02); // ±1%

    // 计算高低价
    const prices = [newOpen, newClose];
    const newHigh = Math.max(...prices) * (1 + Math.random() * 0.01); // 稍微高一点
    const newLow = Math.min(...prices) * (1 - Math.random() * 0.01); // 稍微低一点

    // 生成模拟成交量（基于历史平均）
    const avgVolume = allCandleData.slice(-10).reduce((sum, k) => sum + k.volume, 0) / 10;
    const newVolume = avgVolume * (0.5 + Math.random()); // 50%-150%的平均成交量

    // 创建模拟K线数据
    const simulatedKline = {
        date: klineTime.toISOString().replace('T', ' ').substring(0, 19),
        open: parseFloat(newOpen.toFixed(2)),
        high: parseFloat(newHigh.toFixed(2)),
        low: parseFloat(newLow.toFixed(2)),
        close: parseFloat(newClose.toFixed(2)),
        volume: Math.round(newVolume)
    };

    console.log('🎲 生成模拟K线数据:', simulatedKline);

    // 添加到图表
    addKlineToChart(simulatedKline, period);

    // 更新截止日期
    updateEndDateFromKline(simulatedKline.date);

    logToFile('INFO', '✅ 已生成并添加模拟K线数据');
}

// 更新截止日期输入框
function updateEndDateFromKline(klineDate) {
    const endDateInput = document.getElementById('endDate');
    const dateOnly = klineDate.split(' ')[0]; // 提取日期部分
    endDateInput.value = dateOnly;

    logToFile('INFO', '📅 更新截止日期:', { newEndDate: dateOnly });
}

// 测试2025-02-07小时K线数据的函数
async function testFeb07HourlyData() {
    console.log('🧪 开始测试2025-02-07小时K线数据...');

    try {
        // 获取分钟数据
        const response = await fetch('/api/kline?code=002951&period=1&limit=1000&end_date=2025-02-07');
        const minuteData = await response.json();

        console.log(`📊 获取到 ${minuteData.length} 条分钟数据`);

        // 筛选2025-02-07的数据
        const feb07Data = minuteData.filter(item => item.date.startsWith('2025-02-07'));
        console.log(`� 2025-02-07的分钟数据: ${feb07Data.length} 条`);

        // 显示最后一小时的数据
        const lastHourData = feb07Data.filter(item => {
            const time = item.date.split(' ')[1];
            return time > '14:00:00' && time <= '15:00:00';
        });

        console.log(`� 最后一小时(14:00-15:00)的分钟数据: ${lastHourData.length} 条`);
        console.log('📋 最后一小时的详细数据:');

        lastHourData.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.date}: 开${item.open} 高${item.high} 低${item.low} 收${item.close} 量${item.volume}`);
        });

        if (lastHourData.length > 0) {
            const aggregated = {
                date: '2025-02-07 15:00:00',
                open: parseFloat(lastHourData[0].open),
                high: Math.max(...lastHourData.map(item => parseFloat(item.high))),
                low: Math.min(...lastHourData.map(item => parseFloat(item.low))),
                close: parseFloat(lastHourData[lastHourData.length - 1].close),
                volume: lastHourData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
            };

            console.log('📊 聚合结果:');
            console.log(`  开盘价: ${aggregated.open} (第一条数据: ${lastHourData[0].open})`);
            console.log(`  最高价: ${aggregated.high}`);
            console.log(`  最低价: ${aggregated.low}`);
            console.log(`  收盘价: ${aggregated.close} (最后一条数据: ${lastHourData[lastHourData.length - 1].close})`);
            console.log(`  成交量: ${aggregated.volume}`);

            // 检查是否有异常
            if (aggregated.open !== parseFloat(lastHourData[0].open)) {
                console.log(`⚠️ 开盘价异常: 期望${lastHourData[0].open}, 实际${aggregated.open}`);
            }
            if (aggregated.close !== parseFloat(lastHourData[lastHourData.length - 1].close)) {
                console.log(`⚠️ 收盘价异常: 期望${lastHourData[lastHourData.length - 1].close}, 实际${aggregated.close}`);
            }

            console.log('✅ 测试完成');
        }

    } catch (error) {
        console.log(`❌ 测试失败: ${error.message}`);
    }
}

// 测试后端小时K线聚合的函数
async function testBackendHourlyAggregation() {
    console.log('🧪 开始测试后端小时K线聚合...');

    try {
        // 获取小时K线数据
        const hourlyResponse = await fetch('/api/kline?code=002951&period=60&limit=10&end_date=2025-02-07');
        const hourlyData = await hourlyResponse.json();

        console.log('📊 后端返回的小时K线数据:');
        hourlyData.forEach((kline, index) => {
            console.log(`  ${index + 1}. ${kline.date}: 开${kline.open} 高${kline.high} 低${kline.low} 收${kline.close} 量${kline.volume}`);
        });

        // 获取分钟K线数据
        const minuteResponse = await fetch('/api/kline?code=002951&period=1&limit=1000&end_date=2025-02-07');
        const minuteData = await minuteResponse.json();

        // 筛选2025-02-07的分钟数据
        const feb07MinuteData = minuteData.filter(item => item.date.startsWith('2025-02-07'));
        console.log(`� 2025-02-07的分钟数据: ${feb07MinuteData.length} 条`);

        // 筛选14:00-15:00的分钟数据
        const lastHourMinuteData = feb07MinuteData.filter(item => {
            const time = item.date.split(' ')[1];
            return time > '14:00:00' && time <= '15:00:00';
        });

        console.log(`� 14:00-15:00的分钟数据: ${lastHourMinuteData.length} 条`);
        console.log('📋 详细数据:');
        lastHourMinuteData.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item.date}: 开${item.open} 高${item.high} 低${item.low} 收${item.close} 量${item.volume}`);
        });

        if (lastHourMinuteData.length > 0) {
            const expectedAggregation = {
                开盘价: parseFloat(lastHourMinuteData[0].open),
                最高价: Math.max(...lastHourMinuteData.map(item => parseFloat(item.high))),
                最低价: Math.min(...lastHourMinuteData.map(item => parseFloat(item.low))),
                收盘价: parseFloat(lastHourMinuteData[lastHourMinuteData.length - 1].close),
                成交量: lastHourMinuteData.reduce((sum, item) => sum + parseFloat(item.volume || 0), 0)
            };

            console.log('🔍 期望的聚合结果:', expectedAggregation);

            // 找到对应的小时K线
            const correspondingHourly = hourlyData.find(item => item.date.includes('15:00:00'));
            if (correspondingHourly) {
                console.log('📊 后端返回的对应小时K线:', {
                    开盘价: correspondingHourly.open,
                    最高价: correspondingHourly.high,
                    最低价: correspondingHourly.low,
                    收盘价: correspondingHourly.close,
                    成交量: correspondingHourly.volume
                });

                console.log('⚖️ 对比结果:');
                console.log(`  开盘价: 期望${expectedAggregation.开盘价}, 实际${correspondingHourly.open}, ${expectedAggregation.开盘价 === correspondingHourly.open ? '✅' : '❌'}`);
                console.log(`  收盘价: 期望${expectedAggregation.收盘价}, 实际${correspondingHourly.close}, ${expectedAggregation.收盘价 === correspondingHourly.close ? '✅' : '❌'}`);
                console.log(`  最高价: 期望${expectedAggregation.最高价}, 实际${correspondingHourly.high}, ${expectedAggregation.最高价 === correspondingHourly.high ? '✅' : '❌'}`);
                console.log(`  最低价: 期望${expectedAggregation.最低价}, 实际${correspondingHourly.low}, ${expectedAggregation.最低价 === correspondingHourly.low ? '✅' : '❌'}`);
            }
        }

    } catch (error) {
        console.log(`❌ 测试失败: ${error.message}`);
    }
}

// 画线工具功能（使用新的专业系统）
function setDrawingTool(tool) {
    currentDrawingTool = tool;

    // 控制拖拽功能的启用/禁用
    if (tool === 'select') {
        isDragEnabled = true;
        console.log('✅ 启用拖拽功能');
    } else {
        isDragEnabled = false;
        console.log('🚫 禁用拖拽功能（画线模式）');
    }

    // 更新按钮状态
    document.querySelectorAll('.btn-group button').forEach(btn => {
        btn.classList.remove('active');
    });

    const toolButtons = {
        'select': 'selectTool',
        'trendLine': 'trendLineTool',
        'horizontalLine': 'horizontalLineTool',
        'verticalLine': 'verticalLineTool',
        'rectangle': 'rectangleTool',
        'delete': 'deleteTool'
    };

    if (toolButtons[tool]) {
        document.getElementById(toolButtons[tool]).classList.add('active');
    }

    // 使用新的画线工具系统
    if (drawingToolSystem) {
        drawingToolSystem.activateTool(tool);
        console.log('🎨 使用专业画线工具系统');
    } else {
        console.log('⚠️ 专业画线工具系统未初始化，使用旧系统');
    }

    // 重置旧的绘制状态（兼容性）
    isDrawing = false;
    drawingStartPoint = null;

    // 显示工具提示
    const toolTips = {
        'select': '✅ 选择模式：可以拖拽和缩放图表',
        'trendLine': '🎨 射线模式：只支持向右延伸射线，向左方向将提示使用其他工具（拖拽已禁用，↑↓键缩放）',
        'horizontalLine': '🎨 水平线模式：自动捕捉高低点，实时预览（拖拽已禁用，↑↓键缩放）',
        'verticalLine': '🎨 垂直线模式：自动捕捉高低点，实时预览（拖拽已禁用，↑↓键缩放）',
        'rectangle': '🎨 矩形模式：自动捕捉高低点，实时预览（拖拽已禁用，↑↓键缩放）',
        'delete': '🗑️ 删除模式：将鼠标移动到线条附近，线条高亮后点击删除（拖拽已禁用，↑↓键缩放）'
    };

    if (toolTips[tool]) {
        console.log(toolTips[tool]);
    }

    // 更新图表交互设置
    updateChartInteraction();
}

// 更新图表交互功能
function updateChartInteraction() {
    if (!klineChart || !volumeChart) return;

    const interactionEnabled = isDragEnabled;

    try {
        // 更新K线图表的交互设置
        klineChart.applyOptions({
            handleScroll: interactionEnabled,
            handleScale: interactionEnabled,
            kineticScroll: {
                touch: interactionEnabled,
                mouse: interactionEnabled
            }
        });

        // 更新成交量图表的交互设置
        volumeChart.applyOptions({
            handleScroll: interactionEnabled,
            handleScale: interactionEnabled,
            kineticScroll: {
                touch: interactionEnabled,
                mouse: interactionEnabled
            }
        });

        console.log('📊 图表交互功能已更新:', interactionEnabled ? '启用' : '禁用');
    } catch (error) {
        console.error('❌ 更新图表交互功能失败:', error);
    }
}

function clearAllDrawings() {
    if (drawingToolSystem) {
        drawingToolSystem.clearAll();
    } else {
        // 兼容旧系统
        drawings.forEach(drawing => {
            if (drawing.type === 'horizontalLine' && drawing.priceLine) {
                candleSeries.removePriceLine(drawing.priceLine);
            } else if (drawing.series) {
                if (Array.isArray(drawing.series)) {
                    // 矩形有多个series
                    drawing.series.forEach(series => {
                        klineChart.removeSeries(series);
                    });
                } else {
                    // 单个series
                    klineChart.removeSeries(drawing.series);
                }
            }
        });
        drawings = [];
        console.log('🗑️ 清除所有画线');
    }
}

function addTrendLine(point1, point2) {
    try {
        console.log('🎨 开始添加趋势线:', { point1, point2 });

        const lineData = [
            { time: point1.time, value: point1.price },
            { time: point2.time, value: point2.price }
        ];

        console.log('📊 趋势线数据:', lineData);

        const lineSeries = klineChart.addLineSeries({
            color: '#2196F3',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });

        lineSeries.setData(lineData);

        const drawing = {
            id: ++drawingId,
            type: 'trendLine',
            series: lineSeries,
            data: lineData
        };

        drawings.push(drawing);
        console.log('✅ 趋势线添加成功:', drawing.id);
        return drawing;
    } catch (error) {
        console.error('❌ 添加趋势线失败:', error);
        return null;
    }
}

function addHorizontalLine(price) {
    try {
        const priceLine = candleSeries.createPriceLine({
            price: price,
            color: '#FF9800',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `支撑/阻力 ${price.toFixed(2)}`
        });

        const drawing = {
            id: ++drawingId,
            type: 'horizontalLine',
            priceLine: priceLine,
            price: price
        };

        drawings.push(drawing);
        console.log('➖ 添加水平线:', price.toFixed(2));
        return drawing;
    } catch (error) {
        console.error('添加水平线失败:', error);
        return null;
    }
}

function addVerticalLine(time) {
    // TradingView Lightweight Charts 不直接支持垂直线
    // 我们用一条很短的线段来模拟
    const visibleRange = klineChart.timeScale().getVisibleLogicalRange();
    if (!visibleRange) return;

    // 获取当前价格范围
    const priceRange = candleSeries.priceScale().getVisiblePriceRange();
    if (!priceRange) return;

    const lineData = [
        { time: time, value: priceRange.minValue },
        { time: time, value: priceRange.maxValue }
    ];

    const lineSeries = klineChart.addLineSeries({
        color: '#9C27B0',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });

    lineSeries.setData(lineData);

    const drawing = {
        id: ++drawingId,
        type: 'verticalLine',
        series: lineSeries,
        time: time,
        data: lineData
    };

    drawings.push(drawing);
    console.log('↕️ 添加垂直线:', drawing);
    return drawing;
}

function addRectangle(point1, point2) {
    try {
        console.log('🎨 开始添加矩形:', { point1, point2 });

        // 矩形用四条线段组成
        const minTime = Math.min(point1.time, point2.time);
        const maxTime = Math.max(point1.time, point2.time);
        const minPrice = Math.min(point1.price, point2.price);
        const maxPrice = Math.max(point1.price, point2.price);

        console.log('📊 矩形边界:', { minTime, maxTime, minPrice, maxPrice });

    // 创建四条边
    const topLine = klineChart.addLineSeries({
        color: '#4CAF50',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });
    topLine.setData([
        { time: minTime, value: maxPrice },
        { time: maxTime, value: maxPrice }
    ]);

    const bottomLine = klineChart.addLineSeries({
        color: '#4CAF50',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });
    bottomLine.setData([
        { time: minTime, value: minPrice },
        { time: maxTime, value: minPrice }
    ]);

    const leftLine = klineChart.addLineSeries({
        color: '#4CAF50',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });
    leftLine.setData([
        { time: minTime, value: minPrice },
        { time: minTime, value: maxPrice }
    ]);

    const rightLine = klineChart.addLineSeries({
        color: '#4CAF50',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
    });
    rightLine.setData([
        { time: maxTime, value: minPrice },
        { time: maxTime, value: maxPrice }
    ]);

    const drawing = {
        id: ++drawingId,
        type: 'rectangle',
        series: [topLine, bottomLine, leftLine, rightLine],
        point1: point1,
        point2: point2
    };

        drawings.push(drawing);
        console.log('✅ 矩形添加成功:', drawing.id);
        return drawing;
    } catch (error) {
        console.error('❌ 添加矩形失败:', error);
        return null;
    }
}

function setupDrawingEventListeners() {
    // 如果专业画线工具系统已启用，跳过旧系统
    if (window.professionalDrawingSystemEnabled) {
        console.log('🚫 专业画线工具系统已启用，跳过旧系统设置');
        return;
    }

    if (!klineChart || !candleSeries) {
        console.log('⚠️ 图表或K线序列未初始化，跳过画线工具设置');
        return;
    }

    console.log('🔧 设置旧的画线工具系统（兼容模式）');

    try {
        // 先移除之前的监听器（如果存在）
        if (window.drawingClickHandler) {
            klineChart.unsubscribeClick(window.drawingClickHandler);
        }

        // 创建新的点击处理器
        window.drawingClickHandler = (param) => {
            console.log('🖱️ 检测到图表点击事件:', {
                tool: currentDrawingTool,
                hasPoint: !!param.point,
                hasTime: !!param.time,
                isDrawing: isDrawing
            });

            if (currentDrawingTool === 'select') {
                console.log('🖱️ 选择模式，忽略点击');
                return;
            }

            if (!param.point || !param.time) {
                console.log('⚠️ 无效的点击参数:', param);
                return;
            }

            const price = candleSeries.coordinateToPrice(param.point.y);
            if (price === null || price === undefined) {
                console.log('⚠️ 无法获取价格坐标:', param.point.y);
                return;
            }

            console.log('✅ 有效的图表点击:', {
                time: param.time,
                price: price.toFixed(2),
                tool: currentDrawingTool,
                isDrawing: isDrawing
            });

            switch (currentDrawingTool) {
                case 'horizontalLine':
                    console.log('🎨 绘制水平线...');
                    addHorizontalLine(price);
                    console.log('✅ 水平线绘制完成，继续绘制或点击"选择"退出');
                    break;

                case 'verticalLine':
                    console.log('🎨 绘制垂直线...');
                    addVerticalLine(param.time);
                    console.log('✅ 垂直线绘制完成，继续绘制或点击"选择"退出');
                    break;

                case 'trendLine':
                    if (!isDrawing) {
                        isDrawing = true;
                        drawingStartPoint = { time: param.time, price: price };
                        console.log('🎨 开始绘制趋势线，第一个点:', drawingStartPoint);
                        console.log('👆 请点击第二个点完成趋势线');
                    } else {
                        console.log('🎨 完成趋势线，第二个点:', { time: param.time, price: price });
                        addTrendLine(drawingStartPoint, { time: param.time, price: price });
                        isDrawing = false;
                        drawingStartPoint = null;
                        console.log('✅ 趋势线绘制完成，继续绘制或点击"选择"退出');
                    }
                    break;

                case 'rectangle':
                    if (!isDrawing) {
                        isDrawing = true;
                        drawingStartPoint = { time: param.time, price: price };
                        console.log('🎨 开始绘制矩形，第一个点:', drawingStartPoint);
                        console.log('👆 请点击对角点完成矩形');
                    } else {
                        console.log('🎨 完成矩形，第二个点:', { time: param.time, price: price });
                        addRectangle(drawingStartPoint, { time: param.time, price: price });
                        isDrawing = false;
                        drawingStartPoint = null;
                        console.log('✅ 矩形绘制完成，继续绘制或点击"选择"退出');
                    }
                    break;

                default:
                    console.log('⚠️ 未知的绘制工具:', currentDrawingTool);
            }
        };

        // 订阅点击事件
        klineChart.subscribeClick(window.drawingClickHandler);

        console.log('✅ 画线工具事件监听器已设置');
    } catch (error) {
        console.error('❌ 设置画线工具事件监听器失败:', error);
    }
}

// 测试画线工具的函数
function testDrawingTools() {
    console.log('🧪 开始测试画线工具...');

    if (!klineChart || !candleSeries) {
        console.log('❌ 图表未初始化');
        return;
    }

    // 获取一些示例数据点
    if (allCandleData.length < 2) {
        console.log('❌ 没有足够的K线数据');
        return;
    }

    const firstPoint = allCandleData[Math.floor(allCandleData.length * 0.3)];
    const secondPoint = allCandleData[Math.floor(allCandleData.length * 0.7)];

    console.log('📊 测试数据点:', { firstPoint, secondPoint });

    // 测试水平线
    console.log('🧪 测试水平线...');
    addHorizontalLine(firstPoint.close);

    // 测试趋势线
    console.log('🧪 测试趋势线...');
    addTrendLine(
        { time: firstPoint.time, price: firstPoint.low },
        { time: secondPoint.time, price: secondPoint.high }
    );

    // 测试矩形
    console.log('🧪 测试矩形...');
    addRectangle(
        { time: firstPoint.time, price: firstPoint.low },
        { time: secondPoint.time, price: firstPoint.high }
    );

    console.log('✅ 画线工具测试完成');
}

// ==================== 专业画线工具系统 ====================

// 画线工具基类
class DrawingTool {
    constructor(chart, candleSeries) {
        this.chart = chart;
        this.candleSeries = candleSeries;
        this.state = 'idle'; // idle, drawing, preview
        this.points = [];
        this.previewSeries = null;
        this.snapIndicator = null;
        this.snapDistance = 50; // 捕捉距离（像素）- 增加到50px
    }

    // 开始绘制
    start() {
        this.state = 'drawing';
        this.points = [];
        console.log(`🎨 开始绘制 ${this.constructor.name}`);
    }

    // 结束绘制
    finish() {
        this.state = 'idle';
        this.clearPreview();
        this.clearSnapIndicator();
        console.log(`✅ 完成绘制 ${this.constructor.name}`);
    }

    // 取消绘制
    cancel() {
        this.state = 'idle';
        this.points = [];
        this.clearPreview();
        this.clearSnapIndicator();
        console.log(`❌ 取消绘制 ${this.constructor.name}`);
    }

    // 处理鼠标移动
    onMouseMove(param) {
        if (!param.point || !param.time) return;

        // 避免在处理过程中重复调用
        if (this.isProcessingMouseMove) return;
        this.isProcessingMouseMove = true;

        try {
            const price = this.candleSeries.coordinateToPrice(param.point.y);
            if (price === null) return;

            const snapPoint = this.findSnapPoint(param.time, price, param.point);
            this.showSnapIndicator(snapPoint);

            if (this.state === 'drawing' && this.points.length > 0) {
                this.updatePreview(snapPoint);
            } else if (this.state === 'drawing') {
                this.showPreview(snapPoint);
            }
        } catch (error) {
            console.error('❌ 鼠标移动处理失败:', error);
        } finally {
            this.isProcessingMouseMove = false;
        }
    }

    // 处理鼠标点击
    onMouseClick(param) {
        if (!param.point || !param.time) return;

        const price = this.candleSeries.coordinateToPrice(param.point.y);
        if (price === null || !isFinite(price)) return;

        // 使用现有的改进捕捉逻辑
        const snapPoint = this.findSnapPoint(param.time, price, param.point);
        this.addPoint(snapPoint);
    }

    // 查找捕捉点（改进版，带详细日志）
    findSnapPoint(time, price, screenPoint) {
        //console.log(`🎯 开始捕捉点计算: 鼠标(${screenPoint.x}, ${screenPoint.y}), 时间=${time}, 价格=${price.toFixed(4)}`);

        // 验证输入参数
        if (!time || !price || !screenPoint) {
            //console.log('  ❌ 输入参数无效');
            return { time, price, isSnapped: false };
        }

        // 获取当前时间附近的K线数据，并按时间距离排序
        const nearbyCandles = this.getNearbyCandles(time);
        //console.log(`  📊 找到 ${nearbyCandles.length} 根附近的K线`);

        // 按时间距离排序，优先检查最近的K线
        nearbyCandles.sort((a, b) => {
            const distA = Math.abs(a.time - time);
            const distB = Math.abs(b.time - time);
            return distA - distB;
        });

        let bestSnap = {
            time: time, // 不强制取整，保持原始时间
            price: Number(price),
            isSnapped: false
        };
        let minDistance = this.snapDistance;

        //console.log(`  🎯 捕捉距离阈值: ${minDistance}px`);

        for (const candle of nearbyCandles) {
            // 验证K线数据有效性
            if (!candle || typeof candle.time !== 'number' ||
                typeof candle.high !== 'number' || typeof candle.low !== 'number' ||
                typeof candle.open !== 'number' || typeof candle.close !== 'number') {
                continue;
            }

            // 计算时间距离（屏幕坐标）
            const candleScreenX = this.chart.timeScale().timeToCoordinate(candle.time);
            if (candleScreenX === null) continue;

            const timeDistance = Math.abs(screenPoint.x - candleScreenX);
            //console.log(`    K线时间=${candle.time}, 屏幕X=${candleScreenX}, 时间距离=${timeDistance.toFixed(1)}px`);

            // 检查所有四个价格点：开盘、收盘、最高、最低
            const pricePoints = [
                { price: candle.high, type: 'high', name: '最高价' },
                { price: candle.low, type: 'low', name: '最低价' },
                { price: candle.open, type: 'open', name: '开盘价' },
                { price: candle.close, type: 'close', name: '收盘价' }
            ];

            for (const point of pricePoints) {
                // 验证价格有效性
                if (typeof point.price !== 'number' || !isFinite(point.price)) {
                    continue;
                }

                const screenY = this.candleSeries.priceToCoordinate(point.price);
                if (screenY !== null && typeof screenY === 'number') {
                    const priceDistance = Math.abs(screenPoint.y - screenY);

                    // 计算综合距离（时间 + 价格）
                    const totalDistance = Math.sqrt(timeDistance * timeDistance + priceDistance * priceDistance);

                    //console.log(`      ${point.name}=${point.price.toFixed(4)}, 屏幕Y=${screenY.toFixed(1)}, 价格距离=${priceDistance.toFixed(1)}px, 总距离=${totalDistance.toFixed(1)}px`);

                    if (totalDistance < minDistance) {
                        minDistance = totalDistance;
                        bestSnap = {
                            time: candle.time, // 使用K线的准确时间
                            price: Number(point.price.toFixed(6)),
                            isSnapped: true,
                            snapType: point.type,
                            snapName: point.name,
                            candle: candle,
                            distance: totalDistance
                        };
                        //console.log(`      🎯 新的最佳捕捉: ${point.name}, 距离=${totalDistance.toFixed(1)}px`);
                    }
                }
            }
        }

        if (bestSnap.isSnapped) {
            console.log(`  ✅ 捕捉成功: ${bestSnap.snapName}(${bestSnap.time}, ${bestSnap.price.toFixed(4)}), 距离=${bestSnap.distance.toFixed(1)}px`);
        } else {
            console.log(`  ⭕ 未捕捉: 使用原始位置(${time}, ${price.toFixed(4)})`);
        }

        return bestSnap;
    }

    // 获取附近的K线数据
    getNearbyCandles(targetTime) {
        const candles = [];
        const timeIndex = allCandleData.findIndex(candle => candle.time >= targetTime);

        // 获取前后各2根K线
        for (let i = Math.max(0, timeIndex - 2); i <= Math.min(allCandleData.length - 1, timeIndex + 2); i++) {
            if (allCandleData[i]) {
                candles.push(allCandleData[i]);
            }
        }

        return candles;
    }

    // 显示捕捉指示器
    showSnapIndicator(point) {
        this.clearSnapIndicator();

        if (!point || !point.isSnapped || !point.time || point.price === null || point.price === undefined) {
            return;
        }

        try {
            // 验证数据有效性
            if (typeof point.time !== 'number' || typeof point.price !== 'number') {
                console.warn('⚠️ 捕捉点数据无效:', point);
                return;
            }

            // 使用价格线而不是线系列来显示捕捉指示器，更稳定
            this.snapIndicator = this.candleSeries.createPriceLine({
                price: point.price,
                color: '#FF6B6B',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: false,
                title: `${point.snapName} ${point.price.toFixed(2)}`
            });

            console.log(`🎯 捕捉到${point.snapName}: ${point.price.toFixed(2)}`);
        } catch (error) {
            console.error('❌ 显示捕捉指示器失败:', error);
        }
    }

    // 清除捕捉指示器
    clearSnapIndicator() {
        if (this.snapIndicator) {
            try {
                // 使用价格线的移除方法
                this.candleSeries.removePriceLine(this.snapIndicator);
            } catch (error) {
                console.error('❌ 清除捕捉指示器失败:', error);
            }
            this.snapIndicator = null;
        }
    }

    // 显示预览（子类实现）
    showPreview(point) {
        // 子类实现
    }

    // 更新预览（子类实现）
    updatePreview(point) {
        // 子类实现
    }

    // 清除预览
    clearPreview() {
        if (this.previewSeries) {
            this.chart.removeSeries(this.previewSeries);
            this.previewSeries = null;
        }
    }

    // 添加点（子类实现）
    addPoint(point) {
        // 子类实现
    }

    // 创建最终图形（子类实现）
    createDrawing() {
        // 子类实现
    }
}

// 水平线工具
class HorizontalLineTool extends DrawingTool {
    showPreview(point) {
        this.clearPreview();

        // 验证数据有效性
        if (!point || point.price === null || point.price === undefined || typeof point.price !== 'number') {
            return;
        }

        try {
            // 创建预览水平线
            this.previewSeries = this.candleSeries.createPriceLine({
                price: point.price,
                color: 'rgba(255, 152, 0, 0.6)',
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: `预览 ${point.price.toFixed(2)}`
            });
        } catch (error) {
            console.error('❌ 创建水平线预览失败:', error);
        }
    }

    updatePreview(point) {
        this.showPreview(point);
    }

    // 水平线工具专用的清除预览方法
    clearPreview() {
        if (this.previewSeries) {
            try {
                // 水平线工具使用价格线
                this.candleSeries.removePriceLine(this.previewSeries);
            } catch (error) {
                console.warn('⚠️ 清除水平线预览失败:', error);
            }
            this.previewSeries = null;
        }
    }

    addPoint(point) {
        // 水平线只需要一个点
        this.points = [point];
        this.createDrawing();
        this.finish();

        // 保持在绘制状态，允许连续绘制
        setTimeout(() => {
            this.start();
        }, 100);
    }

    createDrawing() {
        if (this.points.length === 0) return;

        const point = this.points[0];
        const priceLine = this.candleSeries.createPriceLine({
            price: point.price,
            color: '#FF9800',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `支撑/阻力 ${point.price.toFixed(2)}`
        });

        const drawing = {
            id: ++drawingId,
            type: 'horizontalLine',
            priceLine: priceLine,
            price: point.price,
            isSnapped: point.isSnapped
        };

        drawings.push(drawing);
        console.log('➖ 水平线已添加:', point.price.toFixed(2), point.isSnapped ? '(已捕捉)' : '');
        return drawing;
    }
}

// 趋势线工具
class TrendLineTool extends DrawingTool {
    constructor(chart, candleSeries) {
        super(chart, candleSeries);
        this.lastPreviewUpdate = 0;
        this.previewThrottle = 100; // 限制预览更新频率为100ms
    }

    showPreview(point) {
        if (this.points.length === 0) {
            // 第一个点还没选择，不显示预览
            return;
        }

        // 限制预览更新频率，防止过度调用
        const now = Date.now();
        if (now - this.lastPreviewUpdate < this.previewThrottle) {
            return;
        }
        this.lastPreviewUpdate = now;

        // 严格验证数据有效性
        if (!this.isValidPoint(point) || !this.isValidPoint(this.points[0])) {
            return;
        }

        // 避免在预览更新过程中清除预览，防止递归
        if (this.isUpdatingPreview) {
            return;
        }

        this.isUpdatingPreview = true;

        try {
            // 只在必要时清除和重建预览
            if (!this.previewSeries) {
                this.createPreviewSeries();
            }

            if (this.previewSeries) {
                // 使用现有K线数据的时间戳，确保时间格式正确
                const point1 = this.normalizeToExistingTime(this.points[0]);
                const point2 = this.normalizeToExistingTime(point);

                if (point1 && point2) {
                    // 检查方向决定预览类型
                    const deltaTime = point2.time - point1.time;

                    if (deltaTime < 0) {
                        // 向左：显示警告预览，不创建实际预览
                        console.warn('⚠️ 向左射线预览：建议使用其他画线工具');
                        return;
                    }

                    // 向右：创建射线预览（减少视图干扰）
                    console.log('🎨 开始计算射线预览...');

                    // 标记视图更新状态，防止删除模式干扰
                    if (window.drawingToolSystem) {
                        window.drawingToolSystem.isViewUpdating = true;
                    }

                    const previewData = this.calculateRayData(point1, point2);

                    // 验证数据完整性
                    if (this.validateLineData(previewData)) {
                        this.previewSeries.setData(previewData);
                    }

                    // 清除视图更新标记
                    setTimeout(() => {
                        if (window.drawingToolSystem) {
                            window.drawingToolSystem.isViewUpdating = false;
                        }
                    }, 50);
                }
            }

        } catch (error) {
            console.error('❌ 更新趋势线预览失败:', error);
        } finally {
            this.isUpdatingPreview = false;
        }
    }

    // 保守的射线预览（使用更小的包围盒，避免视图抖动）
    calculateConservativeRayPreview(point1, point2) {
        try {
            const deltaTime = point2.time - point1.time;
            const deltaPrice = point2.price - point1.price;

            if (deltaTime === 0) {
                return [
                    { time: point1.time, value: point1.price },
                    { time: point2.time, value: point2.price }
                ];
            }

            // 获取保守的边界（更小的包围盒）
            const timeScale = this.chart.timeScale();
            const visibleTimeRange = timeScale.getVisibleRange();

            if (!visibleTimeRange) {
                // 如果无法获取边界，使用固定延伸
                const extensionLength = Math.abs(deltaTime) * 1.2;
                const slope = deltaPrice / deltaTime;
                const extendedTime = point2.time + extensionLength;
                const extendedPrice = point1.price + slope * (extendedTime - point1.time);

                return [
                    { time: point1.time, value: point1.price },
                    { time: point2.time, value: point2.price },
                    { time: extendedTime, value: extendedPrice }
                ];
            }

            // 计算保守的边界（比实际边界小10%）
            const timeRange = visibleTimeRange.to - visibleTimeRange.from;
            const conservativeMargin = timeRange * 0.1; // 10%的保守边距
            const conservativeMaxTime = visibleTimeRange.to - conservativeMargin;

            const slope = deltaPrice / deltaTime;

            // 延伸到保守边界
            let extendedTime = conservativeMaxTime;
            let extendedPrice = point1.price + slope * (extendedTime - point1.time);

            // 如果延伸点太近，至少延伸一定距离
            const minExtension = Math.abs(deltaTime) * 1.5;
            if (extendedTime - point2.time < minExtension) {
                extendedTime = point2.time + minExtension;
                extendedPrice = point1.price + slope * (extendedTime - point1.time);
            }

            return [
                { time: point1.time, value: point1.price },
                { time: extendedTime, value: extendedPrice }
            ];

        } catch (error) {
            console.error('❌ 计算保守预览失败:', error);
            return [
                { time: point1.time, value: point1.price },
                { time: point2.time, value: point2.price }
            ];
        }
    }

    // 创建预览线系列（只创建一次）
    createPreviewSeries() {
        try {
            this.previewSeries = this.chart.addLineSeries({
                color: 'rgba(33, 150, 243, 0.6)',
                lineWidth: 1,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false,
                autoscaleInfoProvider: () => null, // 防止自动缩放
            });

            // 保存当前视图范围（只在第一次创建时保存）
            if (!this.userAdjustedView) {
                this.savedVisibleRange = this.chart.timeScale().getVisibleRange();
            }
        } catch (error) {
            console.error('❌ 创建预览线系列失败:', error);
            this.previewSeries = null;
        }
    }

    // 将点的时间标准化为现有K线数据的时间戳
    normalizeToExistingTime(point) {
        if (!point || !allCandleData || allCandleData.length === 0) {
            return null;
        }

        // 找到最接近的K线时间戳
        let closestCandle = null;
        let minTimeDiff = Infinity;

        for (const candle of allCandleData) {
            const timeDiff = Math.abs(candle.time - point.time);
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestCandle = candle;
            }
        }

        if (!closestCandle) {
            return null;
        }

        return {
            time: closestCandle.time, // 使用现有的时间戳
            price: Number(point.price.toFixed(4)) // 保持原始价格但限制精度
        };
    }

    // 验证线条数据
    validateLineData(lineData) {
        if (!Array.isArray(lineData) || lineData.length < 2) {
            return false;
        }

        for (const point of lineData) {
            if (!point ||
                typeof point.time !== 'number' ||
                typeof point.value !== 'number' ||
                !isFinite(point.time) ||
                !isFinite(point.value) ||
                point.time <= 0) {
                return false;
            }
        }

        // 确保至少有两个不同时间的点
        return lineData[0].time !== lineData[1].time;
    }

    // 计算射线数据（在屏幕坐标系中计算交点）
    calculateRayData(point1, point2) {
        try {
            // 1. 转换到屏幕坐标
            const screenX1 = this.chart.timeScale().timeToCoordinate(point1.time);
            const screenY1 = this.candleSeries.priceToCoordinate(point1.price);
            const screenX2 = this.chart.timeScale().timeToCoordinate(point2.time);
            console.log('screenX2:'+ screenX2)
            const timex =  this.chart.timeScale().coordinateToTime(screenX2);
            console.log('timex:'+ timex)
            console.log('point2.time:'+point2.time)
            const screenY2 = this.candleSeries.priceToCoordinate(point2.price);
            
            if (screenX1 === null || screenY1 === null || screenX2 === null || screenY2 === null) {
                throw new Error('无法转换坐标');
            }

            //const timeRange=this.chart.timeScale().getVisibleRange()
            //const chartRight = this.chart.timeScale().timeToCoordinate(timeRange);
            // 2. 计算屏幕边界
            const chartWidth = this.chart.options().width - 55;
            
            const chartHeight = this.chart.options().height;
            
            const screenBoundaries = {
                left: 0,
                right: chartWidth,
                top: 0,
                bottom: chartHeight
            };

            // 3. 计算射线斜率
            const deltaX = screenX2 - screenX1;
            const deltaY = screenY2 - screenY1;
            
            if (deltaX === 0) {
                // 垂直线
                return [
                    { time: point1.time, value: point1.price },
                    { time: point2.time, value: point2.price }
                ];
            }

            const slope = deltaY / deltaX;
            const isRightward = deltaX > 0;

            // 4. 计算与屏幕边界的交点
            let intersectionX, intersectionY;
            
            if (isRightward) {
                // 向右射线：与右边界相交
                intersectionX = screenBoundaries.right-1;
                intersectionY = screenY1 + slope * (intersectionX - screenX1);
                
                // 检查是否先与上/下边界相交
                if (slope > 0 && intersectionY > screenBoundaries.bottom) {
                    intersectionY = screenBoundaries.bottom;
                    intersectionX = screenX1 + (intersectionY - screenY1) / slope;
                } else if (slope < 0 && intersectionY < screenBoundaries.top) {
                    intersectionY = screenBoundaries.top;
                    intersectionX = screenX1 + (intersectionY - screenY1) / slope;
                }
            } else {
                // 向左射线：与左边界相交
                intersectionX = screenBoundaries.left;
                intersectionY = screenY1 + slope * (intersectionX - screenX1);
                
                // 检查是否先与上/下边界相交
                if (slope < 0 && intersectionY > screenBoundaries.bottom) {
                    intersectionY = screenBoundaries.bottom;
                    intersectionX = screenX1 + (intersectionY - screenY1) / slope;
                } else if (slope > 0 && intersectionY < screenBoundaries.top) {
                    intersectionY = screenBoundaries.top;
                    intersectionX = screenX1 + (intersectionY - screenY1) / slope;
                }
            }

            // 5. 转换回价格-时间坐标
            const intersectionTime = this.chart.timeScale().coordinateToTime(intersectionX);
            const intersectionPrice = this.candleSeries.coordinateToPrice(intersectionY);
            if (intersectionPrice === null) {
                throw new Error('无法转换回坐标-price'+intersectionPrice);
            }
            if (intersectionTime === null ) {
                throw new Error('无法转换回坐标-time:'+intersectionX);
            }
  
            // 6. 创建射线数据
            const rayData = [
                { time: point1.time, value: point1.price },
                { time: intersectionTime, value: intersectionPrice }
            ];

            console.log('📏 屏幕坐标射线:', {
                start: { x: screenX1, y: screenY1 },
                direction: { x: screenX2, y: screenY2 },
                intersection: { x: intersectionX, y: intersectionY },
                result: rayData
            });

            return rayData;

        } catch (error) {
            console.error('❌ 计算射线数据失败:', error);
            return [
                { time: point1.time, value: point1.price },
                { time: point2.time, value: point2.price }
            ];
        }
    }

    // 获取图表的可见边界（使用更小的包围盒，带详细日志）
    getVisibleBoundaries() {
        try {
            console.log('🔍 开始计算可见边界:');

            const timeScale = this.chart.timeScale();
            const visibleTimeRange = timeScale.getVisibleRange();

            if (!visibleTimeRange) {
                console.log('  ❌ 无法获取可见时间范围');
                return null;
            }

            console.log(`  原始时间范围: [${visibleTimeRange.from} - ${visibleTimeRange.to}]`);

            // 获取价格范围（通过当前可见的K线数据）
            const visibleCandles = allCandleData.filter(candle =>
                candle.time >= visibleTimeRange.from && candle.time <= visibleTimeRange.to
            );

            console.log(`  可见K线数量: ${visibleCandles.length}`);

            if (visibleCandles.length === 0) {
                console.log('  ❌ 没有可见的K线数据');
                return null;
            }

            let minPrice = Infinity;
            let maxPrice = -Infinity;

            visibleCandles.forEach(candle => {
                minPrice = Math.min(minPrice, candle.low);
                maxPrice = Math.max(maxPrice, candle.high);
            });

            console.log(`  原始价格范围: [${minPrice.toFixed(4)} - ${maxPrice.toFixed(4)}]`);

            // 计算包围盒：确保射线能够正常延伸
            const timeRange = visibleTimeRange.to - visibleTimeRange.from;
            const priceRange = maxPrice - minPrice;

            // 时间边距：向外扩展20%，确保射线能延伸
            const timeMargin = timeRange * 0.2;
            // 价格边距：向外扩展15%
            const priceMargin = priceRange * 0.15;

            console.log(`  边距计算: 时间边距=${timeMargin.toFixed(0)}, 价格边距=${priceMargin.toFixed(4)}`);

            const boundaries = {
                minTime: visibleTimeRange.from - timeMargin,
                maxTime: visibleTimeRange.to + timeMargin,
                minPrice: minPrice - priceMargin,
                maxPrice: maxPrice + priceMargin
            };

            console.log(`  最终边界: 时间[${boundaries.minTime} - ${boundaries.maxTime}], 价格[${boundaries.minPrice.toFixed(4)} - ${boundaries.maxPrice.toFixed(4)}]`);

            return boundaries;
        } catch (error) {
            console.error('❌ 获取可见边界失败:', error);
            return null;
        }
    }

    // 这个方法已被删除，因为新的calculateRayData方法在屏幕坐标系中直接计算交点
    calculateRayBoundaryIntersection(point1, point2, boundaries, isRightward) {
        try {
            console.log('🔍 开始计算射线与边界交点:');
            console.log(`  起点: (${point1.time}, ${point1.price.toFixed(4)})`);
            console.log(`  方向点: (${point2.time}, ${point2.price.toFixed(4)})`);
            console.log(`  边界: 时间[${boundaries.minTime} - ${boundaries.maxTime}], 价格[${boundaries.minPrice.toFixed(4)} - ${boundaries.maxPrice.toFixed(4)}]`);
            console.log(`  方向: ${isRightward ? '向右' : '向左'}`);

            const deltaTime = point2.time - point1.time;
            const deltaPrice = point2.price - point1.price;
            const slope = deltaPrice / deltaTime;

            console.log(`  向量: Δt=${deltaTime}, Δp=${deltaPrice.toFixed(4)}, 斜率=${slope.toFixed(6)}`);

            let intersections = [];

            if (isRightward) {
                console.log('  🔍 计算向右射线的交点:');

                // 与右边界的交点
                const rightTime = boundaries.maxTime;
                const rightPrice = point1.price + slope * (rightTime - point1.time);
                console.log(`    右边界交点: t=${rightTime}, p=${rightPrice.toFixed(4)}`);
                console.log(`    右边界检查: p在范围内? ${rightPrice >= boundaries.minPrice && rightPrice <= boundaries.maxPrice}`);

                if (rightPrice >= boundaries.minPrice && rightPrice <= boundaries.maxPrice) {
                    intersections.push({ time: rightTime, price: rightPrice, type: 'right' });
                    console.log(`    ✅ 右边界交点有效`);
                }

                // 与上边界的交点
                if (slope > 0) {
                    const topPrice = boundaries.maxPrice;
                    const topTime = point1.time + (topPrice - point1.price) / slope;
                    console.log(`    上边界交点: t=${topTime}, p=${topPrice.toFixed(4)}`);
                    console.log(`    上边界检查: t在范围内? ${topTime >= boundaries.minTime && topTime <= boundaries.maxTime}`);

                    if (topTime >= boundaries.minTime && topTime <= boundaries.maxTime) {
                        intersections.push({ time: topTime, price: topPrice, type: 'top' });
                        console.log(`    ✅ 上边界交点有效`);
                    }
                } else {
                    console.log(`    ⏭️ 斜率≤0，跳过上边界`);
                }

                // 与下边界的交点
                if (slope < 0) {
                    const bottomPrice = boundaries.minPrice;
                    const bottomTime = point1.time + (bottomPrice - point1.price) / slope;
                    console.log(`    下边界交点: t=${bottomTime}, p=${bottomPrice.toFixed(4)}`);
                    console.log(`    下边界检查: t在范围内? ${bottomTime >= boundaries.minTime && bottomTime <= boundaries.maxTime}`);

                    if (bottomTime >= boundaries.minTime && bottomTime <= boundaries.maxTime) {
                        intersections.push({ time: bottomTime, price: bottomPrice, type: 'bottom' });
                        console.log(`    ✅ 下边界交点有效`);
                    }
                } else {
                    console.log(`    ⏭️ 斜率≥0，跳过下边界`);
                }
            } else {
                console.log('  🔍 计算向左射线的交点:');

                // 与左边界的交点
                const leftTime = boundaries.minTime;
                const leftPrice = point1.price + slope * (leftTime - point1.time);
                console.log(`    左边界交点: t=${leftTime}, p=${leftPrice.toFixed(4)}`);
                console.log(`    左边界检查: p在范围内? ${leftPrice >= boundaries.minPrice && leftPrice <= boundaries.maxPrice}`);

                if (leftPrice >= boundaries.minPrice && leftPrice <= boundaries.maxPrice) {
                    intersections.push({ time: leftTime, price: leftPrice, type: 'left' });
                    console.log(`    ✅ 左边界交点有效`);
                }

                // 与上边界的交点
                if (slope < 0) { // 向左且向上
                    const topPrice = boundaries.maxPrice;
                    const topTime = point1.time + (topPrice - point1.price) / slope;
                    console.log(`    上边界交点: t=${topTime}, p=${topPrice.toFixed(4)}`);
                    console.log(`    上边界检查: t在范围内? ${topTime >= boundaries.minTime && topTime <= boundaries.maxTime}`);

                    if (topTime >= boundaries.minTime && topTime <= boundaries.maxTime) {
                        intersections.push({ time: topTime, price: topPrice, type: 'top' });
                        console.log(`    ✅ 上边界交点有效`);
                    }
                } else {
                    console.log(`    ⏭️ 斜率≥0，跳过上边界`);
                }

                // 与下边界的交点
                if (slope > 0) { // 向左且向下
                    const bottomPrice = boundaries.minPrice;
                    const bottomTime = point1.time + (bottomPrice - point1.price) / slope;
                    console.log(`    下边界交点: t=${bottomTime}, p=${bottomPrice.toFixed(4)}`);
                    console.log(`    下边界检查: t在范围内? ${bottomTime >= boundaries.minTime && bottomTime <= boundaries.maxTime}`);

                    if (bottomTime >= boundaries.minTime && bottomTime <= boundaries.maxTime) {
                        intersections.push({ time: bottomTime, price: bottomPrice, type: 'bottom' });
                        console.log(`    ✅ 下边界交点有效`);
                    }
                } else {
                    console.log(`    ⏭️ 斜率≤0，跳过下边界`);
                }
            }

            console.log(`  📊 找到 ${intersections.length} 个有效交点:`, intersections);

            // 选择最近的交点
            if (intersections.length === 0) {
                console.log('  ❌ 没有找到有效交点');
                return null;
            }

            // 按距离排序，选择最近的交点
            intersections.forEach((intersection, index) => {
                const distance = Math.abs(intersection.time - point2.time);
                intersection.distance = distance;
                console.log(`  交点${index + 1}: ${intersection.type}边界, 距离=${distance.toFixed(0)}`);
            });

            intersections.sort((a, b) => a.distance - b.distance);

            const selectedIntersection = intersections[0];
            console.log(`  🎯 选择最近交点: ${selectedIntersection.type}边界 (${selectedIntersection.time}, ${selectedIntersection.price.toFixed(4)})`);

            // 验证选择的交点是否在射线延伸方向上
            // 射线应该从起点经过方向点继续延伸
            const isValidDirection = isRightward ?
                (selectedIntersection.time >= Math.max(point1.time, point2.time)) :
                (selectedIntersection.time <= Math.min(point1.time, point2.time));

            console.log(`  ✅ 方向验证: ${isValidDirection ? '通过' : '失败'} (交点时间=${selectedIntersection.time}, 起点时间=${point1.time}, 方向点时间=${point2.time})`);

            if (!isValidDirection) {
                console.log('  ⚠️ 交点不在射线延伸方向上，使用强制延伸方案');
                // 强制延伸：从方向点继续延伸
                const extensionLength = Math.abs(deltaTime) * 3; // 延伸3倍距离
                const backupTime = isRightward ?
                    point2.time + extensionLength :
                    point2.time - extensionLength;
                const backupPrice = point1.price + slope * (backupTime - point1.time);

                console.log(`  🔄 强制延伸方案: 从方向点(${point2.time})延伸到(${backupTime}), 价格=${backupPrice.toFixed(4)}`);
                return { time: backupTime, price: backupPrice, type: 'forced_extension' };
            }

            return selectedIntersection;

        } catch (error) {
            console.error('❌ 计算边界交点失败:', error);
            return null;
        }
    }

    // 验证点数据是否有效
    isValidPoint(point) {
        return point &&
               typeof point.time === 'number' &&
               point.time > 0 &&
               typeof point.price === 'number' &&
               !isNaN(point.price) &&
               isFinite(point.price);
    }

    // 清理点数据，确保格式正确
    sanitizePoint(point) {
        return {
            time: Math.floor(point.time), // 确保时间是整数
            price: Number(point.price.toFixed(6)) // 确保价格是有效数字
        };
    }

    // 验证线条数据是否有效
    isValidLineData(lineData) {
        return Array.isArray(lineData) &&
               lineData.length === 2 &&
               lineData.every(d =>
                   d &&
                   typeof d.time === 'number' &&
                   d.time > 0 &&
                   typeof d.value === 'number' &&
                   !isNaN(d.value) &&
                   isFinite(d.value)
               );
    }

    updatePreview(point) {
        this.showPreview(point);
    }

    // 趋势线工具专用的清除预览方法
    clearPreview() {
        // 避免在更新过程中清除，防止递归
        if (this.isUpdatingPreview) {
            return;
        }

        if (this.previewSeries) {
            try {
                this.chart.removeSeries(this.previewSeries);
            } catch (error) {
                console.warn('⚠️ 清除趋势线预览失败:', error);
            }
            this.previewSeries = null;
        }
        this.lastPreviewUpdate = 0;
    }

    addPoint(point) {
        this.points.push(point);

        if (this.points.length === 1) {
            console.log('📍 第一个点已选择:', point.price.toFixed(2), '请选择第二个点');
        } else if (this.points.length === 2) {
            // 检查方向，如果是向左，给出提示并重置
            const deltaTime = this.points[1].time - this.points[0].time;
            if (deltaTime < 0) {
                console.warn('⚠️ 向左射线可能导致图表问题，建议使用水平线或垂直线工具');
                alert('向左射线可能导致图表显示问题，建议使用其他画线工具。\n\n推荐：\n• 水平线：绘制水平支撑/阻力线\n• 垂直线：标记重要时间点');

                // 重置点并重新开始
                this.points = [];
                this.clearPreview();
                this.start();
                return;
            }

            this.createDrawing();
            this.finish();

            // 保持在绘制状态，允许连续绘制
            setTimeout(() => {
                this.start();
            }, 100);
        }
    }

    createDrawing() {
        if (this.points.length < 2) return;

        // 验证两个点都有效
        if (!this.isValidPoint(this.points[0]) || !this.isValidPoint(this.points[1])) {
            console.error('❌ 趋势线点数据无效:', this.points);
            return;
        }

        try {
            // 使用与预览相同的时间标准化逻辑
            const point1 = this.normalizeToExistingTime(this.points[0]);
            const point2 = this.normalizeToExistingTime(this.points[1]);

            if (!point1 || !point2) {
                console.error('❌ 无法标准化趋势线时间戳');
                return;
            }

            // 检查方向：如果是向左，创建简单线段；如果是向右，创建射线
            const deltaTime = point2.time - point1.time;
            let lineData;

            if (deltaTime > 0) {
                // 向右：创建射线数据
                lineData = this.calculateRayData(point1, point2);
                console.log('📈 创建向右射线');
            } else {
                // 向左：创建简单线段，避免TradingView错误
                lineData = [
                    { time: point1.time, value: point1.price },
                    { time: point2.time, value: point2.price }
                ];
                console.log('📈 创建向左线段（避免射线问题）');
            }

            // 最终验证
            if (!this.validateLineData(lineData)) {
                console.error('❌ 线条数据验证失败:', lineData);
                return;
            }

            const lineSeries = this.chart.addLineSeries({
                color: '#2196F3',
                lineWidth: 2,
                priceLineVisible: false,
                lastValueVisible: false,
                autoscaleInfoProvider: () => null, // 防止自动缩放
                visible: true,
                priceFormat: {
                    type: 'price',
                    precision: 4,
                    minMove: 0.0001,
                },
            });

            // 标记视图更新状态
            if (window.drawingToolSystem) {
                window.drawingToolSystem.isViewUpdating = true;
            }

            // 设置线条数据
            lineSeries.setData(lineData);

            // 简化的视图保护逻辑，减少频繁的视图恢复
            if (!this.userAdjustedView) {
                console.log('🔒 射线已创建，视图保护激活');

                // 延迟清除视图更新标记，给图表足够时间稳定
                setTimeout(() => {
                    if (window.drawingToolSystem) {
                        window.drawingToolSystem.isViewUpdating = false;
                    }
                }, 100);
            } else {
                console.log('🎯 用户已手动调整视图，跳过视图保护');

                // 立即清除视图更新标记
                if (window.drawingToolSystem) {
                    window.drawingToolSystem.isViewUpdating = false;
                }
            }

            const drawing = {
                id: ++drawingId,
                type: 'trendLine',
                series: lineSeries,
                points: [...this.points],
                data: lineData, // 存储线条数据
                isRay: deltaTime > 0 // 只有向右的才是射线
            };

            drawings.push(drawing);
            console.log('📈 射线已添加:',
                `起点(${point1.price.toFixed(2)}) -> 方向点(${point2.price.toFixed(2)}) -> 延伸`,
                this.points.some(p => p.isSnapped) ? '(包含捕捉点)' : ''
            );
            return drawing;
        } catch (error) {
            console.error('❌ 创建趋势线失败:', error);
            return null;
        }
    }
}

// 垂直线工具
class VerticalLineTool extends DrawingTool {
    showPreview(point) {
        this.clearPreview();

        // 获取价格范围来绘制垂直线
        const priceRange = this.candleSeries.priceScale().getVisiblePriceRange();
        if (!priceRange) return;

        const lineData = [
            { time: point.time, value: priceRange.minValue },
            { time: point.time, value: priceRange.maxValue }
        ];

        this.previewSeries = this.chart.addLineSeries({
            color: 'rgba(156, 39, 176, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
        });

        this.previewSeries.setData(lineData);
    }

    updatePreview(point) {
        this.showPreview(point);
    }

    addPoint(point) {
        this.points = [point];
        this.createDrawing();
        this.finish();

        // 保持在绘制状态，允许连续绘制
        setTimeout(() => {
            this.start();
        }, 100);
    }

    createDrawing() {
        if (this.points.length === 0) return;

        const point = this.points[0];
        const priceRange = this.candleSeries.priceScale().getVisiblePriceRange();
        if (!priceRange) return;

        const lineData = [
            { time: point.time, value: priceRange.minValue },
            { time: point.time, value: priceRange.maxValue }
        ];

        const lineSeries = this.chart.addLineSeries({
            color: '#9C27B0',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });

        lineSeries.setData(lineData);

        const drawing = {
            id: ++drawingId,
            type: 'verticalLine',
            series: lineSeries,
            time: point.time,
            data: lineData,
            isSnapped: point.isSnapped
        };

        drawings.push(drawing);
        console.log('↕️ 垂直线已添加:', new Date(point.time * 1000).toLocaleString(), point.isSnapped ? '(已捕捉)' : '');
        return drawing;
    }
}

// 矩形工具
class RectangleTool extends DrawingTool {
    showPreview(point) {
        if (this.points.length === 0) {
            return;
        }

        this.clearPreview();
        this.createRectanglePreview(this.points[0], point);
    }

    updatePreview(point) {
        this.showPreview(point);
    }

    addPoint(point) {
        this.points.push(point);

        if (this.points.length === 1) {
            console.log('📍 第一个角点已选择，请选择对角点');
        } else if (this.points.length === 2) {
            this.createDrawing();
            this.finish();

            // 保持在绘制状态，允许连续绘制
            setTimeout(() => {
                this.start();
            }, 100);
        }
    }

    createRectanglePreview(point1, point2) {
        const minTime = Math.min(point1.time, point2.time);
        const maxTime = Math.max(point1.time, point2.time);
        const minPrice = Math.min(point1.price, point2.price);
        const maxPrice = Math.max(point1.price, point2.price);

        // 创建四条预览线
        const lines = [];

        // 上边
        const topLine = this.chart.addLineSeries({
            color: 'rgba(76, 175, 80, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        topLine.setData([
            { time: minTime, value: maxPrice },
            { time: maxTime, value: maxPrice }
        ]);
        lines.push(topLine);

        // 下边
        const bottomLine = this.chart.addLineSeries({
            color: 'rgba(76, 175, 80, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        bottomLine.setData([
            { time: minTime, value: minPrice },
            { time: maxTime, value: minPrice }
        ]);
        lines.push(bottomLine);

        // 左边
        const leftLine = this.chart.addLineSeries({
            color: 'rgba(76, 175, 80, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        leftLine.setData([
            { time: minTime, value: minPrice },
            { time: minTime, value: maxPrice }
        ]);
        lines.push(leftLine);

        // 右边
        const rightLine = this.chart.addLineSeries({
            color: 'rgba(76, 175, 80, 0.6)',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        rightLine.setData([
            { time: maxTime, value: minPrice },
            { time: maxTime, value: maxPrice }
        ]);
        lines.push(rightLine);

        // 保存预览线条以便清除
        this.previewSeries = lines;
    }

    clearPreview() {
        if (this.previewSeries && Array.isArray(this.previewSeries)) {
            this.previewSeries.forEach(series => {
                this.chart.removeSeries(series);
            });
            this.previewSeries = null;
        }
    }

    createDrawing() {
        if (this.points.length < 2) return;

        const point1 = this.points[0];
        const point2 = this.points[1];
        const minTime = Math.min(point1.time, point2.time);
        const maxTime = Math.max(point1.time, point2.time);
        const minPrice = Math.min(point1.price, point2.price);
        const maxPrice = Math.max(point1.price, point2.price);

        // 创建四条边
        const lines = [];

        const topLine = this.chart.addLineSeries({
            color: '#4CAF50',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        topLine.setData([
            { time: minTime, value: maxPrice },
            { time: maxTime, value: maxPrice }
        ]);
        lines.push(topLine);

        const bottomLine = this.chart.addLineSeries({
            color: '#4CAF50',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        bottomLine.setData([
            { time: minTime, value: minPrice },
            { time: maxTime, value: minPrice }
        ]);
        lines.push(bottomLine);

        const leftLine = this.chart.addLineSeries({
            color: '#4CAF50',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        leftLine.setData([
            { time: minTime, value: minPrice },
            { time: minTime, value: maxPrice }
        ]);
        lines.push(leftLine);

        const rightLine = this.chart.addLineSeries({
            color: '#4CAF50',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        rightLine.setData([
            { time: maxTime, value: minPrice },
            { time: maxTime, value: maxPrice }
        ]);
        lines.push(rightLine);

        const drawing = {
            id: ++drawingId,
            type: 'rectangle',
            series: lines,
            points: [...this.points]
        };

        drawings.push(drawing);
        console.log('⬜ 矩形已添加:',
            `${minPrice.toFixed(2)}-${maxPrice.toFixed(2)}`,
            this.points.some(p => p.isSnapped) ? '(包含捕捉点)' : ''
        );
        return drawing;
    }
}

// 画线工具管理系统
class DrawingToolSystem {
    constructor(chart, candleSeries) {
        this.chart = chart;
        this.candleSeries = candleSeries;
        this.currentTool = null;
        this.tools = {
            'horizontalLine': new HorizontalLineTool(chart, candleSeries),
            'verticalLine': new VerticalLineTool(chart, candleSeries),
            'trendLine': new TrendLineTool(chart, candleSeries),
            'rectangle': new RectangleTool(chart, candleSeries)
        };

        // 删除功能相关
        this.deleteMode = false;
        this.highlightedDrawing = null;
        this.deleteDistance = 5; // 删除检测距离（像素）
        this.lastProximityCheck = 0; // 防止过度调用
        this.isClearingHighlight = false; // 防止递归清除
        this.isViewUpdating = false; // 视图更新状态标记

        this.setupEventListeners();
    }

    // 设置事件监听器
    setupEventListeners() {
        console.log('🔧 设置专业画线工具系统事件监听器...');

        // 移除之前的监听器
        if (window.drawingClickHandler) {
            try {
                this.chart.unsubscribeClick(window.drawingClickHandler);
                console.log('🗑️ 已移除旧的点击监听器');
            } catch (error) {
                console.log('⚠️ 移除旧点击监听器失败:', error);
            }
        }
        if (window.drawingMoveHandler) {
            try {
                this.chart.unsubscribeCrosshairMove(window.drawingMoveHandler);
                console.log('🗑️ 已移除旧的移动监听器');
            } catch (error) {
                console.log('⚠️ 移除旧移动监听器失败:', error);
            }
        }
        if (window.drawingKeyHandler) {
            try {
                document.removeEventListener('keydown', window.drawingKeyHandler);
                console.log('🗑️ 已移除旧的键盘监听器');
            } catch (error) {
                console.log('⚠️ 移除旧键盘监听器失败:', error);
            }
        }

        // 创建新的事件处理器
        const self = this;

        // 点击事件处理器
        window.drawingClickHandler = (param) => {
            console.log('🖱️ 专业系统检测到点击:', {
                hasTool: !!self.currentTool,
                toolState: self.currentTool ? self.currentTool.state : 'none',
                hasPoint: !!param.point,
                hasTime: !!param.time,
                deleteMode: self.deleteMode
            });

            // 删除模式处理
            if (self.deleteMode && self.highlightedDrawing) {
                self.deleteDrawing(self.highlightedDrawing);
                return;
            }

            if (self.currentTool && self.currentTool.state === 'drawing') {
                self.currentTool.onMouseClick(param);
            } else {
                console.log('⚠️ 没有激活的绘制工具或工具状态不正确');
            }
        };

        // 鼠标移动事件处理器
        window.drawingMoveHandler = (param) => {
            // 删除模式：检测鼠标是否接近已绘制的线条
            if (self.deleteMode) {
                self.checkDrawingProximity(param);
            } else if (self.currentTool && self.currentTool.state === 'drawing') {
                self.currentTool.onMouseMove(param);
            }
        };

        // 键盘事件处理器（用于画线时的缩放）
        window.drawingKeyHandler = (event) => {
            // 只在画线模式下响应键盘事件
            if (self.isDrawingMode()) {
                self.handleDrawingKeyboard(event);
            }
        };

        // 订阅事件
        try {
            this.chart.subscribeClick(window.drawingClickHandler);
            this.chart.subscribeCrosshairMove(window.drawingMoveHandler);
            document.addEventListener('keydown', window.drawingKeyHandler);
            console.log('✅ 专业画线工具系统事件监听器已设置（包含键盘缩放）');
        } catch (error) {
            console.error('❌ 设置专业画线工具系统事件监听器失败:', error);
        }
    }

    // 激活工具
    activateTool(toolName) {
        console.log(`🔧 激活工具: ${toolName}`);

        // 退出删除模式
        if (this.deleteMode) {
            this.exitDeleteMode();
        }

        // 取消当前工具并清理所有状态
        if (this.currentTool) {
            console.log('🔄 取消当前工具:', this.currentTool.constructor.name);
            this.currentTool.cancel();

            // 额外清理：确保所有预览和捕捉指示器都被清除
            try {
                this.currentTool.clearPreview();
                this.currentTool.clearSnapIndicator();
            } catch (error) {
                console.warn('⚠️ 清理工具状态时出错:', error);
            }
        }

        // 清理所有工具的状态（防止状态残留）
        Object.values(this.tools).forEach(tool => {
            try {
                tool.clearPreview();
                tool.clearSnapIndicator();
                tool.state = 'idle';
                tool.points = [];
            } catch (error) {
                console.warn('⚠️ 清理工具状态时出错:', error);
            }
        });

        // 检查是否是删除模式
        if (toolName === 'delete') {
            this.enterDeleteMode();
            return;
        }

        if (toolName === 'select' || !this.tools[toolName]) {
            this.currentTool = null;
            console.log('🖱️ 切换到选择模式');
            return;
        }

        if (!this.tools[toolName]) {
            console.error('❌ 工具不存在:', toolName);
            return;
        }

        this.currentTool = this.tools[toolName];
        this.currentTool.start();
        console.log(`✅ 工具已激活: ${toolName}, 状态: ${this.currentTool.state}`);
    }

    // 进入删除模式
    enterDeleteMode() {
        this.deleteMode = true;
        this.currentTool = null;
        this.clearHighlight();
        console.log('🗑️ 进入删除模式：将鼠标移动到线条附近进行删除');
    }

    // 退出删除模式
    exitDeleteMode() {
        this.deleteMode = false;
        this.clearHighlight();
        console.log('🚫 退出删除模式');
    }

    // 检测鼠标是否接近已绘制的线条
    checkDrawingProximity(param) {
        if (!param.point || !param.time) return;

        // 防止过度调用，限制检测频率
        const now = Date.now();
        if (this.lastProximityCheck && now - this.lastProximityCheck < 100) {
            return; // 增加限制间隔到100ms，减少频繁调用
        }
        this.lastProximityCheck = now;

        // 防止在视图更新期间进行距离计算
        if (this.isViewUpdating) {
            return;
        }

        let closestDrawing = null;
        let minDistance = this.deleteDistance;

        if (drawings.length === 0) {
            return;
        }

        // 缓存时间轴和价格轴的转换函数，避免重复调用
        const timeScale = this.chart.timeScale();
        const priceScale = this.candleSeries;

        for (const drawing of drawings) {
            try {
                const distance = this.getDistanceToDrawingSafe(drawing, param, timeScale, priceScale);

                if (isFinite(distance) && distance < minDistance) {
                    minDistance = distance;
                    closestDrawing = drawing;
                }
            } catch (error) {
                console.warn(`⚠️ 计算线条 ${drawing.type}(${drawing.id}) 距离失败:`, error.message);
                continue;
            }
        }

        // 更新高亮状态
        if (closestDrawing !== this.highlightedDrawing) {
            this.clearHighlight();
            if (closestDrawing) {
                console.log(`🔴 高亮线条: ${closestDrawing.type}(${closestDrawing.id}), 距离: ${minDistance.toFixed(2)}px`);
                this.highlightDrawing(closestDrawing);
            }
        }
    }

    // 安全的距离计算函数（避免触发视图更新）
    getDistanceToDrawingSafe(drawing, param, timeScale, priceScale) {
        try {
            switch (drawing.type) {
                case 'horizontalLine':
                    // 水平线距离计算
                    const lineY = priceScale.priceToCoordinate(drawing.price);
                    if (lineY === null || !isFinite(lineY)) return Infinity;
                    return Math.abs(param.point.y - lineY);

                case 'trendLine':
                    // 射线距离计算 - 使用缓存的坐标避免重复转换
                    if (!drawing.points || drawing.points.length < 2) return Infinity;

                    // 使用原始点进行距离计算，避免使用可能导致视图变化的数据
                    const point1 = drawing.points[0];
                    const point2 = drawing.points[1];

                    return this.getDistanceToLineSafe(point1, point2, param, timeScale, priceScale);

                case 'verticalLine':
                    // 垂直线距离计算
                    const lineX = timeScale.timeToCoordinate(drawing.time);
                    if (lineX === null || !isFinite(lineX)) return Infinity;
                    return Math.abs(param.point.x - lineX);

                case 'rectangle':
                    // 矩形距离计算（到边框的距离）
                    if (!drawing.points || drawing.points.length < 2) return Infinity;
                    return this.getDistanceToRectangleSafe(drawing.points[0], drawing.points[1], param, timeScale, priceScale);

                default:
                    return Infinity;
            }
        } catch (error) {
            console.warn('⚠️ 安全距离计算失败:', error.message);
            return Infinity;
        }
    }

    // 计算鼠标到线条的距离（保留原函数作为备用）
    getDistanceToDrawing(drawing, param) {
        const timeScale = this.chart.timeScale();
        return this.getDistanceToDrawingSafe(drawing, param, timeScale, this.candleSeries);
    }

    // 安全的线段距离计算（避免触发视图更新）
    getDistanceToLineSafe(point1, point2, mouseParam, timeScale, priceScale) {
        try {
            // 使用静态坐标转换，避免触发图表更新
            const x1 = timeScale.timeToCoordinate(point1.time);
            const y1 = priceScale.priceToCoordinate(point1.price);
            const x2 = timeScale.timeToCoordinate(point2.time);
            const y2 = priceScale.priceToCoordinate(point2.price);

            // 验证坐标有效性
            if (x1 === null || y1 === null || x2 === null || y2 === null ||
                !isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
                return Infinity;
            }

            const mouseX = mouseParam.point.x;
            const mouseY = mouseParam.point.y;

            // 验证鼠标坐标
            if (!isFinite(mouseX) || !isFinite(mouseY)) {
                return Infinity;
            }

            // 计算点到线段的距离
            const A = mouseX - x1;
            const B = mouseY - y1;
            const C = x2 - x1;
            const D = y2 - y1;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;

            if (lenSq === 0) {
                const distance = Math.sqrt(A * A + B * B);
                return isFinite(distance) ? distance : Infinity;
            }

            let param = dot / lenSq;

            let xx, yy;
            if (param < 0) {
                xx = x1;
                yy = y1;
            } else if (param > 1) {
                xx = x2;
                yy = y2;
            } else {
                xx = x1 + param * C;
                yy = y1 + param * D;
            }

            const dx = mouseX - xx;
            const dy = mouseY - yy;
            const distance = Math.sqrt(dx * dx + dy * dy);

            return isFinite(distance) ? distance : Infinity;
        } catch (error) {
            console.warn('⚠️ 安全线段距离计算失败:', error.message);
            return Infinity;
        }
    }

    // 计算点到线段的距离（保留原函数）
    getDistanceToLine(point1, point2, mouseParam, timeScale) {
        return this.getDistanceToLineSafe(point1, point2, mouseParam, timeScale, this.candleSeries);
    }

    // 安全的矩形距离计算
    getDistanceToRectangleSafe(point1, point2, mouseParam, timeScale, priceScale) {
        try {
            const x1 = timeScale.timeToCoordinate(Math.min(point1.time, point2.time));
            const y1 = priceScale.priceToCoordinate(Math.max(point1.price, point2.price));
            const x2 = timeScale.timeToCoordinate(Math.max(point1.time, point2.time));
            const y2 = priceScale.priceToCoordinate(Math.min(point1.price, point2.price));

            if (x1 === null || y1 === null || x2 === null || y2 === null ||
                !isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
                return Infinity;
            }

            const mouseX = mouseParam.point.x;
            const mouseY = mouseParam.point.y;

            // 验证鼠标坐标
            if (!isFinite(mouseX) || !isFinite(mouseY)) {
                return Infinity;
            }

            // 计算到矩形边框的最小距离
            const distances = [
                Math.abs(mouseY - y1), // 上边
                Math.abs(mouseY - y2), // 下边
                Math.abs(mouseX - x1), // 左边
                Math.abs(mouseX - x2)  // 右边
            ];

            // 检查是否在矩形内部
            if (mouseX >= x1 && mouseX <= x2 && mouseY >= y1 && mouseY <= y2) {
                return Math.min(...distances);
            }

            // 计算到矩形角点的距离
            const cornerDistances = [
                Math.sqrt((mouseX - x1) ** 2 + (mouseY - y1) ** 2),
                Math.sqrt((mouseX - x2) ** 2 + (mouseY - y1) ** 2),
                Math.sqrt((mouseX - x1) ** 2 + (mouseY - y2) ** 2),
                Math.sqrt((mouseX - x2) ** 2 + (mouseY - y2) ** 2)
            ];

            return Math.min(...distances, ...cornerDistances);
        } catch (error) {
            console.warn('⚠️ 安全矩形距离计算失败:', error.message);
            return Infinity;
        }
    }

    // 计算点到矩形的距离（保留原函数）
    getDistanceToRectangle(point1, point2, mouseParam, timeScale) {
        return this.getDistanceToRectangleSafe(point1, point2, mouseParam, timeScale, this.candleSeries);
    }

    // 高亮显示线条
    highlightDrawing(drawing) {
        this.highlightedDrawing = drawing;

        // 根据线条类型添加高亮效果
        try {
            switch (drawing.type) {
                case 'horizontalLine':
                    // 为水平线添加高亮价格线
                    this.highlightSeries = this.candleSeries.createPriceLine({
                        price: drawing.price,
                        color: '#FF0000',
                        lineWidth: 3,
                        lineStyle: LightweightCharts.LineStyle.Solid,
                        axisLabelVisible: true,
                        title: `删除: ${drawing.price.toFixed(2)}`
                    });
                    break;

                case 'trendLine':
                case 'verticalLine':
                    // 为线条添加高亮线系列
                    this.highlightSeries = this.chart.addLineSeries({
                        color: '#FF0000',
                        lineWidth: 3,
                        priceLineVisible: false,
                        lastValueVisible: false,
                    });
                    this.highlightSeries.setData(drawing.data);
                    break;

                case 'rectangle':
                    // 为矩形添加高亮边框
                    this.highlightSeries = [];
                    if (Array.isArray(drawing.series)) {
                        drawing.series.forEach((originalSeries, index) => {
                            const highlightSeries = this.chart.addLineSeries({
                                color: '#FF0000',
                                lineWidth: 3,
                                priceLineVisible: false,
                                lastValueVisible: false,
                            });
                            // 复制原始数据
                            // 注意：这里需要从原始series获取数据，但TradingView API限制，我们使用存储的数据
                            this.highlightSeries.push(highlightSeries);
                        });
                    }
                    break;
            }

            console.log('🔴 高亮线条:', drawing.type, drawing.id);
        } catch (error) {
            console.error('❌ 高亮线条失败:', error);
        }
    }

    // 清除高亮
    clearHighlight() {
        if (this.highlightSeries) {
            try {
                // 防止递归调用，添加状态检查
                if (this.isClearingHighlight) {
                    return;
                }
                this.isClearingHighlight = true;

                if (Array.isArray(this.highlightSeries)) {
                    this.highlightSeries.forEach((series, index) => {
                        try {
                            this.chart.removeSeries(series);
                        } catch (seriesError) {
                            console.warn(`⚠️ 清除高亮系列 ${index} 失败:`, seriesError.message);
                        }
                    });
                } else if (this.highlightedDrawing && this.highlightedDrawing.type === 'horizontalLine') {
                    try {
                        this.candleSeries.removePriceLine(this.highlightSeries);
                    } catch (priceLineError) {
                        console.warn('⚠️ 清除价格线高亮失败:', priceLineError.message);
                    }
                } else {
                    try {
                        this.chart.removeSeries(this.highlightSeries);
                    } catch (seriesError) {
                        console.warn('⚠️ 清除线系列高亮失败:', seriesError.message);
                    }
                }
            } catch (error) {
                console.warn('⚠️ 清除高亮失败:', error.message);
            } finally {
                this.isClearingHighlight = false;
                this.highlightSeries = null;
            }
        }
        this.highlightedDrawing = null;
    }

    // 删除线条
    deleteDrawing(drawing) {
        try {
            // 从图表中移除线条
            if (drawing.type === 'horizontalLine' && drawing.priceLine) {
                this.candleSeries.removePriceLine(drawing.priceLine);
            } else if (drawing.series) {
                if (Array.isArray(drawing.series)) {
                    drawing.series.forEach(series => {
                        this.chart.removeSeries(series);
                    });
                } else {
                    this.chart.removeSeries(drawing.series);
                }
            }

            // 从数组中移除
            const index = drawings.indexOf(drawing);
            if (index > -1) {
                drawings.splice(index, 1);
            }

            // 清除高亮
            this.clearHighlight();

            console.log('🗑️ 已删除线条:', drawing.type, drawing.id);
        } catch (error) {
            console.error('❌ 删除线条失败:', error);
        }
    }

    // 检测是否处于画线模式
    isDrawingMode() {
        return (this.currentTool && this.currentTool.state === 'drawing') || this.deleteMode;
    }

    // 处理画线时的键盘事件
    handleDrawingKeyboard(event) {
        // 防止在输入框中触发
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (event.key) {
            case 'ArrowUp':
                event.preventDefault();
                this.zoomIn();
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.zoomOut();
                break;
            default:
                // 其他按键不处理
                break;
        }
    }

    // 放大K线图
    zoomIn() {
        try {
            const timeScale = this.chart.timeScale();
            const visibleRange = timeScale.getVisibleRange();

            if (!visibleRange) {
                console.warn('⚠️ 无法获取可见范围');
                return;
            }

            // 标记用户已手动调整视图
            this.markUserAdjustedView();

            // 计算缩放中心（当前可见范围的中心）
            const center = (visibleRange.from + visibleRange.to) / 2;
            const currentSpan = visibleRange.to - visibleRange.from;

            // 缩小范围（放大图表）- 缩小到80%
            const newSpan = currentSpan * 0.8;
            const newFrom = center - newSpan / 2;
            const newTo = center + newSpan / 2;

            timeScale.setVisibleRange({
                from: newFrom,
                to: newTo
            });

            console.log('🔍 K线图已放大');
        } catch (error) {
            console.error('❌ 放大K线图失败:', error);
        }
    }

    // 缩小K线图
    zoomOut() {
        try {
            const timeScale = this.chart.timeScale();
            const visibleRange = timeScale.getVisibleRange();

            if (!visibleRange) {
                console.warn('⚠️ 无法获取可见范围');
                return;
            }

            // 标记用户已手动调整视图
            this.markUserAdjustedView();

            // 计算缩放中心（当前可见范围的中心）
            const center = (visibleRange.from + visibleRange.to) / 2;
            const currentSpan = visibleRange.to - visibleRange.from;

            // 扩大范围（缩小图表）- 扩大到125%
            const newSpan = currentSpan * 1.25;
            const newFrom = center - newSpan / 2;
            const newTo = center + newSpan / 2;

            timeScale.setVisibleRange({
                from: newFrom,
                to: newTo
            });

            console.log('🔍 K线图已缩小');
        } catch (error) {
            console.error('❌ 缩小K线图失败:', error);
        }
    }

    // 标记用户已手动调整视图
    markUserAdjustedView() {
        // 标记所有当前激活的工具
        if (this.currentTool) {
            this.currentTool.userAdjustedView = true;
        }

        // 标记所有工具
        Object.values(this.tools).forEach(tool => {
            tool.userAdjustedView = true;
        });

        console.log('🎯 已标记用户手动调整视图，禁用自动视图恢复');
    }

    // 取消当前操作
    cancelCurrent() {
        if (this.currentTool) {
            this.currentTool.cancel();
        }
    }

    // 清除所有绘制
    clearAll() {
        drawings.forEach(drawing => {
            if (drawing.type === 'horizontalLine' && drawing.priceLine) {
                this.candleSeries.removePriceLine(drawing.priceLine);
            } else if (drawing.series) {
                if (Array.isArray(drawing.series)) {
                    drawing.series.forEach(series => {
                        this.chart.removeSeries(series);
                    });
                } else {
                    this.chart.removeSeries(drawing.series);
                }
            }
        });
        drawings.length = 0;
        console.log('🗑️ 所有绘制已清除');
    }

    // 获取状态信息
    getStatus() {
        return {
            currentTool: this.currentTool ? this.currentTool.constructor.name : 'none',
            toolState: this.currentTool ? this.currentTool.state : 'idle',
            drawingsCount: drawings.length,
            availableTools: Object.keys(this.tools)
        };
    }
}

// 检查画线工具状态的函数
function checkDrawingToolStatus() {
    console.log('🔍 画线工具状态检查:');
    console.log('  当前工具:', currentDrawingTool);
    console.log('  拖拽功能:', isDragEnabled ? '✅ 启用' : '🚫 禁用');
    console.log('  是否正在绘制:', isDrawing);
    console.log('  绘制起点:', drawingStartPoint);
    console.log('  图表是否存在:', !!klineChart);
    console.log('  K线序列是否存在:', !!candleSeries);
    console.log('  事件处理器是否存在:', !!window.drawingClickHandler);
    console.log('  已绘制的图形数量:', drawings.length);

    if (drawings.length > 0) {
        console.log('  已绘制的图形:', drawings.map(d => ({ id: d.id, type: d.type })));
    }

    // 显示专业画线工具系统状态
    if (drawingToolSystem) {
        const status = drawingToolSystem.getStatus();
        console.log('🎨 专业画线工具系统状态:');
        console.log('  当前工具:', status.currentTool);
        console.log('  工具状态:', status.toolState);
        console.log('  可用工具:', status.availableTools.join(', '));
    }
}

// 测试点击事件的函数
function testClickEvent() {
    console.log('🧪 测试点击事件...');

    if (!klineChart) {
        console.log('❌ 图表未初始化');
        return;
    }

    // 手动触发一个点击事件来测试
    const testParam = {
        point: { x: 100, y: 100 },
        time: allCandleData[Math.floor(allCandleData.length / 2)].time
    };

    console.log('🖱️ 模拟点击事件:', testParam);

    if (window.drawingClickHandler) {
        window.drawingClickHandler(testParam);
    } else {
        console.log('❌ 点击处理器不存在');
    }
}

// 测试专业画线工具系统
function testProfessionalDrawingSystem() {
    console.log('🧪 测试专业画线工具系统...');

    if (!drawingToolSystem) {
        console.log('❌ 专业画线工具系统未初始化');
        return;
    }

    console.log('✅ 专业画线工具系统已初始化');
    console.log('🔍 系统状态:', drawingToolSystem.getStatus());

    // 测试激活水平线工具
    console.log('🧪 测试激活水平线工具...');
    drawingToolSystem.activateTool('horizontalLine');

    setTimeout(() => {
        console.log('🔍激活后状态:', drawingToolSystem.getStatus());

        // 测试模拟鼠标移动
        if (allCandleData.length > 10) {
            const testCandle = allCandleData[10];
            const testParam = {
                point: { x: 100, y: 100 },
                time: testCandle.time
            };

            console.log('🧪 测试鼠标移动事件...');
            if (drawingToolSystem.currentTool) {
                drawingToolSystem.currentTool.onMouseMove(testParam);
            }
        }

        // 切换回选择模式
        setTimeout(() => {
            drawingToolSystem.activateTool('select');
            console.log('✅ 专业画线工具系统测试完成');
        }, 1000);
    }, 500);
}

// 检查射线数据的函数
function checkRayData() {
    console.log('🔍 检查所有射线数据:');
    const rays = drawings.filter(d => d.type === 'trendLine');

    rays.forEach((ray, index) => {
        console.log(`📈 射线 ${index + 1}:`, {
            id: ray.id,
            points: ray.points,
            data: ray.data,
            isRay: ray.isRay,
            dataLength: ray.data ? ray.data.length : 0
        });
    });

    if (rays.length === 0) {
        console.log('📈 没有找到射线');
    }
}

// 清理可能有问题的线条
function cleanupProblematicLines() {
    console.log('🧹 开始清理可能有问题的线条...');

    const problematicLines = drawings.filter(d => {
        if (d.type === 'trendLine' && d.points && d.points.length >= 2) {
            const deltaTime = d.points[1].time - d.points[0].time;
            return deltaTime < 0; // 向左的线条
        }
        return false;
    });

    console.log(`🔍 发现 ${problematicLines.length} 条可能有问题的线条`);

    problematicLines.forEach(line => {
        try {
            // 从图表中移除
            if (line.series) {
                klineChart.removeSeries(line.series);
            }

            // 从数组中移除
            const index = drawings.indexOf(line);
            if (index > -1) {
                drawings.splice(index, 1);
            }

            console.log(`🗑️ 已清理线条 ID: ${line.id}`);
        } catch (error) {
            console.error(`❌ 清理线条失败 ID: ${line.id}`, error);
        }
    });

    console.log('✅ 线条清理完成');
}

// 手动初始化专业画线工具系统
function initProfessionalDrawingSystem() {
    console.log('� 手动初始化专业画线工具系统...');

    if (drawingToolSystem) {
        console.log('⚠️ 专业画线工具系统已存在，先清理...');
        drawingToolSystem = null;
    }

    try {
        console.log('🔍 检查依赖:', {
            klineChart: !!klineChart,
            candleSeries: !!candleSeries,
            DrawingToolSystem: typeof DrawingToolSystem,
            HorizontalLineTool: typeof HorizontalLineTool,
            TrendLineTool: typeof TrendLineTool
        });

        if (!klineChart || !candleSeries) {
            throw new Error('图表或K线序列未初始化');
        }

        if (typeof DrawingToolSystem === 'undefined') {
            throw new Error('DrawingToolSystem 类未定义');
        }

        drawingToolSystem = new DrawingToolSystem(klineChart, candleSeries);
        window.professionalDrawingSystemEnabled = true;

        console.log('✅ 专业画线工具系统手动初始化成功');
        console.log('🔍 系统状态:', drawingToolSystem.getStatus());

        return true;
    } catch (error) {
        console.error('❌ 手动初始化失败:', error);
        window.professionalDrawingSystemEnabled = false;
        return false;
    }
}

// 在控制台中暴露测试函数
window.testFeb07HourlyData = testFeb07HourlyData;
window.testBackendHourlyAggregation = testBackendHourlyAggregation;
window.testDrawingTools = testDrawingTools;
window.checkDrawingToolStatus = checkDrawingToolStatus;
window.testClickEvent = testClickEvent;
window.testProfessionalDrawingSystem = testProfessionalDrawingSystem;
window.initProfessionalDrawingSystem = initProfessionalDrawingSystem;
window.checkRayData = checkRayData;
window.cleanupProblematicLines = cleanupProblematicLines;

// 暴露画线工具函数到全局作用域
window.setDrawingTool = setDrawingTool;
window.clearAllDrawings = clearAllDrawings;
window.setupDrawingEventListeners = setupDrawingEventListeners;

// ==================== K线动画播放功能 ====================

// 切换播放/暂停状态
function togglePlayback() {
    if (isPlaying) {
        pauseAnimation();
    } else {
        startAnimation();
    }
}

// 开始动画播放
function startAnimation() {
    if (isPlaying) return;

    logToFile('INFO', '🎬 开始K线动画播放');

    // 如果是从暂停状态恢复，直接继续播放
    if (animationState === 'paused' && minuteData.length > 0) {
        isPlaying = true;
        animationState = 'playing';
        updatePlaybackUI();
        runAnimation();
        return;
    }

    // 首次播放，获取分钟级数据
    loadMinuteDataForAnimation().then(() => {
        // 清空现有数据，准备动画播放
        clearChartForAnimation();

        isPlaying = true;
        animationState = 'playing';
        currentAnimationIndex = 0;
        currentKlineBuffer = null;

        updatePlaybackUI();
        runAnimation();
    }).catch(error => {
        logToFile('ERROR', '❌ 获取分钟级数据失败:', error);
        alert('获取分钟级数据失败，请检查网络连接');
        animationState = 'stopped';
        updatePlaybackUI();
    });
}

// 暂停动画播放
function pauseAnimation() {
    if (!isPlaying) return;

    logToFile('INFO', '⏸️ 暂停K线动画播放');

    isPlaying = false;
    animationState = 'paused';
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = null;
    }
    updatePlaybackUI();
}

// 停止动画播放
function stopAnimation() {
    logToFile('INFO', '⏹️ 停止K线动画播放');

    // 停止播放
    isPlaying = false;
    animationState = 'stopped';
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = null;
    }

    // 重置所有动画相关状态
    currentAnimationIndex = 0;
    currentKlineBuffer = null;
    minuteData = [];

    // 重新加载原始数据（到截止日期为止的数据）
    loadKlineData();

    updatePlaybackUI();
}

// 重置动画
function resetAnimation() {
    logToFile('INFO', '🔄 重置K线动画');

    // 停止播放
    isPlaying = false;
    animationState = 'stopped';
    if (animationTimer) {
        clearTimeout(animationTimer);
        animationTimer = null;
    }

    // 重置所有状态
    currentAnimationIndex = 0;
    currentKlineBuffer = null;
    minuteData = []; // 清空分钟数据

    // 重新加载原始数据（到截止日期为止的数据）
    loadKlineData();

    updatePlaybackUI();
}

// 更新播放速度
function updateSpeed() {
    const slider = document.getElementById('speedSlider');
    playbackSpeed = parseInt(slider.value);
    document.getElementById('speedDisplay').textContent = playbackSpeed + 'x';

    logToFile('INFO', '⚡ 更新播放速度:', { playbackSpeed });
}

// 更新播放控制UI
function updatePlaybackUI() {
    const playPauseBtn = document.getElementById('playPauseBtn');
    const playPauseIcon = document.getElementById('playPauseIcon');
    const statusDisplay = document.getElementById('playbackStatus');
    const stopBtn = document.getElementById('stopBtn');

    switch (animationState) {
        case 'playing':
            playPauseIcon.textContent = '⏸️';
            playPauseBtn.innerHTML = '<span id="playPauseIcon">⏸️</span> 暂停';
            playPauseBtn.className = 'btn btn-warning w-100';
            statusDisplay.textContent = '播放中';
            stopBtn.disabled = false;
            break;

        case 'paused':
            playPauseIcon.textContent = '▶️';
            playPauseBtn.innerHTML = '<span id="playPauseIcon">▶️</span> 继续';
            playPauseBtn.className = 'btn btn-success w-100';
            statusDisplay.textContent = '已暂停';
            stopBtn.disabled = false;
            break;

        case 'stopped':
        default:
            playPauseIcon.textContent = '▶️';
            playPauseBtn.innerHTML = '<span id="playPauseIcon">▶️</span> 播放';
            playPauseBtn.className = 'btn btn-success w-100';
            statusDisplay.textContent = '已停止';
            stopBtn.disabled = true;
            break;
    }
}

// 获取分钟级数据用于动画播放
async function loadMinuteDataForAnimation() {
    const stockCode = document.getElementById('stockCode').value.trim();
    const endDate = document.getElementById('endDate').value;
    const limit = 1440; // 一天的分钟数，获取足够的数据

    if (!stockCode) {
        throw new Error('股票代码为空');
    }

    logToFile('INFO', '📊 获取分钟级数据用于动画播放', { stockCode, endDate, limit });

    // 如果有截止日期，从截止日期的下一个交易日开始获取数据
    let startDate = endDate;
    if (endDate) {
        startDate = getNextTradingDay(endDate);
        logToFile('INFO', '📅 从截止日期的下一个交易日开始播放', { endDate, startDate });
    }

    // 构建API URL，获取1分钟数据，从startDate开始向未来获取
    let apiUrl = `/api/kline?code=${stockCode}&period=1&limit=${limit}`;
    if (startDate) {
        apiUrl += `&start_date=${startDate}`;
    }

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`网络请求错误: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        logToFile('INFO', '✅ 分钟级数据获取成功', { dataLength: data.length });

        // 转换数据格式（动画播放时总是使用1分钟数据）
        minuteData = data.map(item => {
            // 动画播放时，数据总是1分钟级的，直接使用原始时间
            let timestamp = new Date(item.date).getTime() / 1000;

            return {
                time: timestamp,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
                volume: parseFloat(item.volume || 0),
                date: item.date // 保存原始日期字符串
            };
        });

        // 按时间排序
        minuteData.sort((a, b) => a.time - b.time);

        logToFile('INFO', '📊 分钟级数据处理完成', {
            dataLength: minuteData.length,
            firstDate: minuteData[0]?.date,
            lastDate: minuteData[minuteData.length - 1]?.date
        });

    } catch (error) {
        logToFile('ERROR', '❌ 获取分钟级数据失败:', error);
        throw error;
    }
}

// 运行动画的核心函数
function runAnimation() {
    if (!isPlaying) {
        return;
    }

    // 如果当前数据播放完了，尝试获取下一天的数据
    if (currentAnimationIndex >= minuteData.length) {
        logToFile('INFO', '🎬 当前数据播放完成，获取下一天数据');
        loadNextDayData().then(() => {
            if (minuteData.length > 0) {
                currentAnimationIndex = 0; // 重置索引
                runAnimation(); // 继续播放
            } else {
                logToFile('INFO', '🎬 没有更多数据，动画播放完成');
                stopAnimation();
            }
        }).catch(error => {
            logToFile('ERROR', '❌ 获取下一天数据失败:', error);
            stopAnimation();
        });
        return;
    }

    const currentPeriod = document.getElementById('period').value;
    const intervalMs = Math.max(50, 1000 / playbackSpeed); // 最小50ms间隔

    // 处理当前分钟数据
    processMinuteDataForAnimation(currentPeriod);

    currentAnimationIndex++;

    // 设置下一次动画
    animationTimer = setTimeout(() => {
        runAnimation();
    }, intervalMs);
}

// 处理分钟数据并更新图表
function processMinuteDataForAnimation(period) {
    if (currentAnimationIndex >= minuteData.length) return;

    const currentMinute = minuteData[currentAnimationIndex];

    logToFile('DEBUG', '🎬 处理分钟数据', {
        index: currentAnimationIndex,
        date: currentMinute.date,
        period: period
    });

    // 根据不同周期处理数据
    switch (period) {
        case '1': // 1分钟线，直接添加
            addMinuteToChart(currentMinute);
            break;
        case '5': // 5分钟线
            buildKlineFromMinutes(currentMinute, 5);
            break;
        case '15': // 15分钟线
            buildKlineFromMinutes(currentMinute, 15);
            break;
        case '30': // 30分钟线
            buildKlineFromMinutes(currentMinute, 30);
            break;
        case '60': // 60分钟线
            buildKlineFromMinutes(currentMinute, 60);
            break;
        case 'D': // 日线
            buildDailyKlineFromMinutes(currentMinute);
            break;
        default:
            logToFile('WARN', '⚠️ 不支持的周期类型:', period);
            break;
    }
}

// 直接添加1分钟K线到图表
function addMinuteToChart(minuteData) {
    if (!candleSeries) return;

    // 直接更新图表，添加新的1分钟K线
    const newCandle = {
        time: minuteData.time,
        open: minuteData.open,
        high: minuteData.high,
        low: minuteData.low,
        close: minuteData.close
    };

    // 添加到全局数据数组
    allCandleData.push(minuteData);

    // 更新图表
    candleSeries.update(newCandle);

    // 更新成交量
    if (volumeSeries) {
        volumeSeries.update({
            time: minuteData.time,
            value: minuteData.volume,
            color: minuteData.close >= minuteData.open ? 'rgba(0, 150, 136, 0.8)' : 'rgba(255, 82, 82, 0.8)'
        });
    }

    logToFile('DEBUG', '📊 添加1分钟K线', { time: minuteData.date, close: minuteData.close });
}

// 从分钟数据构建更大周期的K线
function buildKlineFromMinutes(minuteData, periodMinutes) {
    const minuteTime = new Date(minuteData.time * 1000);

    // 计算当前分钟数据属于哪个周期的K线
    const periodStartTime = getPeriodStartTime(minuteTime, periodMinutes);
    const periodTimestamp = periodStartTime.getTime() / 1000;

    // 如果是新的周期，完成上一个周期的K线并开始新的
    if (!currentKlineBuffer || currentKlineBuffer.time !== periodTimestamp) {
        // 完成上一个K线
        if (currentKlineBuffer) {
            finishCurrentKline();
        }

        // 开始新的K线
        currentKlineBuffer = {
            time: periodTimestamp,
            open: minuteData.open,
            high: minuteData.high,
            low: minuteData.low,
            close: minuteData.close,
            volume: minuteData.volume,
            minuteCount: 1,
            targetMinutes: periodMinutes
        };

        logToFile('DEBUG', `📊 开始新的${periodMinutes}分钟K线`, {
            startTime: periodStartTime.toISOString(),
            open: minuteData.open
        });
    } else {
        // 更新当前K线
        currentKlineBuffer.high = Math.max(currentKlineBuffer.high, minuteData.high);
        currentKlineBuffer.low = Math.min(currentKlineBuffer.low, minuteData.low);
        currentKlineBuffer.close = minuteData.close;
        currentKlineBuffer.volume += minuteData.volume;
        currentKlineBuffer.minuteCount++;

        logToFile('DEBUG', `📊 更新${periodMinutes}分钟K线`, {
            minuteCount: currentKlineBuffer.minuteCount,
            close: minuteData.close
        });
    }

    // 实时更新图表显示当前正在构建的K线
    updateCurrentKlineOnChart();
}

// 构建日线K线
function buildDailyKlineFromMinutes(minuteData) {
    const minuteTime = new Date(minuteData.time * 1000);
    const dayStart = new Date(minuteTime.getFullYear(), minuteTime.getMonth(), minuteTime.getDate());
    const dayTimestamp = dayStart.getTime() / 1000;

    // 如果是新的一天，完成上一天的K线并开始新的
    if (!currentKlineBuffer || currentKlineBuffer.time !== dayTimestamp) {
        // 完成上一个K线
        if (currentKlineBuffer) {
            finishCurrentKline();
        }

        // 开始新的日K线
        currentKlineBuffer = {
            time: dayTimestamp,
            open: minuteData.open,
            high: minuteData.high,
            low: minuteData.low,
            close: minuteData.close,
            volume: minuteData.volume,
            minuteCount: 1,
            isDaily: true
        };

        logToFile('DEBUG', '📊 开始新的日K线', {
            date: dayStart.toISOString().split('T')[0],
            open: minuteData.open
        });
    } else {
        // 更新当前日K线
        currentKlineBuffer.high = Math.max(currentKlineBuffer.high, minuteData.high);
        currentKlineBuffer.low = Math.min(currentKlineBuffer.low, minuteData.low);
        currentKlineBuffer.close = minuteData.close;
        currentKlineBuffer.volume += minuteData.volume;
        currentKlineBuffer.minuteCount++;

        logToFile('DEBUG', '📊 更新日K线', {
            minuteCount: currentKlineBuffer.minuteCount,
            close: minuteData.close
        });
    }

    // 实时更新图表显示当前正在构建的K线
    updateCurrentKlineOnChart();
}

// 获取周期开始时间
function getPeriodStartTime(currentTime, periodMinutes) {
    const minutes = currentTime.getMinutes();
    const periodStart = Math.floor(minutes / periodMinutes) * periodMinutes;

    return new Date(
        currentTime.getFullYear(),
        currentTime.getMonth(),
        currentTime.getDate(),
        currentTime.getHours(),
        periodStart,
        0,
        0
    );
}

// 完成当前K线并添加到图表
function finishCurrentKline() {
    if (!currentKlineBuffer || !candleSeries) return;

    const klineData = {
        time: currentKlineBuffer.time,
        open: currentKlineBuffer.open,
        high: currentKlineBuffer.high,
        low: currentKlineBuffer.low,
        close: currentKlineBuffer.close,
        volume: currentKlineBuffer.volume
    };

    // 添加到全局数据数组
    allCandleData.push(klineData);

    // 更新图表
    candleSeries.update({
        time: currentKlineBuffer.time,
        open: currentKlineBuffer.open,
        high: currentKlineBuffer.high,
        low: currentKlineBuffer.low,
        close: currentKlineBuffer.close
    });

    // 更新成交量
    if (volumeSeries) {
        volumeSeries.update({
            time: currentKlineBuffer.time,
            value: currentKlineBuffer.volume,
            color: currentKlineBuffer.close >= currentKlineBuffer.open ? 'rgba(0, 150, 136, 0.8)' : 'rgba(255, 82, 82, 0.8)'
        });
    }

    // 更新移动平均线
    updateMovingAveragesForAnimation();

    const period = currentKlineBuffer.isDaily ? '日' : `${currentKlineBuffer.targetMinutes}分钟`;
    logToFile('INFO', `✅ 完成${period}K线`, {
        time: new Date(currentKlineBuffer.time * 1000).toISOString(),
        open: currentKlineBuffer.open,
        close: currentKlineBuffer.close,
        minuteCount: currentKlineBuffer.minuteCount
    });
}

// 实时更新当前正在构建的K线
function updateCurrentKlineOnChart() {
    if (!currentKlineBuffer || !candleSeries) return;

    // 实时更新图表上当前正在构建的K线
    candleSeries.update({
        time: currentKlineBuffer.time,
        open: currentKlineBuffer.open,
        high: currentKlineBuffer.high,
        low: currentKlineBuffer.low,
        close: currentKlineBuffer.close
    });

    // 更新成交量
    if (volumeSeries) {
        volumeSeries.update({
            time: currentKlineBuffer.time,
            value: currentKlineBuffer.volume,
            color: currentKlineBuffer.close >= currentKlineBuffer.open ? 'rgba(0, 150, 136, 0.8)' : 'rgba(255, 82, 82, 0.8)'
        });
    }

    // 更新移动平均线（如果有足够的数据）
    updateMovingAveragesForAnimation();
}

// 清空图表准备动画播放
function clearChartForAnimation() {
    if (!candleSeries || !volumeSeries) return;

    logToFile('INFO', '🧹 清空图表准备动画播放');

    // 清空图表数据
    candleSeries.setData([]);
    volumeSeries.setData([]);

    // 清空移动平均线
    if (ma5Series) ma5Series.setData([]);
    if (ma10Series) ma10Series.setData([]);
    if (ma20Series) ma20Series.setData([]);

    // 清空全局数据数组
    allCandleData = [];
}

// 更新移动平均线（动画播放时）
function updateMovingAveragesForAnimation() {
    if (!ma5Series || !ma10Series || !ma20Series || allCandleData.length < 5) return;

    // 计算移动平均线
    const ma5Data = calculateMA(5, allCandleData);
    const ma10Data = calculateMA(10, allCandleData);
    const ma20Data = calculateMA(20, allCandleData);

    // 只更新最后一个点，避免重新设置整个数据集
    if (ma5Data.length > 0) {
        const lastMA5 = ma5Data[ma5Data.length - 1];
        ma5Series.update(lastMA5);
    }

    if (ma10Data.length > 0) {
        const lastMA10 = ma10Data[ma10Data.length - 1];
        ma10Series.update(lastMA10);
    }

    if (ma20Data.length > 0) {
        const lastMA20 = ma20Data[ma20Data.length - 1];
        ma20Series.update(lastMA20);
    }
}

// 获取下一天的数据继续播放
async function loadNextDayData() {
    if (minuteData.length === 0) {
        throw new Error('没有当前数据，无法确定下一天');
    }

    // 获取当前数据的最后一天
    const lastMinute = minuteData[minuteData.length - 1];
    const lastDate = new Date(lastMinute.time * 1000);
    const nextDay = getNextTradingDay(lastDate.toISOString().split('T')[0]);

    logToFile('INFO', '📅 获取下一天数据', {
        lastDate: lastDate.toISOString().split('T')[0],
        nextDay
    });

    const stockCode = document.getElementById('stockCode').value.trim();
    const limit = 1440; // 一天的分钟数

    // 构建API URL，获取下一天的1分钟数据
    let apiUrl = `/api/kline?code=${stockCode}&period=1&limit=${limit}&start_date=${nextDay}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`网络请求错误: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (data.length === 0) {
            logToFile('WARN', '⚠️ 下一天没有数据');
            return;
        }

        logToFile('INFO', '✅ 下一天数据获取成功', { dataLength: data.length });

        // 转换数据格式并替换当前的minuteData（动画播放时总是使用1分钟数据）
        minuteData = data.map(item => {
            // 动画播放时，数据总是1分钟级的，直接使用原始时间
            let timestamp = new Date(item.date).getTime() / 1000;

            return {
                time: timestamp,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
                volume: parseFloat(item.volume || 0),
                date: item.date // 保存原始日期字符串
            };
        });

        // 按时间排序
        minuteData.sort((a, b) => a.time - b.time);

        logToFile('INFO', '📊 下一天数据处理完成', {
            dataLength: minuteData.length,
            firstDate: minuteData[0]?.date,
            lastDate: minuteData[minuteData.length - 1]?.date
        });

    } catch (error) {
        logToFile('ERROR', '❌ 获取下一天数据失败:', error);
        throw error;
    }
}
});