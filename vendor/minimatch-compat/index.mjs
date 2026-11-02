import matcher from "./index.cjs";

export default matcher;
export const minimatch = matcher;
export const {
  Minimatch,
  GLOBSTAR,
  sep,
  filter,
  defaults,
  makeRe,
  braceExpand,
  match,
  escape,
  unescape,
} = matcher;
