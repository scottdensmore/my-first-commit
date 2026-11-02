"use strict";

// CommonJS is intentional: legacy plugins need a synchronous callable export.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const upstream = require("upstream-minimatch");
const wrappers = new WeakMap();

function legacy(matcher) {
  if (wrappers.has(matcher)) return wrappers.get(matcher);
  const callable = (...args) => matcher(...args);
  wrappers.set(matcher, callable);
  Object.assign(callable, upstream, matcher);
  callable.minimatch = callable;
  callable.makeRe = (pattern, options) => new matcher.Minimatch(pattern, options).makeRe();
  callable.defaults = (options) => legacy(matcher.defaults(options));
  return callable;
}

module.exports = legacy(upstream.minimatch);
