#-*- coding:utf-8 -*-    --------------Ashare 股票行情数据双核心版( https://github.com/mpquant/Ashare )
import json,requests,datetime,os;      import pandas as pd  #

# 导入配置
from config import LOCAL_DATA_PATH, get_stock_filename, get_data_file_path

def aggregate_data_by_frequency(df, frequency, target_count=1000):
    """
    根据频率聚合分钟级数据，保持固定的K线数量

    Args:
        df: 原始分钟级数据
        frequency: 目标频率 ('1d', '1w', '1M', '1m', '5m', '15m', '30m', '60m')
        target_count: 目标K线数量，默认1000根

    Returns:
        聚合后的DataFrame，包含固定数量的K线
    """
    if df.empty:
        return df

    print(f"开始聚合数据: 原始数据{len(df)}条, 目标频率{frequency}, 目标数量{target_count}条")

    # 确保数据按时间排序
    df = df.sort_values('date')

    if frequency == '1d':  # 日线
        # 按日期分组聚合
        df['date_only'] = df['date'].dt.date
        grouped = df.groupby('date_only').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).reset_index()
        grouped['date'] = pd.to_datetime(grouped['date_only'])
        result = grouped[['date', 'open', 'high', 'low', 'close', 'volume']]

    elif frequency == '1w':  # 周线
        df_temp = df.copy()
        df_temp.set_index('date', inplace=True)
        weekly = df_temp.resample('W').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).reset_index()
        result = weekly

    elif frequency == '1M':  # 月线
        df_temp = df.copy()
        df_temp.set_index('date', inplace=True)
        monthly = df_temp.resample('M').agg({
            'open': 'first',
            'high': 'max',
            'low': 'min',
            'close': 'last',
            'volume': 'sum'
        }).reset_index()
        result = monthly

    elif frequency in ['1m', '5m', '15m', '30m', '60m']:  # 分钟线聚合
        # 提取分钟数
        minutes = int(frequency[:-1])

        if minutes == 1:
            # 1分钟线直接返回
            result = df
        else:
            # 聚合到指定分钟
            df_temp = df.copy()
            df_temp.set_index('date', inplace=True)

            # 使用pandas的resample进行时间聚合
            freq_str = f'{minutes}T'  # T表示分钟
            aggregated = df_temp.resample(freq_str).agg({
                'open': 'first',
                'high': 'max',
                'low': 'min',
                'close': 'last',
                'volume': 'sum'
            }).reset_index()

            # 过滤掉没有数据的时间段
            result = aggregated.dropna()
    else:
        # 未知频率，直接返回原数据
        result = df

    # 确保返回固定数量的K线（取最新的数据）
    if len(result) > target_count:
        result = result.tail(target_count)
        print(f"数据量超过目标，截取最新{target_count}条")

    print(f"聚合完成: 返回{len(result)}条{frequency}数据")
    return result

def get_price_local(code, end_date='', count=1000, frequency='1d', start_date=''):
    """
    从本地CSV文件读取股票数据 - 智能聚合到指定周期

    Args:
        code: 股票代码
        end_date: 结束日期
        count: 需要的K线数量
        frequency: 目标频率
        start_date: 开始日期

    Returns:
        聚合后的DataFrame，包含指定数量的K线
    """
    try:
        # 确定需要读取的年份范围
        current_year = datetime.datetime.now().year
        start_year = None
        end_year = None

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

        # 确定最终的年份范围
        if start_year is None and end_year is None:
            # 没有指定任何日期，默认使用最近的年份
            for year in [2025, 2024, 2023, 2022]:
                test_path = get_data_file_path(code, year)
                if os.path.exists(test_path):
                    start_year = end_year = year
                    break
            # 如果还是没找到，使用默认值
            if start_year is None:
                start_year = end_year = current_year
        elif start_year is None and end_year is not None:
            # 只指定了结束日期，从结束年份往前推几年
            start_year = max(2020, end_year - 2)  # 最多往前推2年，最早到2020年
        elif end_year is None and start_year is not None:
            # 只指定了开始日期，从开始年份到当前年份
            end_year = current_year

        # 确保年份范围有效且不为None
        if start_year is None:
            start_year = current_year
        if end_year is None:
            end_year = current_year
        if start_year > end_year:
            start_year, end_year = end_year, start_year

        # 读取跨年份的数据
        all_data = []
        for year in range(start_year, end_year + 1):
            file_path = get_data_file_path(code, year)

            # 检查文件是否存在
            if not os.path.exists(file_path):
                print(f"警告: 数据文件不存在: {file_path}")
                continue

            # 读取CSV文件，处理编码问题
            try:
                # 尝试不同的编码
                for encoding in ['utf-8', 'gbk', 'gb2312']:
                    try:
                        df_year = pd.read_csv(file_path, encoding=encoding)
                        break
                    except UnicodeDecodeError:
                        continue
                else:
                    raise UnicodeDecodeError("无法解码文件")

                # 检查列数，确保数据格式正确
                if len(df_year.columns) >= 7:
                    # 重命名列以匹配原有格式
                    df_year.columns = ['date', 'code', 'open', 'high', 'low', 'close', 'volume', 'amount'][:len(df_year.columns)]

                    # 转换数据类型
                    df_year['date'] = pd.to_datetime(df_year['date'])
                    df_year['open'] = pd.to_numeric(df_year['open'], errors='coerce')
                    df_year['high'] = pd.to_numeric(df_year['high'], errors='coerce')
                    df_year['low'] = pd.to_numeric(df_year['low'], errors='coerce')
                    df_year['close'] = pd.to_numeric(df_year['close'], errors='coerce')
                    df_year['volume'] = pd.to_numeric(df_year['volume'], errors='coerce')

                    # 过滤掉无效数据
                    df_year = df_year.dropna()

                    all_data.append(df_year)

            except Exception as e:
                print(f"读取文件 {file_path} 失败: {e}")
                continue

        # 合并所有年份的数据
        if not all_data:
            # 列出尝试过的文件路径，帮助用户调试
            attempted_paths = []
            for year in range(start_year, end_year + 1):
                attempted_paths.append(get_data_file_path(code, year))

            error_msg = f"未找到股票 {code} 的数据文件。尝试过的路径:\n" + "\n".join(attempted_paths)
            print(error_msg)
            raise FileNotFoundError(error_msg)

        df = pd.concat(all_data, ignore_index=True)

        # 按日期排序
        df = df.sort_values('date')

        # 根据日期范围筛选
        if start_date:
            start_timestamp = pd.to_datetime(start_date.split(' ')[0] if isinstance(start_date, str) else start_date)
            df = df[df['date'] >= start_timestamp]

        if end_date:
            end_timestamp = pd.to_datetime(end_date.split(' ')[0] if isinstance(end_date, str) else end_date)
            df = df[df['date'] <= end_timestamp]

        # 根据频率聚合数据
        df = aggregate_data_by_frequency(df, frequency)

        # 设置日期为索引
        df.set_index('date', inplace=True)
        df.index.name = ''

        # 只保留需要的列
        df = df[['open', 'close', 'high', 'low', 'volume']]

        # 如果指定了日期范围，返回该范围内的所有数据
        # 如果没有指定日期范围，返回最后count条记录
        if not start_date and not end_date:
            # 没有指定日期范围，返回最后count条记录
            if len(df) > count:
                df = df.tail(count)
        else:
            # 指定了日期范围，返回该范围内的所有数据（不受count限制）
            print(f"返回日期范围内的所有数据: {len(df)} 条记录")

        return df

    except Exception as e:
        print(f"读取本地数据失败: {e}")
        # 如果本地数据读取失败，返回空DataFrame
        return pd.DataFrame(columns=['open', 'close', 'high', 'low', 'volume'])

#腾讯日线
def get_price_day_tx(code, end_date='', count=10, frequency='1d'):     #日线获取  
    unit='week' if frequency in '1w' else 'month' if frequency in '1M' else 'day'     #判断日线，周线，月线
    if end_date:  end_date=end_date.strftime('%Y-%m-%d') if isinstance(end_date,datetime.date) else end_date.split(' ')[0]
    end_date='' if end_date==datetime.datetime.now().strftime('%Y-%m-%d') else end_date   #如果日期今天就变成空    
    URL=f'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},{unit},,{end_date},{count},qfq'     
    st= json.loads(requests.get(URL).content);    ms='qfq'+unit;      stk=st['data'][code]   
    buf=stk[ms] if ms in stk else stk[unit]       #指数返回不是qfqday,是day
    df=pd.DataFrame(buf,columns=['time','open','close','high','low','volume'],dtype='float')     
    df.time=pd.to_datetime(df.time);    df.set_index(['time'], inplace=True);   df.index.name=''          #处理索引 
    return df

#腾讯分钟线
def get_price_min_tx(code, end_date=None, count=10, frequency='1d'):    #分钟线获取 
    ts=int(frequency[:-1]) if frequency[:-1].isdigit() else 1           #解析K线周期数
    if end_date: end_date=end_date.strftime('%Y-%m-%d') if isinstance(end_date,datetime.date) else end_date.split(' ')[0]        
    URL=f'http://ifzq.gtimg.cn/appstock/app/kline/mkline?param={code},m{ts},,{count}' 
    st= json.loads(requests.get(URL).content);       buf=st['data'][code]['m'+str(ts)] 
    df=pd.DataFrame(buf,columns=['time','open','close','high','low','volume','n1','n2'])   
    df=df[['time','open','close','high','low','volume']]    
    df[['open','close','high','low','volume']]=df[['open','close','high','low','volume']].astype('float')
    df.time=pd.to_datetime(df.time);   df.set_index(['time'], inplace=True);   df.index.name=''          #处理索引     
    df['close'][-1]=float(st['data'][code]['qt'][code][3])                #最新基金数据是3位的
    return df


#sina新浪全周期获取函数，分钟线 5m,15m,30m,60m  日线1d=240m   周线1w=1200m  1月=7200m
def get_price_sina(code, end_date='', count=10, frequency='60m'):    #新浪全周期获取函数    
    frequency=frequency.replace('1d','240m').replace('1w','1200m').replace('1M','7200m');   mcount=count
    ts=int(frequency[:-1]) if frequency[:-1].isdigit() else 1       #解析K线周期数
    if (end_date!='') & (frequency in ['240m','1200m','7200m']): 
        end_date=pd.to_datetime(end_date) if not isinstance(end_date,datetime.date) else end_date    #转换成datetime
        unit=4 if frequency=='1200m' else 29 if frequency=='7200m' else 1    #4,29多几个数据不影响速度
        count=count+(datetime.datetime.now()-end_date).days//unit            #结束时间到今天有多少天自然日(肯定 >交易日)        
        #print(code,end_date,count)    
    URL=f'http://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={code}&scale={ts}&ma=5&datalen={count}' 
    dstr= json.loads(requests.get(URL).content);       
    #df=pd.DataFrame(dstr,columns=['day','open','high','low','close','volume'],dtype='float') 
    df= pd.DataFrame(dstr,columns=['day','open','high','low','close','volume'])
    df['open'] = df['open'].astype(float); df['high'] = df['high'].astype(float);                          #转换数据类型
    df['low'] = df['low'].astype(float);   df['close'] = df['close'].astype(float);  df['volume'] = df['volume'].astype(float)    
    df.day=pd.to_datetime(df.day);    df.set_index(['day'], inplace=True);     df.index.name=''            #处理索引                 
    if (end_date!='') & (frequency in ['240m','1200m','7200m']): return df[df.index<=end_date][-mcount:]   #日线带结束时间先返回              
    return df

def get_price(code, end_date='',count=10, frequency='1d', fields=[], start_date=''):        #对外暴露只有唯一函数，这样对用户才是最友好的
    # 优先尝试从本地数据源获取数据
    try:
        df_local = get_price_local(code, end_date=end_date, count=count, frequency=frequency, start_date=start_date)
        if not df_local.empty:
            print(f"成功从本地数据源获取 {code} 的数据，共 {len(df_local)} 条记录")
            return df_local
    except Exception as e:
        print(f"本地数据源获取失败: {e}，尝试网络数据源...")

    # 如果本地数据获取失败，使用原有的网络数据源
    xcode= code.replace('.XSHG','').replace('.XSHE','')                      #证券代码编码兼容处理
    xcode='sh'+xcode if ('XSHG' in code)  else  'sz'+xcode  if ('XSHE' in code)  else code

    if  frequency in ['1d','1w','1M']:   #1d日线  1w周线  1M月线
         try:    return get_price_sina( xcode, end_date=end_date,count=count,frequency=frequency)   #主力
         except: return get_price_day_tx(xcode,end_date=end_date,count=count,frequency=frequency)   #备用

    if  frequency in ['1m','5m','15m','30m','60m']:  #分钟线 ,1m只有腾讯接口  5分钟5m   60分钟60m
         if frequency in '1m': return get_price_min_tx(xcode,end_date=end_date,count=count,frequency=frequency)
         try:    return get_price_sina(  xcode,end_date=end_date,count=count,frequency=frequency)   #主力
         except: return get_price_min_tx(xcode,end_date=end_date,count=count,frequency=frequency)   #备用
        
if __name__ == '__main__':    
    df=get_price('sh000001',frequency='1d',count=10)      #支持'1d'日, '1w'周, '1M'月  
    print('上证指数日线行情\n',df)
    
    df=get_price('000001.XSHG',frequency='15m',count=10)  #支持'1m','5m','15m','30m','60m'
    print('上证指数分钟线\n',df)

# Ashare 股票行情数据( https://github.com/mpquant/Ashare ) 
