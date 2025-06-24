from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
import sys
import os
import logging
import traceback
from datetime import datetime

# 添加当前目录到系统路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 导入Ashare模块
import Ashare

# 配置日志
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('backend_debug.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)

app = Flask(__name__)

def log_function_call(func_name, **kwargs):
    """记录函数调用"""
    logging.info(f"🔵 调用函数: {func_name}")
    for key, value in kwargs.items():
        logging.info(f"   参数 {key}: {value}")

def log_error(func_name, error, **kwargs):
    """记录错误"""
    logging.error(f"❌ 函数 {func_name} 出错: {str(error)}")
    logging.error(f"   错误类型: {type(error).__name__}")
    for key, value in kwargs.items():
        logging.error(f"   参数 {key}: {value}")
    logging.error(f"   堆栈跟踪: {traceback.format_exc()}")

@app.route('/')
def index():
    """渲染主页"""
    return render_template('index.html')

@app.route('/api/kline')
def get_kline():
    """获取K线数据的API"""
    try:
        # 获取请求参数
        code = request.args.get('code', 'sh000001')
        period = request.args.get('period', 'D')
        limit = int(request.args.get('limit', 1000))  # 控制返回的K线数量
        end_date = request.args.get('end_date')  # 获取截止日期参数
        start_date = request.args.get('start_date')  # 获取开始日期参数
        page = int(request.args.get('page', 1))  # 获取页码，默认为第1页

        # 记录API调用
        log_function_call('get_kline',
                         code=code, period=period, limit=limit,
                         end_date=end_date, start_date=start_date, page=page)
        
        # 转换周期格式
        period_map = {
            'D': '1d',     # 日线
            'W': '1w',     # 周线
            'M': '1M',     # 月线
            '1': '1m',     # 1分钟
            '5': '5m',     # 5分钟
            '15': '15m',   # 15分钟
            '30': '30m',   # 30分钟
            '60': '60m'    # 60分钟
        }
        
        frequency = period_map.get(period, '1d')
        
        # 计算实际需要获取的数据量
        actual_limit = limit * page

        # 使用Ashare获取股票数据
        logging.info(f"🔍 开始获取股票数据: {code}, 周期: {frequency}, 数量: {actual_limit}")
        df = Ashare.get_price(code, frequency=frequency, count=actual_limit, end_date=end_date, start_date=start_date)

        if df is None:
            logging.error("❌ Ashare.get_price 返回 None")
            return jsonify({'error': 'Failed to get data from Ashare'})

        logging.info(f"✅ 获取到数据，形状: {df.shape}")
        logging.info(f"📊 数据列: {list(df.columns)}")
        logging.info(f"📅 索引类型: {type(df.index)}")

        # 转换日期格式
        try:
            df['date'] = df.index.strftime('%Y-%m-%d %H:%M:%S')
            logging.info("✅ 日期格式转换成功")
        except Exception as date_error:
            logging.error(f"❌ 日期格式转换失败: {date_error}")
            # 尝试其他方式转换日期
            df['date'] = df.index.astype(str)

        # 确保数据按时间升序排列
        df = df.sort_index()
        logging.info(f"✅ 数据排序完成，最终数据量: {len(df)}")
        
        # 转换为JSON格式
        result = []
        for _, row in df.iterrows():
            result.append({
                'date': row['date'],
                'open': float(row['open']),
                'close': float(row['close']),
                'low': float(row['low']),
                'high': float(row['high']),
                'volume': float(row['volume'])
            })
        
        logging.info(f"✅ API调用成功，返回 {len(result)} 条数据")
        return jsonify(result)

    except Exception as e:
        log_error('get_kline', e,
                 code=code, period=period, limit=limit,
                 end_date=end_date, start_date=start_date, page=page)
        return jsonify({'error': str(e)})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)