var
  rs = require('readable-stream'),
  plugin,
  slash = {fwd: '/', back: '\\'},
  util = require('util');

module.exports = plugin = pathmodify;

/**
 * Main plugin.
 */
function pathmodify (b, opts) {
  // Temporarily allow people to continue using this by calling it as a factory
  // function, even though they should be mindful of semver.
  if (! arguments.length) {
    return util.deprecate(
      pathmodify,
      "Deprecated: pathmodify: Don't call the export as a factory. The export is now the plugin function."
    );
  }
  opts = opts || {};

  opts = {mods: [].concat(opts.mods || [])};

  // Map resolved pathnames to expose IDs.
  opts.mappings = {};

  // Record of already processed require() ID's, keyed on parent filename.
  opts.visited = {};

  opts.bify = b;

  opts.expose = function expose (key, val) {
    b._expose[key] = val;
    opts.pack.hasExports = true;
  };
  // expose

  opts.custom_resolver = make_resolver(opts);

  b.on('reset', function () {
    init(opts);
  });
  init(opts);
}
// pathmodify

/**
 * Common logic between initial setup and bundle reset.
 */
function init (opts) {
  var
    b = opts.bify,
    deps = b.pipeline.get('deps');

  // TODO `0` needs to be changed to a label.
  opts.pack = b.pipeline.get('pack').get(0);

  // TODO Should probably make sure this ends up directly after module-deps.
  deps.push(aliaser({mappings: opts.mappings}));

  // TODO `0` needs to be changed to a label.
  deps = deps.get(0);
  opts.deps = deps;

  opts.resolver = deps.resolver;
  deps.resolver = opts.custom_resolver;
}
// init

/**
 * Make a custom resolve function to override module-deps resolver.
 */
function make_resolver (opts) {
  var
    expose = opts.expose,
    modifiers = Array.isArray(opts.mods) ? opts.mods : [],
    mappings = opts.mappings,
    visited = opts.visited,
    bify = opts.bify;

  // These change at reset: resolve
  function current (prop) {
    return opts[prop];
  }
  // current

  return alias_resolver;

  /**
   * Custom resolve function. Same signature as node-resolve and
   * node-browser-resolve.
   */
  function alias_resolver (id, opts, cb) {
    var
      rec = {id: id, opts: {filename: opts.filename}},
      resolver = current('resolver'),
      mappings = current('mappings'),
      visited = current('visited'),
      par_vis = visited[opts.filename] || {},
      // boolean Whether the id has already been processed.
      processed;

    visited[opts.filename] = par_vis;

    // Retrieve any existing record for this id for this parent.
    processed = par_vis[rec.id];

    // Process modifiers for this module if it hasn't previously been processed.
    rec = processed || modify(rec);

    processed = !! processed;

    // Assign processed record to the records for its parent.
    if (! processed) par_vis[rec.id] = rec;

    // Calling walk() is the alternative to pushing the pipeline step (as
    // above). Currently unused. Would look like this:

    /*
      // Aliased, exposed, and not previously visited.
      if (
        ! processed &&
        rec.alias.expose
      ) {
        return opts.deps.walk({
          id: rec.alias.expose || rec.id,
          file: rec.id,
        }, opts, cb);
      }
    */

    // Delegate to original resolver.
    return resolver(rec.alias.id || rec.id, opts, function (err, res, pkg) {
      if (! err) {
        if (rec.alias.expose) {
          mappings[res] = rec.alias.expose;
          expose(rec.alias.expose, res);
        }
        bify.emit('pathmodify:resolved', {
          rec: rec,
          file: res,
        });
      }
      cb(err, res, pkg);
    });
  }
  // alias_resolver

  /**
   * Process exposure configuration.
   */
  function set_expose (rec, alias, modifier) {
    if (typeof modifier.expose === 'string') {
      alias.expose = modifier.expose;
    }
    else if (typeof modifier.expose === 'function') {
      alias.expose = modifier.expose(rec, alias);
    }

    if (modifier.expose === true || alias.expose === true) {
      alias.expose = rec.id;
    }

    return alias;
  }
  // set_expose

  /**
   * Process a modification that's a function or where the replacement is a
   * function.
   */
  function alias_with_func (mod, rec, opts) {
    var ret = {}, opts = opts || {};
    ret.alias = (typeof mod === 'function' ? mod : mod.to).call(mod, rec, opts);
    ret.matched = !! (ret.alias && ret.alias.id !== rec.id);
    return ret;
  }
  // alias_with_func

  /**
   * Apply modifiers configured by the user.
   */
  function modify (rec) {
    var
      // Switch for terminating looping over the modifiers once a match is
      // found.
      matched,
      // Restore this in the end in case the user modifies it.
      id = rec.id,
      alias,
      temp = {},
      path_sep;

    // Heuristically detect path separator.
    [slash.fwd, slash.back, slash.fwd].every(function (sep) {
      path_sep = sep;
      return rec.id.indexOf(path_sep) === -1;
    });

    modifiers.every(function (modifier) {
      matched = true;

      // Reset so modifiers can't munge data for later ones.
      rec.id = id;
      alias = {};

      if (
        (
          modifier.type === 'dir' &&
          rec.id.indexOf(modifier.from + path_sep) === 0
        )

        ||

        (modifier.type === 'id' && rec.id === modifier.from)
      ) {
        if (typeof modifier.to === 'function') {
          temp = alias_with_func(modifier, rec);
          alias = temp.alias;
          matched = temp.matched;
        }
        else {
          alias.id = modifier.to + rec.id.substr(modifier.from.length);
        }
      }

      else if (typeof modifier === 'function') {
        temp = alias_with_func(modifier, rec);
        alias = temp.alias;
        matched = temp.matched;
      }

      else if (
        modifier.type === 're' &&
        (matched = modifier.from[
          typeof modifier.to === 'function' ? 'exec' : 'test'
        ](rec.id))
      ) {
        if (typeof modifier.to === 'function') {
          temp = alias_with_func(modifier, rec, {matches: matched});
          alias = temp.alias;
          matched = temp.matched;
        }
        else {
          alias.id = rec.id.replace(modifier.from, modifier.to);
        }
      }

      else matched = false;

      if (matched) set_expose(rec, alias, modifier);

      return ! matched;
    });

    rec.id = id;
    if (! (alias && alias.id)) alias = {};
    rec.alias = alias;

    return rec;
  }
  // modify
}
// make_resolver

/**
 * Following module-deps, update record id's to reflect exposure configuration.
 */
function aliaser (opts) {
  opts = opts || {};
  var
    stream = new rs.Transform({objectMode: true}),
    mappings = opts.mappings;

  stream._transform = write;

  function write (rec, enc, cb) {
    // User exposed this file under an alternate id.
    if (mappings[rec.file]) {
      rec.id = mappings[rec.file];
    }

    this.push(rec);
    cb();
  }
  // write

  stream.label = "pathmodify:deps:post";

  return stream;
}
// aliaser

function simple (from, to, expose, type) {
  return {from: from, to: to, expose: expose, type: type};
}
// simple

// Functions for generating entries in opts.mods.
plugin.mod = {};

[
  ['id'],
  ['dir'],
  ['re'],
].forEach(function (type_def) {
  var
    type = type_def[0],
    aliases = type_def[1];

  plugin.mod[type] = function (from, to, expose) {
    return simple(from, to, expose, type);
  };

  if (Array.isArray(aliases)) {
    aliases.forEach(function (alias) {
      plugin.mod[alias] = plugin.mod[type];
    });
  }
});
