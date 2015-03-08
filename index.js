var
  path = require('path'),
  rs = require('readable-stream'),
  // Map resolved pathnames to expose IDs.
  mappings = {},
  plugin = pathmodify;

module.exports = plugin;

/**
 * Main plugin.
 */
function pathmodify (b, opts) {
  var
    deps = b.pipeline.get('deps'),
    // TODO `0` needs to be changed to a label.
    pack = b.pipeline.get('pack').get(0);

  opts = opts || {};

  // TODO Should probably make sure this ends up directly after module-deps.
  deps.push(aliaser());
  // TODO `0` needs to be changed to a label.
  deps = deps.get(0);

  opts.bify = b;

  opts.deps = deps;
  opts.resolver = deps.resolver;

  opts.expose = function expose (key, val) {
    b._expose[key] = val;

    pack.hasExports = true;
  };
  // expose

  deps.resolver = make_resolver(opts);
}
// pathmodify

/**
 * Make a custom resolve function to override module-deps resolver.
 */
function make_resolver (opts) {
  var
    resolver = opts.resolver,
    walk = opts.deps.walk.bind(opts.deps),
    expose = opts.expose,
    modifiers = Array.isArray(opts.mods) ? opts.mods : [],
    visited = {},
    bify = opts.bify;

  return alias_resolver;

  /**
   * Custom resolve function. Same signature as node-resolve and
   * node-browser-resolve.
   */
  function alias_resolver (id, opts, cb) {
    var
      rec = {id: id, opts: {filename: opts.filename}},
      // Record of already processed require() ID's, keyed on parent filename.
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
    // above). Currently unused.

    // Aliased, exposed, and not previously visited.
    if (
      false &&
      ! processed &&
      rec.alias.expose
    ) {
      return walk({
        id: rec.alias.expose || rec.id,
        file: rec.id,
      }, opts, cb);
    }

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
    if (modifier.expose === true) {
      alias.expose = rec.id;
    }
    else if (typeof modifier.expose === 'string') {
      alias.expose = modifier.expose;
    }
    else if (typeof modifier.expose === 'function') {
      alias.expose = modifier.expose(rec, alias);
    }

    return alias;
  }
  // set_expose

  /**
   * Process a modification that's a function or where the replacement is a
   * function.
   */
  function alias_with_func (f, rec) {
    var ret = {};
    ret.alias = f(rec);
    ret.matched = ret.alias.id !== rec.id;
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
      alias = {},
      temp = {};

    modifiers.every(function (modifier) {
      matched = true;

      if (
        (
          modifier.type === 'd' &&
          rec.id.indexOf(modifier.from + path.sep) === 0
        )

        ||

        (modifier.type === 'f' && rec.id === modifier.from)
      ) {
        if (typeof modifier.to === 'function') {
          temp = alias_with_func(modifier.to, rec);
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
        modifier.type === 're' && (matched = modifier.from.test(rec.id))
      ) {
        alias.id = rec.id.replace(modifier.from, modifier.to);
      }

      else matched = false;

      if (matched) set_expose(rec, alias, modifier);

      return ! matched;
    });

    rec.id = id;
    rec.alias = alias;
    if (! (rec.alias && rec.alias.id)) rec.alias = {};

    return rec;
  }
  // modify
}
// make_resolver

/**
 * Following module-deps, update record id's to reflect exposure configuration.
 */
function aliaser () {
  var stream = new rs.Transform({objectMode: true});

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
  ['f', ['id', 'file']],
  ['d', ['dir']],
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
