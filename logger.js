const { Console } = require('console');

module.exports = new Console({
  stdout: process.stdout, // eslint-disable-line
  stderr: process.stderr, // eslint-disable-line
});
