import matcher from "./index.cjs";

export * from "upstream-minimatch";
export default matcher;
export const minimatch: typeof matcher;
export const defaults: typeof matcher.defaults;
export const makeRe: typeof matcher.makeRe;
