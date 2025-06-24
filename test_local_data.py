#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试本地数据源功能
"""

import os
import pandas as pd
import datetime
from Ashare import get_price

def create_test_data():
    """创建测试数据文件"""
    # 创建测试目录
    test_data_path = r'E:\work\stock\data'
    year_path = os.path.join(test_data_path, '2024')
    
    if not os.path.exists(year_path):
        os.makedirs(year_path, exist_ok=True)
        print(f"创建测试目录: {year_path}")
    
    # 创建测试数据
    test_file = os.path.join(year_path, 'SH.600000.csv')
    
    if not os.path.exists(test_file):
        # 生成测试数据
        dates = pd.date_range(start='2024-01-01', end='2024-12-31', freq='D')
        # 过滤掉周末
        dates = dates[dates.weekday < 5]
        
        data = []
        base_price = 10.0
        
        for i, date in enumerate(dates):
            # 模拟股价波动
            open_price = base_price + (i % 10) * 0.1
            high_price = open_price + 0.5
            low_price = open_price - 0.3
            close_price = open_price + (i % 5 - 2) * 0.1
            volume = 1000000 + (i % 100) * 10000
            amount = volume * close_price
            
            data.append([
                date.strftime('%Y-%m-%d'),
                '600000',
                round(open_price, 2),
                round(high_price, 2),
                round(low_price, 2),
                round(close_price, 2),
                int(volume),
                int(amount)
            ])
        
        # 创建DataFrame并保存
        df = pd.DataFrame(data, columns=['日期', '代码', '开盘价', '最高价', '最低价', '收盘价', '成交量（手）', '成交额（元）'])
        df.to_csv(test_file, index=False, encoding='utf-8')
        print(f"创建测试数据文件: {test_file}")
        print(f"数据条数: {len(df)}")
    else:
        print(f"测试数据文件已存在: {test_file}")

def test_local_data_source():
    """测试本地数据源"""
    print("=" * 50)
    print("测试本地数据源功能")
    print("=" * 50)
    
    # 测试不同的股票代码格式
    test_codes = [
        'sh600000',
        '600000.XSHG',
        'SH600000',
        '600000'
    ]
    
    for code in test_codes:
        print(f"\n测试股票代码: {code}")
        try:
            df = get_price(code, frequency='1d', count=10)
            if not df.empty:
                print(f"✓ 成功获取数据，共 {len(df)} 条记录")
                print("最新5条数据:")
                print(df.tail().to_string())
            else:
                print("✗ 获取到空数据")
        except Exception as e:
            print(f"✗ 获取数据失败: {e}")

def test_date_range():
    """测试日期范围功能"""
    print("\n" + "=" * 50)
    print("测试日期范围功能")
    print("=" * 50)
    
    code = 'sh600000'
    end_date = '2024-06-30'
    
    print(f"测试获取 {code} 截止到 {end_date} 的数据")
    try:
        df = get_price(code, end_date=end_date, frequency='1d', count=20)
        if not df.empty:
            print(f"✓ 成功获取数据，共 {len(df)} 条记录")
            print("日期范围:")
            print(f"最早日期: {df.index.min()}")
            print(f"最晚日期: {df.index.max()}")
            print("最新5条数据:")
            print(df.tail().to_string())
        else:
            print("✗ 获取到空数据")
    except Exception as e:
        print(f"✗ 获取数据失败: {e}")

def main():
    """主函数"""
    print("开始测试本地数据源功能...")
    
    # 创建测试数据
    create_test_data()
    
    # 测试本地数据源
    test_local_data_source()
    
    # 测试日期范围
    test_date_range()
    
    print("\n" + "=" * 50)
    print("测试完成")
    print("=" * 50)

if __name__ == '__main__':
    main()
