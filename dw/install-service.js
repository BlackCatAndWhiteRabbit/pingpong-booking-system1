const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'PingPong Booking Service',
  description: '乒乓球预约系统服务',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: []
});

svc.on('install', function() {
  console.log('服务安装成功！');
  console.log('正在启动服务...');
  svc.start();
});

svc.on('start', function() {
  console.log('服务启动成功！');
  console.log('应用运行在: http://localhost:3000');
});

svc.on('error', function(err) {
  console.error('服务错误:', err);
});

console.log('正在安装服务...');
svc.install();

