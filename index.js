const cluster = require('cluster');
const http = require('http');
const os = require('os');

const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const Router = require('@koa/router');
const mysql = require('mysql2');
const superagent = require('superagent');

const CONFIGURATION = require('./configuration');
const logger = require('./logger');
const { config } = require('winston');

const app = new Koa();

module.exports = app;

app.env = 'production';

let persistence;

superagent
  .post('192.168.1.248:8421/api/sentinel')
  .send({})
  .then((response) => {
    persistence = mysql.createPool({
      user: response.body.persistence.user,
      password: response.body.persistence.password,
      host: response.body.persistence.host,
      port: response.body.persistence.port,
      database: CONFIGURATION.DATABASE,
      waitForConnections: true,
      connectionLimit: CONFIGURATION.THREAD * 2,
      queueLimit: CONFIGURATION.THREAD,
    });
  })
  .catch((err) => {
    logger.error(err.stack);
  });

app.use(bodyParser());

app.use(async (ctx, next) => {
  logger.info(`--> ${ctx.request.method} ${ctx.request.url}`);
  await next();
  logger.info(`<-- ${ctx.request.method} ${ctx.request.url}`);
});

const router = new Router({
  prefix: '/api/logbook',
});

router.get('/:id', async (ctx) => {
  try {
    const sql = `
        select id, date_create,
          json_doc->'$.category' as category,
          json_doc->'$.ref_id' as ref_id,
          json_doc->'$.remark' as remark
        from ovaphlow.logbook
        where id = ?
        `;
    const pool = persistence.promise();
    const [result] = await pool.query(sql, [parseInt(ctx.params.id) || 0]);
    ctx.response.body = result[0] || {};
  } catch (err) {
    logger.error(err.stack);
    ctx.response.status = 500;
  }
});

router.put('/filter', async (ctx) => {
  try {
    const filter = ctx.request.query.option || '';
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
    logger.error(err.stack);
    ctx.response.status = 500;
  }
});

/**
 * append log record
 * json_doc: { ref_id: 0, category: '', remark: '' }
 */
router.post('/', async (ctx) => {
  try {
    const sql = 'insert into ovaphlow.logbook (date_create, json_doc) values (now(), ?)';
    const pool = persistence.promise();
    await pool.query(sql, [JSON.stringify(ctx.request.body)]);
    ctx.response.status = 200;
  } catch (err) {
    logger.error(err.stack);
    ctx.response.status = 500;
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

if (require.main === module) {
  if (cluster.isMaster) {
    logger.info(`主进程 PID:${process.pid}`); // eslint-disable-line

    cluster.fork();

    cluster.on('online', (worker) => {
      logger.info(`子进程 PID:${worker.process.pid} 端口:${CONFIGURATION.PORT}`);
    });

    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`子进程 PID:${worker.process.pid}终止，错误代码:${code}，信号:${signal}`);
      logger.warn(`由主进程(PID:${process.pid})创建新的子进程`); // eslint-disable-line
      cluster.fork();
    });
  } else {
    http.createServer(app.callback()).listen(CONFIGURATION.PORT);
  }
}
