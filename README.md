This is a [browserify](https://github.com/substack/node-browserify) plugin that's meant to do the same kind of thing as [aliasify](https://github.com/benbria/aliasify) and [remapify](https://github.com/joeybaker/remapify), but in a more elegant, powerful way. This hasn't been tested extensively yet, so consider it experimental. But some of the other alternatives already in common use don't really even work, so....

# Installation & Quick Summary
`npm install pathmodify`

```js
var pathmodify = require('pathmodify');

// Make bundled code like:
// `require('app/something')`
// act like:
// `require('/somedir/src/something')`
browserify()
  .plugin(pathmodify, {mods: [
    pathmodify.mod.dir('app', '/somedir/src')
  ]})
```

# Purpose

Avoid having to use cumbersome relative paths (`../../../../../../..`) in your browserified application, and still be able to apply transforms programatically: `browserify().transform(something)`.

This plugin allows you to:

* Rewrite (AKA alias, map) `require()` IDs / paths to different values. For example, rewrite `require('app/model/something')` to an absolute path like `/somedir/model/something`. This can be used to alias entire directories or any specific module ID or path passed to `require()`, and the rewriting can be dependent on the path of the requiring file as well.

* And / or expose modules via the `require` function exported by the bundle, like `b.require("something", {expose: "whatever"})`.

Say you have a directory structure like...

    somedir/
    +-- src/
        +-- entry.js
        +-- model/
        ¦   +-- whatever.js
        +-- subdir/
            +-- subsubdir/
                +-- something.js

...and `entry.js` is the entry point to a dependency graph with a bunch of files not pictured. And say you don't want to store the application files you're going to browserify in `node_modules` or symlink them there because it will break programmatic application of transforms (`browserify().transform(whatever)`). (But, see below -- you can combine this tool with symlinking to get the best of both worlds.)

pathmodify allows you to `require()` files like `somedir/src/model/whatever.js` from anywhere in the dependency graph without using `./` or `../` relative paths, enabling a `something.js` like this for example:

```es6
require('app/model/whatever');
```

# Example usage

```javascript
var
  path = require('path'),
  pathmodify = require('pathmodify');

var opts = {
  // Feel free to think of `mods` as referring to either modifications or
  // module IDs that are being altered. It is an array of possible
  // modifications to apply to the values passed to `require()` calls in the
  // browserified code. `mods` will be iterated until an entry is
  // encountered that alters the `id` of the `require()` call being
  // processed.
  mods: [
    // `id` type (exact match)
    pathmodify.mod.id('jquery', '/somedir/jquery.js'),

    // `dir` type (directory prefix)
    pathmodify.mod.dir('app', '/somedir/src'),

    // `re` type (regular expression)
    pathmodify.mod.re(/(.*\.)abc$/, '$1.xyz'),

    // Function
    function (rec) {
      var alias = {};

      var prefix = 'app' + path.sep;
      if (rec.id.indexOf(prefix) === 0) {
        alias.id = path.join(
          __dirname, 'src', rec.id.substr(prefix.length)
        );
      }

      return alias;
    }
  ]
};

browserify('./src/entry')
  .plugin(pathmodify, opts)
```

When the mod is a function it will receive an object like this:

```JS
{
  // The string passed to `require()`
  id: '...',

  opts: {
    // Absolute path of the parent file (the one that called require())
    filename: '...'
  }
}
```

It should leave the passed object alone and return an object like this if the `id` should be aliased to something else:

```JAVAscript
{
  // The path / id that should be resolved (as if the `require()` call
  // contained this value).
  id: '...',

  // Optional name to expose the module as (like
  // b.require('x', {expose: 'whatever'}))
  expose: '...'
}
```

If you don't want to alias the `id` to something else, don't return anything.

# node_modules

As alluded to earlier, ordinarily you could store or symlink your application as something like `node_modules/app` and require its files from node like `require('app/something/whatever')`. But if you do that in browserify you lose the ability to apply transforms programatically, like:

```Js
browserify('./entry')
  .transform(some_transform)
```

With this plugin you can get the best of both worlds by symlinking your application under `node_modules` and get the normal resolution behavior in node, and use the same paths in browserify by rewriting them to absolute paths (outside of `node_modules`) or paths relative to the requiring file. So if you have say `/somedir/src` synlinked as `node_modules/app`, you can use pathmodify like this:

```jS
// Point browserify to `./src/...`, not `app/...`
browserify('./src/entry')
  .plugin(pathmodify, {mods: [
    pathmodify.mod.dir('app', path.join(__dirname, 'src'))
  ]})
```
