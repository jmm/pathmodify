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
    opts = opts || {};
    return function (err, src) {
      if (err) return done(err);

      var c = {};
      vm.runInNewContext(src.toString(), c);

      // Require this to be explicitly `null` to avoid, as otherwise it's too
      // easy to accidentally greenlight a bunch of tests that aren't actually
      // testing what they're supposed to.
      if (opts.require_id !== null) {
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
  function run_test (local_opts) {
    local_opts = local_opts || {};

    make_bundler({
      browserify: local_opts.browserify || options.browserify,
      plugin: local_opts.plugin,
    })
      .bundle(make_bundle_cb(local_opts.test, local_opts.done));
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
        plugin: {
          mods: [aliaser]
        },
        test: {require_id: 'whatever'},
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'app/a/a' via bool, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: paths.require_id};
      run_test({
        plugin: {
          mods: [pathmodify.mod.id(
            opts.require_id,
            paths.alias_id,
            true
          )],
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        plugin: {
          mods: [pathmodify.mod.id(
            paths.require_id,
            paths.alias_id,
            opts.require_id
          )]
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification with function replacement, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        plugin: {
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
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'whatever' via function, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        plugin: {
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
        },
        test: opts,
        done: done,
      });
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
        plugin: {
          mods: [pathmodify.mod.dir(
            paths.prefix,
            paths.src,
            true
          )]
        },
        test: opts,
        done: done,
      });
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
        plugin: {
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
        },
        test: opts,
        done: done,
      });
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
        plugin: {
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
        },
        test: opts,
        done: done,
      });
    }
  );

  var from_re = /^app\/(a\/a)$/;

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification, expose as 'app/a/a' via bool, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: paths.require_id};
      run_test({
        plugin: {
          mods: [pathmodify.mod.re(
            from_re,
            tests_path.join(paths.src, '$1' + paths.ext),
            true
          )]
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        plugin: {
          mods: [pathmodify.mod.re(
            from_re,
            tests_path.join(paths.src, '$1' + paths.ext),
            opts.require_id
          )]
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification with function replacement, expose as 'whatever' via string, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        plugin: {
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
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `re` type modification, expose as 'whatever' via function, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: 'whatever'};
      run_test({
        plugin: {
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
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should resolve 'app/a/a' as 'src/a/a.js' via `id` type modification, expose as 'app/a/a' via function returning bool, and apply programmatic transform.",
    function (done) {
      var opts = {require_id: paths.require_id};
      run_test({
        plugin: {
          mods: [pathmodify.mod.id(
            paths.require_id,
            paths.alias_id,
            function (rec, alias) {
              return true;
            }
          )]
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should reset `rec` props for each iteration of the mods loop.",
    function (done) {
      var opts = {require_id: null};
      run_test({
        plugin: {
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
          ],
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should iterate mods loop until an alias is emitted.",
    function (done) {
      var
        opts = {require_id: null},
        i = 0;
      run_test({
        plugin: {
          mods: [
            // Matches from but doesn't modify so shouldn't terminate loop.
            pathmodify.mod.re(from_re, function (rec) {}),

            // Should be iterated to and emit alias.
            pathmodify.mod.re(
              from_re,
              tests_path.join(paths.src, '$1' + paths.ext)
            )
          ]
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should call user mod functions in context of mod.",
    function (done) {
      var
        opts = {require_id: null},
        i = 0;

      run_test({
        plugin: {
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
        },
        test: opts,
        done: done,
      });
    }
  );

  it(
    "Should work on rebundle.",
    function (done) {
      var
        opts = {require_id: null},
        i = 0,
        module_count = 0,
        bundle_cb,
        bundle_times = 2,
        bundles_pending = bundle_times;

      var mod_funcs = {
        id: sinon.spy(function (rec) {
          assert(
            this.from === paths.require_id,
            "from should equal: " + paths.require_id
          );
        }),

        custom: sinon.spy(function mod () {
          assert(this === mod_funcs.custom);
        }),
      };

      var b = make_bundler({
        browserify: options.browserify,
        plugin: {
          mods: [
            pathmodify.mod.id(paths.require_id, mod_funcs.id),
            mod_funcs.custom,
            // Update ID so test doesn't fail for that
            pathmodify.mod.id(paths.require_id, paths.alias_id)
          ]
        },
      });

      function module_counter () {
        ++module_count;
      }

      // Count number of modules (entry files + require()'s) for the first
      // bundle. This will establish how many times some of the aliasing
      // functions should be called.
      b.on('file', module_counter);

      bundle_cb = make_bundle_cb(
        opts,
        function (err) {
          b.removeListener('file', module_counter);
          if (! --bundles_pending || err) {
            if (! err) {
              // Should only be invoked once, for the require('app/a/a') in
              // entry.
              assert(
                mod_funcs.id.callCount === 1,
                "`id` mod should've been called once"
              );

              // Should be invokved once per module (as it'll match everything
              // and change nothing).
              assert(
                mod_funcs.custom.callCount === module_count,
                "custom mod func should've been called once per module: " + module_count
              );
            }
            return done(err);
          }
          else b.bundle(bundle_cb);
        }
      );

      b.bundle(bundle_cb);
    }
  );
});
