const cluster = require('cluster');
const http = require('http');
const os = require('os');

const Koa = require('koa');
const bodyParser = require('koa-bodyparser');

const configuration = require('./configuration');
const logger = require('./logger'); // 可以换为自己的日志模块

const app = new Koa();

app.env = 'production';

app.use(bodyParser({ jsonLimit: '8mb' }));

app.use(async (ctx, next) => {
  logger.info(`${new Date()} --> ${ctx.request.method} ${ctx.request.url}`);
  await next();
  logger.info(`${new Date()} <-- ${ctx.request.method} ${ctx.request.url}`);
});

if (require.main === module) {
  if (cluster.isMaster) {
    logger.log(`${new Date()} 主进程 PID:${process.pid}`); // eslint-disable-line

    for (let i = 0; i < os.cpus().length; i += 1) {
      cluster.fork();
    }

    cluster.on('online', (worker) => {
      logger.log(`${new Date()} 子进程 PID:${worker.process.pid} 端口:${configuration.port}`);
    });

    cluster.on('exit', (worker, code, signal) => {
      logger.log(
        `${new Date()} 子进程 PID:${worker.process.pid}终止，错误代码:${code}，信号:${signal}`,
      );
      logger.log(`${new Date()} 由主进程(PID:${process.pid})创建新的子进程`); // eslint-disable-line
      cluster.fork();
    });
  } else {
    http.createServer(app.callback()).listen(configuration.port);
  }
}
