/*
Calling the export as a factory function is deprecated. The tests initiated here
are to ensure that it continues to work until it's removed.
*/

var
  pathmodify = require("../../"),
  proxyquire = require("proxyquire");

// It's not entirely clear how proxyquire is intended to behave here re:
// caching. At present this bypasses the cache with no additional action
// required and I'm relying on that. Running the tests both ways works as long
// as mocha process test.js before this file.
// See:
// https://github.com/thlorenz/proxyquire/issues/91
proxyquire("./test", {
  // Deprecated signature.
  "../../": pathmodify()
});
