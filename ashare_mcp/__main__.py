"""
Ashare MCP 服务入口点
"""

import argparse
from .server import mcp

def main():
    """启动 Ashare MCP 服务"""
    parser = argparse.ArgumentParser(description="Ashare MCP 服务")
    parser.add_argument("--stdio", action="store_true", help="使用标准输入输出模式")

    args = parser.parse_args()

    if args.stdio:
        print("启动 Ashare MCP 服务 (stdio 模式)")
        mcp.run()  # 使用标准输入输出模式
    else:
        print("启动 Ashare MCP 服务 (SSE 模式)")
        print("服务将在 http://0.0.0.0:9000 上运行")
        mcp.run(
            transport="sse",          # 启用 SSE 协议
            host="0.0.0.0",           # 允许远程访问
            port=9000                 # 自定义端口
        )

if __name__ == "__main__":
    main()