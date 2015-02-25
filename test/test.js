var
  bify = require('browserify'),
  rs = require('browserify/node_modules/readable-stream'),
  util = require('util'),
  pathmodify = require('../'),
  path = require('path'),
  assert = require('assert'),
  vm = require('vm'),
  b;

// Transform stream to test programatic transforms.
function Xform () {
  rs.Transform.apply(this, arguments);
}

util.inherits(Xform, rs.Transform);

Xform.prototype._transform = function (chunk, enc, cb) {
  this.push(chunk.toString().replace("lowercase", "UPPERCASE"));
  cb();
};

describe('Plugin', function () {
  var
    bify_opts,
    paths = {};

  bify_opts =  {
    entries: ['./src/entry'],
    basedir: __dirname,
  };

  paths.prefix = 'app/';
  paths.src = path.join(__dirname, 'src');
  paths.a_rel = 'a/a.js';

  function aliaser (input) {
    var
      output = {};

    if (input.id.indexOf(paths.prefix) === 0) {
      output.id = path.join(paths.src, input.id.substr(paths.prefix.length));

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

  function run_test (plugin_opts, opts, done) {
    bify(bify_opts)
      .plugin(pathmodify, plugin_opts)
      .transform(function (file) { return new Xform; })
      .bundle(function (err, src) {
        if (err) throw err;

        var c = {};
        vm.runInNewContext(src.toString(), c);

        assert.equal(c.require(opts.require_id), 'UPPERCASE app/a/a.js');

        done();
      });
  }
  // run_test

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via function, expose as 'whatever', and apply programmatic transform.",
    function (done) {
      run_test({
        mods: [aliaser]
      }, {require_id: 'whatever'}, done);
    }
  );

   it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'app/a/a' via bool, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'app/a/a'};
      run_test({
        mods: [pathmodify.mod.id(
          opts.require_id,
          path.join(paths.src, paths.a_rel),
          true
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        mods: [pathmodify.mod.id(
          'app/a/a',
          path.join(paths.src, paths.a_rel),
          opts.require_id
        )]
      }, opts, done);
    }
  );
});
