var
  bify = require('browserify'),
  rs = require('readable-stream'),
  util = require('util'),
  pathmodify = require('../'),
  path = require('path'),
  assert = require('assert'),
  sinon = require('sinon'),
  assign = Object.assign || require('object-assign'),
  vm = require('vm'),
  // Like core paths module, but tailored for the purposes of these tests.
  tests_path = {},
  b;

tests_path.join = function join () {
  return path.join.apply(path, arguments).replace('\\', this.sep);
};

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
    options = {},
    paths = {};

  options.browserify = {
    entries: ['./src/entry'],
    basedir: __dirname,
  };

  paths.sep = '/';
  tests_path.sep = paths.sep;

  paths.src = tests_path.join(__dirname, 'src');
  paths.prefix = 'app';
  paths.subdir = 'a';
  paths.basename = paths.subdir;
  paths.ext = '.js';
  paths.require_id = tests_path.join(
    paths.prefix, paths.subdir, paths.basename
  );
  paths.alias_id = tests_path.join(paths.src, paths.subdir, paths.basename + paths.ext);

  /**
   * Make a browserify instance with a certain configuration.
   * This config will work for a bunch of tests.
   */
  function make_bundler (opts) {
    opts = opts || {};

    return bify(opts.browserify)
      .plugin(pathmodify(), opts.plugin)
      .transform(function (file) { return new Xform; })
    ;
  }
  // make_bundler

  /**
   * Make callback for b.bundle().
   * This callback will work for a bunch of tests.
   * @param object Opts options
   * @param function|undefined done Test framework callback.
   * @return function
   */
  function make_bundle_cb (opts, done) {
    return function (err, src) {
      if (err) return done(err);

      var c = {};
      vm.runInNewContext(src.toString(), c);

      if (opts.require_id) {
        assert.equal(
          c.require(opts.require_id),
          'UPPERCASE ' + paths.require_id + paths.ext
        );
      }

      if (done) done();
    };
  }
  // make_bundle_cb

  /**
   * Run the "standard" test.
   * This can be reused as the bulk of many of the tests.
   * @param object plugin_opts Pathmodify options.
   * @param object opts Test options.
   * @param function done Test framework callback.
   */
  function run_test (plugin_opts, opts, done) {
    make_bundler({
      browserify: options.browserify,
      plugin: plugin_opts,
    })
      .bundle(make_bundle_cb(opts, done));
  }
  // run_test

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via function, expose as 'whatever', and apply programmatic transform.",
    function (done) {
      function aliaser (input) {
        var
          prefix = [paths.prefix, paths.sep].join(''),
          output = {};

        if (input.id.indexOf(prefix) === 0) {
          output.id = tests_path.join(
            paths.src,
            input.id.substr(prefix.length)
          );

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

      run_test({
        mods: [aliaser]
      }, {require_id: 'whatever'}, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'app/a/a' via bool, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: paths.require_id};
      run_test({
        mods: [pathmodify.mod.id(
          opts.require_id,
          paths.alias_id,
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
          paths.require_id,
          paths.alias_id,
          opts.require_id
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification with function replacement, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        mods: [pathmodify.mod.id(
          paths.require_id,
          function (rec) {
            assert.notStrictEqual(rec, undefined);
            assert.strictEqual(typeof rec.id, 'string');
            assert.ok(rec.id.length > 0);

            return {id: tests_path.join(
              paths.src, paths.subdir, paths.basename + paths.ext
            )};
          },
          opts.require_id
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'whatever' via function, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        mods: [pathmodify.mod.id(
          paths.require_id,
          paths.alias_id,
          function (rec, alias) {
            assert.notStrictEqual(rec, undefined);
            assert.strictEqual(typeof rec.id, 'string');
            assert.ok(rec.id.length > 0);

            assert.notStrictEqual(alias, undefined);
            assert.strictEqual(typeof alias.id, 'string');
            assert.ok(alias.id.length > 0);

            return opts.require_id;
          }
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `dir` type modification, expose as 'app/a/a' via bool, and apply programmatic transform.",
    function (done) {
      var
        expose_prefix = 'whatever',
        opts = {
          require_id: tests_path.join(
            paths.prefix,
            paths.subdir,
            paths.basename
          ),
        };

      run_test({
        mods: [pathmodify.mod.dir(
          paths.prefix,
          paths.src,
          true
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `dir` type modification, expose as 'whatever/a/a' via function, and apply programmatic transform.",
    function (done) {
      var
        expose_prefix = 'whatever',
        opts = {
          require_id: tests_path.join(
            expose_prefix,
            paths.subdir,
            paths.basename
          ),
        };

      run_test({
        mods: [pathmodify.mod.dir(
          paths.prefix,
          paths.src,
          function (rec, alias) {
            return tests_path.join(
              expose_prefix,
              rec.id.substr(paths.prefix.length)
            );
          }
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `dir` type modification with function replacement, expose as 'app/a/a' via bool, and apply programmatic transform.",
    function (done) {
      var
        expose_prefix = 'whatever',
        opts = {
          require_id: tests_path.join(
            paths.prefix,
            paths.subdir,
            paths.basename
          ),
        };

      run_test({
        mods: [pathmodify.mod.dir(
          paths.prefix,
          function (rec) {
            assert.notStrictEqual(rec, undefined);
            assert.strictEqual(typeof rec.id, 'string');
            assert.ok(rec.id.length > 0);

            return {id: tests_path.join(
              paths.src, paths.subdir, paths.basename + paths.ext
            )};
          },
          true
        )]
      }, opts, done);
    }
  );

  var from_re = /^app\/(a\/a)$/;

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification, expose as 'app/a/a' via bool, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: paths.require_id};
      run_test({
        mods: [pathmodify.mod.re(
          from_re,
          tests_path.join(paths.src, '$1' + paths.ext),
          true
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        mods: [pathmodify.mod.re(
          from_re,
          tests_path.join(paths.src, '$1' + paths.ext),
          opts.require_id
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification with function replacement, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        mods: [pathmodify.mod.re(
          from_re,
          function (rec, opts) {
            assert.notStrictEqual(rec, undefined);
            assert.strictEqual(typeof rec.id, 'string');
            assert.ok(rec.id.length > 0);

            return {id: tests_path.join(
              paths.src, opts.matches[1] + paths.ext
            )};
          },
          opts.require_id
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification, expose as 'whatever' via function, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        mods: [pathmodify.mod.re(
          from_re,
          tests_path.join(paths.src, '$1' + paths.ext),
          function (rec, alias) {
            assert.notStrictEqual(rec, undefined);
            assert.strictEqual(typeof rec.id, 'string');
            assert.ok(rec.id.length > 0);

            assert.notStrictEqual(alias, undefined);
            assert.strictEqual(typeof alias.id, 'string');
            assert.ok(alias.id.length > 0);

            return opts.require_id;
          }
        )]
      }, opts, done);
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'app/a/a' via function returning bool, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: paths.require_id};
      run_test({
        mods: [pathmodify.mod.id(
          paths.require_id,
          paths.alias_id,
          function (rec, alias) {
            return true;
          }
        )]
      }, opts, done);
    }
  );

  it(
    "Should reset `rec` props for each iteration of the mods loop.",
    function (done) {
      var opts = {};
      run_test({
        mods: [
          function (rec, opts) {
            rec.id = 'bogus';
          },
          pathmodify.mod.id(paths.require_id, function (rec) {
            assert.strictEqual(rec.id, paths.require_id);

            return {id: tests_path.join(
              paths.src, paths.subdir, paths.basename + paths.ext
            )};
          })
        ]
      }, opts, done);
    }
  );

  it(
    "Should iterate mods loop until an alias is emitted.",
    function (done) {
      var
        opts = {},
        i = 0;
      run_test({
        mods: [
          // Matches from but doesn't modify so shouldn't terminate loop.
          pathmodify.mod.re(from_re, function (rec) {}),

          // Should be iterated to and emit alias.
          pathmodify.mod.re(
            from_re,
            tests_path.join(paths.src, '$1' + paths.ext)
          )
        ]
      }, opts, done);
    }
  );

  it(
    "Should call user mod functions in context of mod.",
    function (done) {
      var
        opts = {},
        i = 0;

      run_test({
        mods: [
          pathmodify.mod.id(paths.require_id, function (rec) {
            assert.strictEqual(this.from, paths.require_id);
          }),

          function mod () {
            assert.strictEqual(this, mod);
          },

          // Update ID so test doesn't fail for that
          pathmodify.mod.id(paths.require_id, paths.alias_id)
        ]
      }, opts, done);
    }
  );
});
