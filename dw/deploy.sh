#!/bin/bash

# 乒乓球预约系统 - 腾讯云部署脚本
# 使用方法：在服务器上执行 bash deploy.sh

echo "=========================================="
echo "乒乓球预约系统 - 自动部署脚本"
echo "=========================================="

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    echo "请使用 root 用户运行此脚本"
    exit 1
fi

# 项目目录
PROJECT_DIR="/root/pingpong-booking"
EXPRESS_DIR="$PROJECT_DIR/Express"

# 1. 检查 Node.js
echo ""
echo "步骤 1: 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "Node.js 未安装，开始安装..."
    
    # 检测系统类型
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        echo "无法检测系统类型"
        exit 1
    fi
    
    if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
    elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
        curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
        yum install -y nodejs
    else
        echo "不支持的系统类型: $OS"
        exit 1
    fi
else
    echo "Node.js 已安装: $(node --version)"
fi

# 2. 检查 PM2
echo ""
echo "步骤 2: 检查 PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "PM2 未安装，开始安装..."
    npm install -g pm2
else
    echo "PM2 已安装: $(pm2 --version)"
fi

# 3. 检查项目目录
echo ""
echo "步骤 3: 检查项目目录..."
if [ ! -d "$PROJECT_DIR" ]; then
    echo "错误: 项目目录不存在: $PROJECT_DIR"
    echo "请先上传项目文件到服务器"
    exit 1
fi

# 4. 安装依赖
echo ""
echo "步骤 4: 安装项目依赖..."
cd "$EXPRESS_DIR"
if [ ! -f "package.json" ]; then
    echo "错误: package.json 不存在"
    exit 1
fi

npm install

# 5. 创建 data 目录
echo ""
echo "步骤 5: 创建数据目录..."
mkdir -p "$EXPRESS_DIR/data"
chmod 755 "$EXPRESS_DIR/data"

# 6. 修改 server.js 监听地址
echo ""
echo "步骤 6: 配置服务器监听地址..."
if grep -q "app.listen(port," "$EXPRESS_DIR/server.js"; then
    sed -i "s/app.listen(port,/app.listen(port, '0.0.0.0',/" "$EXPRESS_DIR/server.js"
    echo "已修改 server.js 监听地址为 0.0.0.0"
fi

# 7. 停止旧进程（如果存在）
echo ""
echo "步骤 7: 停止旧进程..."
pm2 stop pingpong-booking 2>/dev/null
pm2 delete pingpong-booking 2>/dev/null

# 8. 启动应用
echo ""
echo "步骤 8: 启动应用..."
cd "$EXPRESS_DIR"
pm2 start server.js --name pingpong-booking

# 9. 设置开机自启
echo ""
echo "步骤 9: 设置开机自启..."
pm2 startup
pm2 save

# 10. 显示状态
echo ""
echo "=========================================="
echo "部署完成！"
echo "=========================================="
echo ""
echo "应用状态:"
pm2 status pingpong-booking
echo ""
echo "查看日志: pm2 logs pingpong-booking"
echo "重启应用: pm2 restart pingpong-booking"
echo "停止应用: pm2 stop pingpong-booking"
echo ""
echo "访问地址: http://$(curl -s ifconfig.me):3000"
echo "=========================================="

