This is a [browserify](https://github.com/substack/node-browserify) plugin that's meant to do the same kind of thing as [aliasify](https://github.com/benbria/aliasify) and [remapify](https://github.com/joeybaker/remapify), but in a more elegant, powerful way. It's in its infancy and rough. For the time being don't even expect the repo name not to change. Right now it's an experiment / proof of concept, not for production, but feel free to try it in a non-critical application. If it seems like people are interested I may explore it further.

# Purpose

Say you have a directory structure like...

    example
    +-- src/
        +-- entry.js
        +-- model/
        ¦   +-- whatever.js
        +-- subdir/
            +-- subsubdir/
                +-- something.js

`something.js`

    require('app/model/whatever');

...and `entry.js` is the entry point to a dependency graph with a bunch of files not pictured and you want to be able to `require()` `somedir/src/model/whatever.js` or `somedir/src/...` from anywhere in the dependency graph without using `./` / `../` relative paths. You also don't want to store the files or symlink to them under `node_modules` because it will break programmatic application of transforms.

# Example usage
    var pathmodify = require('pathmodify');

    var opts = {
      mods: [
        function (rec) {
          var alias = {};

          if (rec.id.indexOf('app/') === 0) {
            alias.id = __dirname + '/src/' + rec.id.substr('app/');
          }

          return alias;
        }
      ]
    };

    browserify('./src/entry')
      .plugin(pathmodify, opts)

The structure of the members of the `mods` array is a work in progress. But
suffice it to say that for the time being you can pass a function that will receive an object like this:

    {
      // The string passed to `require()`
      id: '...',

      opts: {
        // Absolute path of the parent file (the one that called require())
        filename: '...'
      }
    }

It should leave the passed object alone and return an object like this if the `id` should be aliased to something else:

    {
      // The path / id that should be resolved (e.g. argument to
      // node-browser-resolve)
      id: '...',

      // Optional name to expose the module as (like
      // b.require('x', {expose: 'whatever'}))
      expose: '...'
    }

If you don't want to alias the `id` to something else, return anything else (or nothing).
