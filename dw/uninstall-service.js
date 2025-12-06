const Service = require('node-windows').Service;

const svc = new Service({
  name: 'PingPong Booking Service'
});

svc.on('uninstall', function() {
  console.log('服务卸载成功！');
});

svc.on('error', function(err) {
  console.error('卸载错误:', err);
});

console.log('正在卸载服务...');
svc.uninstall();

