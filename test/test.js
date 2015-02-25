var
  bify = require('browserify'),
  rs = require('browserify/node_modules/readable-stream'),
  util = require('util'),
  pathmodify = require('../'),
  path = require('path'),
  assert = require('assert'),
  vm = require('vm'),
  b;

function Xform () {
  rs.Transform.apply(this, arguments);
}

util.inherits(Xform, rs.Transform);

Xform.prototype._transform = function (chunk, enc, cb) {
  this.push(chunk.toString().replace("lowercase", "UPPERCASE"));
  cb();
};

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
    "Should resolve 'app/a/a' as 'src/a/a.js', expose as 'whatever', and apply programmatic transform.",
    function (done) {
      b = bify({
        entries: ['./src/entry'],
        basedir: __dirname,
      })
        .plugin(pathmodify, {
          mods: [aliaser]
        })
        .transform(function (file) { return new Xform; })
        .bundle(function (err, src) {
          if (err) throw err;

          var c = {};
          vm.runInNewContext(src.toString(), c);

          assert.equal(c.require('whatever'), 'UPPERCASE app/a/a.js');

          done();
        });
    }
  );
});
