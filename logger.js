const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logger = winston.createLogger({
  defaultMeta: { service: 'logbook' },
  transports: [
    new winston.transports.Console({
      level: 'info',
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.simple(),
      ),
    }),
    new DailyRotateFile({
      filename: 'logbook-error-%DATE%.log',
      level: 'warn',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.label(),
      ),
      zippedArchive: true,
    }),
  ],
});

module.exports = logger;

// const { Console } = require('console');

// module.exports = new Console({
//   stdout: process.stdout, // eslint-disable-line
//   stderr: process.stderr, // eslint-disable-line
// });
