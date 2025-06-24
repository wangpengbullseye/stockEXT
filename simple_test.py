#!/usr/bin/env python3
# -*- coding: utf-8 -*-

print("开始简单测试...")

try:
    import os
    print("✓ os 模块导入成功")
    
    import pandas as pd
    print("✓ pandas 模块导入成功")
    
    import datetime
    print("✓ datetime 模块导入成功")
    
    from Ashare import get_price
    print("✓ Ashare 模块导入成功")
    
    # 测试本地数据路径
    LOCAL_DATA_PATH = r'E:\work\stock\data'
    print(f"本地数据路径: {LOCAL_DATA_PATH}")
    print(f"路径是否存在: {os.path.exists(LOCAL_DATA_PATH)}")
    
    # 创建测试目录
    year_path = os.path.join(LOCAL_DATA_PATH, '2024')
    if not os.path.exists(year_path):
        os.makedirs(year_path, exist_ok=True)
        print(f"创建目录: {year_path}")
    else:
        print(f"目录已存在: {year_path}")
    
    # 创建简单的测试数据
    test_file = os.path.join(year_path, 'SH.600000.csv')
    if not os.path.exists(test_file):
        print("创建测试数据文件...")
        test_data = """日期,代码,开盘价,最高价,最低价,收盘价,成交量（手）,成交额（元）
2024-01-02,600000,10.00,10.50,9.80,10.20,1000000,10200000
2024-01-03,600000,10.20,10.60,10.00,10.40,1100000,11440000
2024-01-04,600000,10.40,10.80,10.20,10.60,1200000,12720000
2024-01-05,600000,10.60,11.00,10.40,10.80,1300000,14040000
2024-01-08,600000,10.80,11.20,10.60,11.00,1400000,15400000"""
        
        with open(test_file, 'w', encoding='utf-8') as f:
            f.write(test_data)
        print(f"✓ 创建测试文件: {test_file}")
    else:
        print(f"测试文件已存在: {test_file}")
    
    # 测试数据读取
    print("\n开始测试数据读取...")
    df = get_price('sh600000', frequency='1d', count=5)
    
    if not df.empty:
        print(f"✓ 成功读取数据，共 {len(df)} 条记录")
        print("数据内容:")
        print(df.to_string())
    else:
        print("✗ 读取到空数据")
        
except Exception as e:
    print(f"✗ 测试失败: {e}")
    import traceback
    traceback.print_exc()

print("测试完成")
