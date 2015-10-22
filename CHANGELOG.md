# Unreleased

## Changed
* This now exports the plugin function instead of a factory, better conforming to the browserify plugin API. So usage is changed from `b.plugin(require("pathmodify")())` to `b.plugin(require("pathmodify"))`.
# 0.4.0
Enable returning `true` from `expose()` to expose the module with its ID. For example: `pathmodify.mod.id('a', 'b', function () { return true; })` will expose the module as `a`.

Fix bug that broke the plugin on Windows. See #1.

# 0.3.0
Add support for reset / rebundling / watchify.

Add label to pipeline stream.
