const cluster = require('cluster');
const http = require('http');
const os = require('os');

const Koa = require('koa');
const Router = require('@koa/router');
const bodyParser = require('koa-bodyparser');

const configuration = require('./configuration');
const logger = require('../sentinel/logger'); // 可以换为自己的日志模块
const main = require('../sentinel/app'); // 替换为主工程的数据库连接

const app = new Koa();

module.exports = app;

app.env = 'production';

app.use(bodyParser());

if (require.main === module) {
  app.use(async (ctx, next) => {
    logger.info(`${new Date()} --> ${ctx.request.method} ${ctx.request.url}`);
    await next();
    logger.info(`${new Date()} <-- ${ctx.request.method} ${ctx.request.url}`);
  });
}

const router = new Router({
  prefix: '/api',
});

router.get('/logbook/:id', async (ctx) => {
  try {
    const sql = `
        select id, date_create,
          json_doc->'$.category' as category,
          json_doc->'$.ref_id' as ref_id,
          json_doc->'$.remark' as remark
        from ovaphlow.logbook
        where id = ?
        limit 1
        `;
    const pool = main.persistence.promise();
    const [result] = await pool.query(sql, [parseInt(ctx.params.id) || 0]);
    ctx.response.body = result[0] || {};
  } catch (err) {
    logger.error(err);
    ctx.response.status = 500;
  }
});

router.put('/logbook/filter', async (ctx) => {
  try {
    const filter = ctx.request.query.filter || '';
    const pool = persistence.promise();
    if (filter === 'default') {
      const sql = `
          select id, date_create,
            json_doc->'$.category' as category,
            json_doc->'$.ref_id' as ref_id,
            json_doc->'$.remark' as remark
          from ovaphlow.logbook
          where date_create between ? and ?
          limit ?, 20
          `;
      const page = parseInt(ctx.request.body.page) || 0;
      const offset = page > 0 ? page * 20 : 0;
      const [result] = await pool.query(sql, [
        ctx.request.body.date_begin,
        ctx.request.body.date_end,
        offset,
      ]);
      ctx.response.body = result;
    } else {
      ctx.response.body = [];
    }
  } catch (err) {
    logger.error(err);
    ctx.response.status = 500;
  }
});

/**
 * append log record
 * json_doc: { ref_id: 0, category: '', remark: '' }
 */
router.post('/logbook', async (ctx) => {
  try {
    const sql = 'insert into ovaphlow.logbook (date_create, json_doc) values (now(), ?)';
    const pool = persistence.promise();
    await pool.query(sql, [JSON.stringify(ctx.request.body)]);
    ctx.response.status = 200;
  } catch (err) {
    logger.error(err);
    ctx.response.status = 500;
  }
});

(() => {
  app.use(router.routes());
  app.use(router.allowedMethods());
})();

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
