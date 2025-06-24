#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据源配置文件
"""

import os

# 本地数据源配置
# 用户可以修改这个路径指向自己的股票数据目录
LOCAL_DATA_PATH = r'E:\work\stock\data'

# 如果指定路径不存在，则使用项目内的测试数据
if not os.path.exists(LOCAL_DATA_PATH):
    LOCAL_DATA_PATH = os.path.join(os.path.dirname(__file__), 'test_data')
    print(f"使用项目内测试数据: {LOCAL_DATA_PATH}")
else:
    print(f"使用本地数据源: {LOCAL_DATA_PATH}")

# 数据文件格式配置
CSV_COLUMNS = ['日期', '代码', '开盘价', '最高价', '最低价', '收盘价', '成交量（手）', '成交额（元）']

# 股票代码映射配置
def get_stock_filename(code):
    """
    根据股票代码生成文件名
    
    Args:
        code: 股票代码，如'sh600000', '600000.XSHG', '600000'等
        
    Returns:
        tuple: (market, stock_code, filename)
    """
    # 解析股票代码，提取纯数字部分
    if code.startswith('sh') or code.startswith('sz'):
        stock_code = code[2:]  # 去掉sh或sz前缀
        market = 'SH' if code.startswith('sh') else 'SZ'
    elif '.XSHG' in code:
        stock_code = code.replace('.XSHG', '')
        market = 'SH'
    elif '.XSHE' in code:
        stock_code = code.replace('.XSHE', '')
        market = 'SZ'
    else:
        # 默认处理，假设6开头是上海，其他是深圳
        stock_code = code
        market = 'SH' if code.startswith('6') else 'SZ'
    
    # 构建文件名：SH.600000.csv 或 SZ.000001.csv
    filename = f"{market}.{stock_code}.csv"
    
    return market, stock_code, filename

def get_data_file_path(code, year=None):
    """
    获取股票数据文件的完整路径
    
    Args:
        code: 股票代码
        year: 年份，如果不指定则使用2024年（测试数据年份）
        
    Returns:
        str: 数据文件的完整路径
    """
    if year is None:
        year = 2025  # 默认使用2025年的真实数据
    
    market, stock_code, filename = get_stock_filename(code)
    file_path = os.path.join(LOCAL_DATA_PATH, str(year), filename)
    
    return file_path

# 支持的股票代码格式示例
SUPPORTED_CODE_FORMATS = [
    'sh600000',     # 上海股票
    'sz000001',     # 深圳股票
    '600000.XSHG',  # 上海股票（聚宽格式）
    '000001.XSHE',  # 深圳股票（聚宽格式）
    '600000',       # 纯数字格式
    '000001'        # 纯数字格式
]

# 数据目录结构说明
DATA_STRUCTURE_INFO = """
数据目录结构:
{LOCAL_DATA_PATH}/
├── 2022/
│   ├── SH.600000.csv
│   ├── SZ.000001.csv
│   └── ...
├── 2023/
│   ├── SH.600000.csv
│   ├── SZ.000001.csv
│   └── ...
└── 2024/
    ├── SH.600000.csv
    ├── SZ.000001.csv
    └── ...

CSV文件格式:
日期,代码,开盘价,最高价,最低价,收盘价,成交量（手）,成交额（元）
2024-01-02,600000,10.00,10.50,9.80,10.20,1000000,10200000
2024-01-03,600000,10.20,10.60,10.00,10.40,1100000,11440000
...
""".format(LOCAL_DATA_PATH=LOCAL_DATA_PATH)

if __name__ == '__main__':
    print("股票数据源配置信息:")
    print("=" * 50)
    print(f"本地数据路径: {LOCAL_DATA_PATH}")
    print(f"路径是否存在: {os.path.exists(LOCAL_DATA_PATH)}")
    print("\n支持的股票代码格式:")
    for code in SUPPORTED_CODE_FORMATS:
        market, stock_code, filename = get_stock_filename(code)
        print(f"  {code} -> {market}.{stock_code} -> {filename}")
    
    print("\n" + DATA_STRUCTURE_INFO)
