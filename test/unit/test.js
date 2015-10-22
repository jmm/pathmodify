var
  assert = require('assert'),
  rs = require('readable-stream'),
  sinon = require('sinon'),
  pathmodify = require('../../'),
  mod = pathmodify.mod,
  assign = Object.assign || require('object-assign'),
  EventEmitter = require('events').EventEmitter,
  util = require('util');

pathmodify = pathmodify();

describe('Plugin', function () {
  var
    b,
    original_resolver,
    new_resolver,
    resolver_done,
    // Pathmodify opts.
    opts;

  // Browserify stub constructor.
  function Browserify () {
    EventEmitter.call(this);
    this._init();
  }

  util.inherits(Browserify, EventEmitter);

  /**
   * Logic common to construction and reset.
   * Not part of actual Browserify API.
   */
  Browserify.prototype._init = function () {
    var b = this;
    /**
     * Make a get() for pipeline phase stub.
     */
    function make_getter () {
      return sinon.spy(function (key) {
        return this._phases[key];
      });
    };
    // make_getter

    /**
     * Make a pipeline phase stub.
     */
    function make_phase () {
      return {
        _phases: [],
        get: make_getter(),
        push: function (phase) {
          this._phases.push(phase);
        },
      };
    }
    // make_phase

    // Pipeline stub.
    var pipeline = {};

    pipeline.get = make_getter();

    pipeline._phases = {
      deps: make_phase(),
      pack: make_phase(),
    };

    // Stub the original resolver.
    original_resolver = sinon.spy(function (id, opts, cb) {
      var
        cfg = original_resolver.cb_args,
        res = cfg.res;
      if (! (cfg.err || res)) res = id;
      cb(
        cfg.err,
        res,
        cfg.pkg
      );
    });

    // Placeholder for deps[0] (module-deps).
    pipeline.get('deps').push({
      resolver: original_resolver,
    });

    // Placeholder for pack[0] (browser-pack).
    pipeline.get('pack').push({
    });

    b.pipeline = pipeline;
    b._expose = {};
  };
  // _init

  Browserify.prototype.reset = function () {
    this._init();
    this.emit('reset');
  };

  function init_new_resolver () {
    new_resolver = sinon.spy(b.pipeline.get("deps").get(0), "resolver");
  }

  beforeEach(function () {
    b = new Browserify;
    sinon.spy(b, "on");
    original_resolver.cb_args = {};
    resolver_done = sinon.spy();
  });
  // beforeEach

  it("Works without opts", function () {
    assert.doesNotThrow(pathmodify.bind(null, b));
    assert(b.on.callCount === 1);
  });

  it("Doesn't leak internal data via opts", function () {
    var
      opts = {},
      num_opts = Object.keys(opts).length;

    pathmodify(b, opts);
    assert(
      Object.keys(opts).length === num_opts,
      "Opts has been mutated"
    );
  });

  it("Pushes aliaser stream", function () {
    var aliaser;

    pathmodify(b);

    aliaser = b.pipeline.get('deps').get(1);

    assert(
      aliaser,
      "Aliaser doesn't exist"
    );
    // Duck type as transform stream.
    assert(
      aliaser._transform,
      "Aliaser doesn't look like a transform stream"
    );
    assert(
      aliaser.label === "pathmodify:deps:post",
      "Aliaser doesn't have correct label"
    );
  });

  it("Re-initializes on reset", function () {
    var
      aliasers = [];

    pathmodify(b);

    aliasers.push(b.pipeline.get('deps').get(1));
    assert(
      aliasers[0],
      "Aliaser doesn't exist after construction"
    );

    b.reset();

    aliasers.push(b.pipeline.get('deps').get(1));
    assert(
      aliasers[1],
      "Aliaser doesn't exist after reset"
    );

    assert(
      aliasers[1] !== aliasers[0],
      "Aliaser is the same after reset"
    );
  });

  it("Resolves without modifier, without error", function () {
    pathmodify(b, opts);
    init_new_resolver();

    assert(
      original_resolver !== new_resolver,
      "Custom resolver() not implemented"
    );

    new_resolver("b", {}, resolver_done);

    assert(
      original_resolver.callCount === new_resolver.callCount,
      "Original resolver() not called correct number of times"
    );

    assert.deepStrictEqual(
      original_resolver.args[0].slice(0, 2),
      new_resolver.args[0].slice(0, 2),
      "Original resolver() not called with correct args"
    );
  });

  it("Emits pathmodify:resolved", function () {
    var
      parent = {filename: "parent"},
      require_id = "dep",
      pathmodify_resolved_handler = sinon.spy();

    pathmodify(b, opts);
    init_new_resolver();

    b.on("pathmodify:resolved", pathmodify_resolved_handler);

    new_resolver(require_id, parent, sinon.spy());

    assert(
      pathmodify_resolved_handler.callCount === 1,
      "Event not emitted"
    );

    assert.deepStrictEqual(
      pathmodify_resolved_handler.args[0],
      [{
        rec: {
          id: require_id,
          opts: parent,
          alias: {},
        },
        file: require_id,
      }],
      "Event not emitted with correct args"
    );
  });

  it("Resolves without modifier, with error", function () {
    var
      pathmodify_resolved_handler = sinon.spy();

    pathmodify(b, opts);
    init_new_resolver();

    b.on("pathmodify:resolved", pathmodify_resolved_handler);

    original_resolver.cb_args.err = new Error;

    new_resolver("dep-before", {}, resolver_done);

    assert(
      ! Object.keys(b._expose).length,
      "Nothing should be exposed, due to the error"
    );

    assert(
      ! pathmodify_resolved_handler.callCount,
      "pathmodify:resolved handler shouldn't have been invoked, due to the error"
    );
  });

  describe("Resolves without error", function () {
    var
      require_id,
      alias;

    beforeEach(function () {
      require_id = "dep-before",
      alias = {id: "dep-after"};
    });

    // Logic common to it()'s in this describe()
    function run_test (opts) {
      pathmodify(b, opts);
      init_new_resolver();

      new_resolver(require_id, {}, resolver_done);

      assert(
        original_resolver.args[0][0] === alias.id,
        "Require ID not aliased"
      );
    }
    // run_test

    it("`id` modifier", function () {
      var
        opts = {mods: [
          mod.id(require_id, alias.id),
        ]};

        run_test(opts);
    });
    // it

    it("`dir` modifier", function () {
      var
        segment_pattern = /^[^\/]+/,
        opts = {mods: [
        ]};

      require_id += "/";
      alias.id += "/";

      opts.mods.push(
        mod.dir(
          require_id.match(segment_pattern)[0],
          alias.id.match(segment_pattern)[0]
        )
      );

      run_test(opts);
    });
    // it

    it("`re` modifier", function () {
      var
        opts = {mods: [
          mod.re(new RegExp(require_id), alias.id),
        ]};

      run_test(opts);
    });
    // it

    it("function modifier", function () {
      var
        opts = {mods: [
          function (rec) {
            return alias;
          }
        ]};

      run_test(opts);
    });
    // it

    describe("With `to` function", function () {
      function to () {
        return alias;
      }

      it("`id` modifier", function () {
        var
          opts = {mods: [
            mod.id(require_id, to),
          ]};

        run_test(opts);
      });
      // it

      it("`dir` modifier", function () {
        var
          segment_pattern = /^[^\/]+/,
          opts = {mods: [
          ]};

        require_id += "/";
        alias.id += "/";

        opts.mods.push(
          mod.dir(
            require_id.match(segment_pattern)[0],
            alias.id.match(segment_pattern)[0]
          )
        );

        run_test(opts);
      });
      // it

      it("`re` modifier", function () {
        var
          opts = {mods: [
            mod.re(new RegExp(require_id), to),
          ]};

        run_test(opts);
      });
      // it
    });
    // describe
  });
  // describe

  it("Has modifiers but resolves none", function () {
    var
      require_id = "dep-before",
      alias = {id: "dep-after"},
      opts = {mods: [
        mod.id("non-existent-dep", function () {
          return alias;
        }),
      ]};

    pathmodify(b, opts);
    init_new_resolver();

    new_resolver(require_id, {}, resolver_done);

    assert(
      original_resolver.args[0][0] === require_id,
      "Require ID aliased"
    );
  });

  describe("Resolves and exposes", function () {
    var
      require_id = "dep-before",
      alias = {id: "dep-after"},
      aliaser,
      aliaser_dest;

    beforeEach(function () {
      aliaser_dest = new rs.Transform({objectMode: true});
    });
    // beforeEach

    // Logic common to it()'s in this describe().
    function run_test (opts, done) {
      pathmodify(b, opts);
      init_new_resolver();

      new_resolver(require_id, {}, resolver_done);

      assert(
        original_resolver.args[0][0] === alias.id,
        "Require ID not aliased"
      );

      assert(
        b._expose[alias.expose] === alias.id,
        "Module not exposed"
      );

      aliaser_dest._transform = function (rec, enc, cb) {
        assert(
          rec.id === alias.expose,
          "ID not updated by aliaser stream"
        );
        cb();
        done();
      };

      aliaser = b.pipeline.get('deps').get(1);

      aliaser.pipe(aliaser_dest);
      aliaser.end({
        file: alias.id,
      });
    }
    // run_test

    it("Resolves `id` modifier & exposes via explicit id", function (done) {
      var
        opts = {mods: [
        ]};

      alias.expose = "dep-expose";

      opts.mods.push(
        mod.id(require_id, alias.id, alias.expose)
      );

      run_test(opts, done);
    });
    // it

    it("Resolves `id` modifier & exposes via flag", function (done) {
      var
        opts = {mods: [
          mod.id(require_id, alias.id, true),
        ]};

      alias.expose = require_id;
      run_test(opts, done);
    });
    // it

    it("Resolves `id` modifier & exposes via expose function", function (done) {
      var
        opts = {mods: [
        ]};

      alias.expose = require_id;

      opts.mods.push(mod.id(require_id, alias.id, function () {
        return alias.expose;
      }));

      run_test(opts, done);
    });
    // it
  });
  // describe

  // For increased coverage
  it("Resolves `id` modifier & doesn't expose", function (done) {
    var
      require_id = "dep-before",
      alias = {id: "dep-after"},
      opts = {mods: [
        mod.id(require_id, alias.id),
      ]},
      aliaser,
      aliaser_dest = new rs.PassThrough({objectMode: true});

    pathmodify(b, opts);
    init_new_resolver();

    original_resolver.cb_args.res = alias.id;

    new_resolver(require_id, {}, resolver_done);

    aliaser = b.pipeline.get('deps').get(1);

    aliaser.pipe(aliaser_dest).on("finish", done);
    aliaser.end({
      file: alias.id,
    });
  });

  it("Resolves `id` modifier from cache", function () {
    var
      i,
      require_id = "dep-before",
      alias = {id: "dep-after"},
      opts = {mods: [
        sinon.spy(function (rec) {
          if (rec.id === require_id) return alias;
        }),
      ]};

    pathmodify(b, opts);
    init_new_resolver();

    for (i = 1; i <= 2; ++i) {
      new_resolver(require_id, {}, resolver_done);
    }

    assert(
      opts.mods[0].callCount === 1,
      "ID was resolved via modifiers again"
    );
  });
});
// describe
