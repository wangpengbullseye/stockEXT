#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import os

# 添加当前目录到Python路径
sys.path.insert(0, os.path.dirname(__file__))

try:
    print("开始测试本地数据源...")
    
    # 导入模块
    import Ashare
    print("✓ 成功导入Ashare模块")
    
    # 测试本地数据读取
    print("\n测试读取SH.600000数据...")
    df = Ashare.get_price('sh600000', frequency='1d', count=10)
    
    if not df.empty:
        print(f"✓ 成功读取数据，共 {len(df)} 条记录")
        print("\n最新5条数据:")
        print(df.tail().to_string())
        
        print(f"\n数据列: {list(df.columns)}")
        print(f"数据类型: {df.dtypes.to_dict()}")
        print(f"日期范围: {df.index.min()} 到 {df.index.max()}")
    else:
        print("✗ 读取到空数据")
    
    # 测试不同的股票代码格式
    print("\n" + "="*50)
    print("测试不同股票代码格式:")
    
    test_codes = ['sh600000', '600000.XSHG', '600000']
    for code in test_codes:
        print(f"\n测试代码: {code}")
        try:
            df = Ashare.get_price(code, frequency='1d', count=3)
            if not df.empty:
                print(f"✓ 成功，{len(df)}条记录")
            else:
                print("✗ 空数据")
        except Exception as e:
            print(f"✗ 错误: {e}")
    
    print("\n" + "="*50)
    print("测试完成")
    
except Exception as e:
    print(f"测试失败: {e}")
    import traceback
    traceback.print_exc()
