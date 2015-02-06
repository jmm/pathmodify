var
  bify = require('browserify'),
  pathmodify = require('../'),
  path = require('path'),
  assert = require('assert'),
  vm = require('vm'),
  b;

describe('Plugin', function () {

  function aliaser (input) {
    var
      output = {},
      prefix = 'app/';

    if (input.id.indexOf(prefix) === 0) {
      output.id = path.join(__dirname, 'src', input.id.substr(prefix.length));

      if (input.opts && input.opts.filename) {
        output.id = './' + path.relative(
          path.dirname(input.opts.filename),
          output.id
        );
      }

      output.expose = "whatever";
    }
    return output;
  }
  // aliaser

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' and expose as 'whatever'",
    function (done) {
      b = bify({
        entries: ['./src/entry'],
        basedir: __dirname,
      })
        .plugin(pathmodify, {
          aliases: [aliaser]
        })
        .bundle(function (err, src) {
          if (err) throw err;

          var c = {};
          vm.runInNewContext(src.toString(), c);

          assert.equal(c.require('whatever'), 'app/a/a.js');

          done();
        });
    }
  );
});
