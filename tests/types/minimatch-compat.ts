import matcher, { defaults, makeRe, minimatch, Minimatch } from "@scottdensmore/minimatch-compat";

// Compiled by the existing application type/build gate; no runtime caller imports this fixture.
const results: boolean[] = [
  matcher("file.js", "*.js"),
  minimatch("file.js", "*.js"),
  new Minimatch("*.js").match("file.js"),
  defaults({ nocase: true })("FILE.JS", "*.js"),
  defaults({ nocase: true }).makeRe("*.js").test("FILE.JS"),
  makeRe("*.js").test("file.js"),
];
void results;
