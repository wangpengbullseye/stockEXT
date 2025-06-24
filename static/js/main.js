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

// 前端日志记录
let frontendLogs = [];
const MAX_LOGS = 1000;

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
        },
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
        },
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
        if (e.button === 0) { // 左键
            isDragging = true;
            recordReferenceBar();
            console.log('🖱️ 开始拖拽，记录参考K线');
        }
    });

    klineContainer.addEventListener('mouseup', (e) => {
        if (e.button === 0) { // 左键
            isDragging = false;
            console.log('🖱️ 结束拖拽');
        }
    });

    klineContainer.addEventListener('mouseleave', () => {
        isDragging = false;
        console.log('🖱️ 鼠标离开图表区域，结束拖拽');
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
                // 设置图表标题
                document.getElementById('chartTitle').textContent = `${stockCode} K线图`;
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

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const batchData = batch.map(item => {
            // 解析日期，保留完整的时间信息
            let timestamp;
            if (item.date.includes(' ')) {
                // 包含时间信息（分钟级数据）
                timestamp = new Date(item.date).getTime() / 1000;
            } else {
                // 只有日期信息（日线数据）
                timestamp = new Date(item.date + 'T00:00:00').getTime() / 1000;
            }

            return {
                time: timestamp,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
                volume: parseFloat(item.volume || 0)
            };
        });
        newCandleData.push(...batchData);

        // 给浏览器一些时间处理其他任务
        if (i % (BATCH_SIZE * 5) === 0) {
            logToFile('INFO', `📊 已处理 ${i + batch.length}/${data.length} 条数据`);
        }
    }

    logToFile('INFO', `✅ 数据转换完成`, { convertedLength: newCandleData.length });

    // 按时间排序（确保数据按时间顺序）
    logToFile('INFO', `🔄 开始排序数据`, { length: newCandleData.length });
    newCandleData.sort((a, b) => a.time - b.time);
    logToFile('INFO', `✅ 数据排序完成`);

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

    // 设置K线数据
    logToFile('INFO', `📊 设置K线数据到图表`);
    candleSeries.setData(data);
    
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

    // 隐藏加载提示框
    document.getElementById('loading').style.display = 'none';
    isLoading = false;
}

// 检查并在需要时加载更多数据
function checkAndLoadMoreIfNeeded() {
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
    const needLaterData = visibleRange.to > (dataEndTime - bufferDays);

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
                if (item.date.includes(' ')) {
                    // 包含时间信息（分钟级数据）
                    timestamp = new Date(item.date).getTime() / 1000;
                } else {
                    // 只有日期信息（日线数据）
                    timestamp = new Date(item.date + 'T00:00:00').getTime() / 1000;
                }

                return {
                    time: timestamp,
                    open: parseFloat(item.open),
                    high: parseFloat(item.high),
                    low: parseFloat(item.low),
                    close: parseFloat(item.close),
                    volume: parseFloat(item.volume || 0)
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

                // 恢复参考K线位置
                setTimeout(() => {
                    restoreReferenceBarPosition();
                }, 100);

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

        console.log('✅ 图表数据更新完成（包括移动平均线）');
    } catch (e) {
        console.log('❌ 更新图表数据失败:', e.message);
        // 不再回退到重新渲染，避免递归调用
    }
}

// 测试历史数据加载功能
function testLoadHistoricalData() {
    console.log('=== 开始测试历史数据加载 ===');
    console.log('当前数据量:', allCandleData.length);

    if (allCandleData.length > 0) {
        const dataStartTime = allCandleData.reduce((min, item) => Math.min(min, item.time), Infinity);
        console.log('当前最早数据:', new Date(dataStartTime * 1000));

        // 强制加载更早的数据
        loadHistoricalData('earlier', new Date(dataStartTime * 1000));
    } else {
        console.log('没有当前数据，无法测试');
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
    
    // 加载K线数据
    loadKlineData();
});