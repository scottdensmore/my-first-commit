import upstream = require("upstream-minimatch");

declare function matcher(
  path: string,
  pattern: string,
  options?: upstream.MinimatchOptions,
): boolean;

declare namespace matcher {
  const minimatch: typeof matcher;
  const Minimatch: typeof upstream.Minimatch;
  type Minimatch = upstream.Minimatch;
  type MinimatchOptions = upstream.MinimatchOptions;
  type IOptions = upstream.MinimatchOptions;
  type IMinimatch = upstream.Minimatch;
  const GLOBSTAR: typeof upstream.GLOBSTAR;
  const sep: typeof upstream.sep;
  const filter: typeof upstream.filter;
  const braceExpand: typeof upstream.braceExpand;
  const match: typeof upstream.match;
  const escape: typeof upstream.escape;
  const unescape: typeof upstream.unescape;
  function defaults(options?: upstream.MinimatchOptions): typeof matcher;
  function makeRe(pattern: string, options?: upstream.MinimatchOptions): RegExp | false;
}

export = matcher;
