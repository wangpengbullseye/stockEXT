"""
Ashare MCP Server - 股票行情数据双核心版 MCP 服务
基于 https://github.com/mpquant/Ashare
"""

import json
import requests
import datetime
import asyncio
import os
from typing import Optional, Literal, List, Dict, Any, Union
import pandas as pd
from fastmcp import FastMCP
from pydantic import Field, BaseModel
from typing import Annotated

# 导入配置
import sys
sys.path.append(os.path.dirname(os.path.dirname(__file__)))
from config import LOCAL_DATA_PATH, get_stock_filename, get_data_file_path

async def get_price_local_async(code: str, end_date: str = '', count: int = 10, frequency: str = '1d', start_date: str = '') -> pd.DataFrame:
    """从本地CSV文件读取股票数据 - 异步版本，支持跨年份数据读取"""
    try:
        # 确定需要读取的年份范围
        current_year = datetime.datetime.now().year
        start_year = current_year
        end_year = current_year

        # 解析开始日期
        if start_date:
            try:
                if isinstance(start_date, str):
                    start_year = datetime.datetime.strptime(start_date.split(' ')[0], '%Y-%m-%d').year
                else:
                    start_year = start_date.year
            except:
                pass

        # 解析结束日期
        if end_date:
            try:
                if isinstance(end_date, str):
                    end_year = datetime.datetime.strptime(end_date.split(' ')[0], '%Y-%m-%d').year
                else:
                    end_year = end_date.year
            except:
                pass

        # 如果没有指定日期范围，默认使用最近的年份
        if not start_date and not end_date:
            # 尝试从2025年开始，如果文件不存在则尝试其他年份
            for year in [2025, 2024, 2023, 2022]:
                test_path = get_data_file_path(code, year)
                if os.path.exists(test_path):
                    start_year = end_year = year
                    break

        # 读取跨年份的数据
        all_data = []
        for year in range(start_year, end_year + 1):
            file_path = get_data_file_path(code, year)

        # 检查文件是否存在
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"数据文件不存在: {file_path}")

        # 使用异步执行文件读取
        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(None, lambda: pd.read_csv(file_path, encoding='utf-8'))

        # 重命名列以匹配原有格式
        df.columns = ['date', 'code', 'open', 'high', 'low', 'close', 'volume', 'amount']

        # 转换数据类型
        df['date'] = pd.to_datetime(df['date'])
        df['open'] = df['open'].astype(float)
        df['high'] = df['high'].astype(float)
        df['low'] = df['low'].astype(float)
        df['close'] = df['close'].astype(float)
        df['volume'] = df['volume'].astype(float)

        # 设置日期为索引
        df.set_index('date', inplace=True)
        df.index.name = ''

        # 只保留需要的列
        df = df[['open', 'close', 'high', 'low', 'volume']]

        # 按日期排序
        df = df.sort_index()

        # 根据结束日期筛选
        if end_date:
            if isinstance(end_date, str):
                end_timestamp = pd.to_datetime(end_date.split(' ')[0])
            else:
                end_timestamp = pd.to_datetime(end_date)
            df = df[df.index <= end_timestamp]

        # 返回最后count条记录
        if len(df) > count:
            df = df.tail(count)

        return df

    except Exception as e:
        print(f"读取本地数据失败: {e}")
        # 如果本地数据读取失败，返回空DataFrame
        return pd.DataFrame(columns=['open', 'close', 'high', 'low', 'volume'])

# 创建 MCP 服务器
mcp = FastMCP(
    name="Ashare MCP",
    instructions="这是一个股票行情数据服务，提供A股市场的行情数据查询功能。",
    dependencies=["pandas", "requests"]
)

# 定义数据模型
class StockData(BaseModel):
    """股票行情数据模型"""
    code: str = Field(description="股票代码")
    data: Dict[str, Any] = Field(description="股票行情数据，DataFrame转换为字典")
    message: str = Field(description="处理消息")

# 腾讯日线
async def get_price_day_tx_async(code: str, end_date: str = '', count: int = 10, frequency: str = '1d') -> pd.DataFrame:
    """日线获取 - 异步版本"""
    unit = 'week' if frequency in '1w' else 'month' if frequency in '1M' else 'day'  # 判断日线，周线，月线
    if end_date:
        end_date = end_date.strftime('%Y-%m-%d') if isinstance(end_date, datetime.date) else end_date.split(' ')[0]
    end_date = '' if end_date == datetime.datetime.now().strftime('%Y-%m-%d') else end_date  # 如果日期今天就变成空
    
    URL = f'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},{unit},,{end_date},{count},qfq'
    
    # 使用异步执行网络请求
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: requests.get(URL))
    st = json.loads(response.content)
    
    ms = 'qfq' + unit
    stk = st['data'][code]
    buf = stk[ms] if ms in stk else stk[unit]  # 指数返回不是qfqday,是day
    
    df = pd.DataFrame(buf, columns=['time', 'open', 'close', 'high', 'low', 'volume'], dtype='float')
    df.time = pd.to_datetime(df.time)
    df.set_index(['time'], inplace=True)
    df.index.name = ''  # 处理索引
    
    return df

# 腾讯分钟线
async def get_price_min_tx_async(code: str, end_date: Optional[str] = None, count: int = 10, frequency: str = '1d') -> pd.DataFrame:
    """分钟线获取 - 异步版本"""
    ts = int(frequency[:-1]) if frequency[:-1].isdigit() else 1  # 解析K线周期数
    if end_date:
        end_date = end_date.strftime('%Y-%m-%d') if isinstance(end_date, datetime.date) else end_date.split(' ')[0]
    
    URL = f'http://ifzq.gtimg.cn/appstock/app/kline/mkline?param={code},m{ts},,{count}'
    
    # 使用异步执行网络请求
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: requests.get(URL))
    st = json.loads(response.content)
    
    buf = st['data'][code]['m' + str(ts)]
    df = pd.DataFrame(buf, columns=['time', 'open', 'close', 'high', 'low', 'volume', 'n1', 'n2'])
    df = df[['time', 'open', 'close', 'high', 'low', 'volume']]
    df[['open', 'close', 'high', 'low', 'volume']] = df[['open', 'close', 'high', 'low', 'volume']].astype('float')
    df.time = pd.to_datetime(df.time)
    df.set_index(['time'], inplace=True)
    df.index.name = ''  # 处理索引
    df['close'][-1] = float(st['data'][code]['qt'][code][3])  # 最新基金数据是3位的
    
    return df

# 新浪全周期获取函数
async def get_price_sina_async(code: str, end_date: str = '', count: int = 10, frequency: str = '60m') -> pd.DataFrame:
    """新浪全周期获取函数 - 异步版本"""
    frequency = frequency.replace('1d', '240m').replace('1w', '1200m').replace('1M', '7200m')
    mcount = count
    ts = int(frequency[:-1]) if frequency[:-1].isdigit() else 1  # 解析K线周期数
    
    if (end_date != '') & (frequency in ['240m', '1200m', '7200m']):
        end_date = pd.to_datetime(end_date) if not isinstance(end_date, datetime.date) else end_date  # 转换成datetime
        unit = 4 if frequency == '1200m' else 29 if frequency == '7200m' else 1  # 4,29多几个数据不影响速度
        count = count + (datetime.datetime.now() - end_date).days // unit  # 结束时间到今天有多少天自然日(肯定 >交易日)
    
    URL = f'http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={code}&scale={ts}&ma=5&datalen={count}'
    
    # 使用异步执行网络请求
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: requests.get(URL))
    dstr = json.loads(response.content)
    
    df = pd.DataFrame(dstr, columns=['day', 'open', 'high', 'low', 'close', 'volume'])
    df['open'] = df['open'].astype(float)
    df['high'] = df['high'].astype(float)
    df['low'] = df['low'].astype(float)
    df['close'] = df['close'].astype(float)
    df['volume'] = df['volume'].astype(float)
    df.day = pd.to_datetime(df.day)
    df.set_index(['day'], inplace=True)
    df.index.name = ''  # 处理索引
    
    if (end_date != '') & (frequency in ['240m', '1200m', '7200m']):
        return df[df.index <= end_date][-mcount:]  # 日线带结束时间先返回
    
    return df

# MCP 工具 - 获取股票行情数据
@mcp.tool()
async def get_price(
    code: Annotated[str, Field(description="证券代码，如'sh000001'或'000001.XSHG'")],
    end_date: Annotated[str, Field(description="结束日期，格式为'YYYY-MM-DD'")] = '',
    count: Annotated[int, Field(description="获取的K线数量")] = 10,
    frequency: Annotated[Literal['1m', '5m', '15m', '30m', '60m', '1d', '1w', '1M'], 
                         Field(description="K线周期，分钟线：'1m', '5m', '15m', '30m', '60m'，日线：'1d'，周线：'1w'，月线：'1M'")] = '1d',
    fields: Annotated[List[str], Field(description="返回字段列表，默认为全部")] = []
) -> StockData:
    """
    获取股票行情数据，支持分钟线、日线、周线、月线。
    
    Args:
        code: 证券代码，如'sh000001'或'000001.XSHG'
        end_date: 结束日期，格式为'YYYY-MM-DD'
        count: 获取的K线数量
        frequency: K线周期，分钟线：'1m', '5m', '15m', '30m', '60m'，日线：'1d'，周线：'1w'，月线：'1M'
        fields: 返回字段列表，默认为全部
        
    Returns:
        StockData: 包含股票代码、行情数据和处理消息的对象
    """
    try:
        # 优先尝试从本地数据源获取数据
        try:
            df = await get_price_local_async(code, end_date=end_date, count=count, frequency=frequency)
            if not df.empty:
                print(f"成功从本地数据源获取 {code} 的数据，共 {len(df)} 条记录")
                # 将DataFrame转换为字典
                data_dict = df.reset_index().to_dict(orient='records')

                return StockData(
                    code=code,
                    data={"records": data_dict, "columns": list(df.reset_index().columns)},
                    message=f"成功从本地数据源获取{code}的{frequency}周期数据，共{len(df)}条记录"
                )
        except Exception as e:
            print(f"本地数据源获取失败: {e}，尝试网络数据源...")

        # 如果本地数据获取失败，使用原有的网络数据源
        # 证券代码编码兼容处理
        xcode = code.replace('.XSHG', '').replace('.XSHE', '')
        xcode = 'sh' + xcode if ('XSHG' in code) else 'sz' + xcode if ('XSHE' in code) else code

        df = None
        if frequency in ['1d', '1w', '1M']:  # 1d日线 1w周线 1M月线
            try:
                df = await get_price_sina_async(xcode, end_date=end_date, count=count, frequency=frequency)  # 主力
            except Exception as e:
                df = await get_price_day_tx_async(xcode, end_date=end_date, count=count, frequency=frequency)  # 备用

        if frequency in ['1m', '5m', '15m', '30m', '60m']:  # 分钟线 ,1m只有腾讯接口 5分钟5m 60分钟60m
            if frequency in '1m':
                df = await get_price_min_tx_async(xcode, end_date=end_date, count=count, frequency=frequency)
            else:
                try:
                    df = await get_price_sina_async(xcode, end_date=end_date, count=count, frequency=frequency)  # 主力
                except Exception as e:
                    df = await get_price_min_tx_async(xcode, end_date=end_date, count=count, frequency=frequency)  # 备用

        # 检查df是否为None
        if df is None or df.empty:
            return StockData(
                code=code,
                data={},
                message=f"无法获取{code}的数据"
            )

        # 将DataFrame转换为字典
        data_dict = df.reset_index().to_dict(orient='records')

        return StockData(
            code=code,
            data={"records": data_dict, "columns": list(df.reset_index().columns)},
            message=f"成功从网络数据源获取{code}的{frequency}周期数据，共{len(df)}条记录"
        )
    except Exception as e:
        return StockData(
            code=code,
            data={},
            message=f"获取数据失败: {str(e)}"
        )

