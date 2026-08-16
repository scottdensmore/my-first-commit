import { describe, expect, it } from "vitest";
import {
  deployedCommitMatches,
  describeCommitMismatch,
  isSupersededDeployment,
  selectActiveDeployment,
} from "./production-release.mjs";

const DEPLOYED_SHA = "c53813f9a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("deployedCommitMatches", () => {
  it("accepts the abbreviated commit the health payload actually reports", () => {
    // `/api/health` slices to seven characters, so equality against a 40-character deployment SHA
    // would reject every run rather than the wrong ones. This is the whole reason for the function.
    expect(deployedCommitMatches("c53813f", DEPLOYED_SHA)).toBe(true);
  });

  it("accepts a full-length commit as well, in case the payload stops abbreviating", () => {
    expect(deployedCommitMatches(DEPLOYED_SHA, DEPLOYED_SHA)).toBe(true);
  });

  it("rejects a different deployment", () => {
    expect(deployedCommitMatches("e27e8c8", DEPLOYED_SHA)).toBe(false);
  });

  it("rejects `local`, which identifies no deployment", () => {
    // What the route reports when VERCEL_GIT_COMMIT_SHA is unset. A run against it proves nothing.
    expect(deployedCommitMatches("local", DEPLOYED_SHA)).toBe(false);
  });

  it("rejects a prefix too short to mean anything", () => {
    // `c` prefixes a sixteenth of all commits. Accepting it would make the check decorative.
    expect(deployedCommitMatches("c", DEPLOYED_SHA)).toBe(false);
    expect(deployedCommitMatches("c53813", DEPLOYED_SHA)).toBe(false);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(deployedCommitMatches(" C53813F ", DEPLOYED_SHA)).toBe(true);
  });

  it("rejects a missing or non-string payload value", () => {
    expect(deployedCommitMatches(undefined, DEPLOYED_SHA)).toBe(false);
    expect(deployedCommitMatches("", DEPLOYED_SHA)).toBe(false);
    expect(deployedCommitMatches("c53813f", undefined)).toBe(false);
  });

  it("rejects a reported commit longer than the one expected", () => {
    expect(deployedCommitMatches(`${DEPLOYED_SHA}00`, DEPLOYED_SHA)).toBe(false);
  });
});

describe("describeCommitMismatch", () => {
  it("names the unset build variable rather than blaming the alias", () => {
    expect(describeCommitMismatch("local", DEPLOYED_SHA)).toMatch(/VERCEL_GIT_COMMIT_SHA/);
  });

  it("reports both commits when the alias points somewhere else", () => {
    const message = describeCommitMismatch("e27e8c8", DEPLOYED_SHA);

    expect(message).toContain("e27e8c8");
    expect(message).toContain("c53813f");
  });

  it("says so when the payload carried no commit", () => {
    expect(describeCommitMismatch("", DEPLOYED_SHA)).toMatch(/no commit/i);
  });
});

describe("selectActiveDeployment", () => {
  it("returns the newest successful deployment", () => {
    const deployments = [
      { sha: "aaaaaaa", state: "success" },
      { sha: "bbbbbbb", state: "success" },
    ];

    expect(selectActiveDeployment(deployments)).toBe("aaaaaaa");
  });

  it("skips a deployment that is still in flight", () => {
    // The case the old guard got wrong: main has advanced, but the newer commit is not serving
    // traffic yet, so the one before it is still production and still deserves its release.
    const deployments = [
      { sha: "newerrr", state: "in_progress" },
      { sha: "olderrr", state: "success" },
    ];

    expect(selectActiveDeployment(deployments)).toBe("olderrr");
  });

  it("skips a failed deployment, which leaves the previous build live", () => {
    const deployments = [
      { sha: "brokennn", state: "failure" },
      { sha: "workingg", state: "success" },
    ];

    expect(selectActiveDeployment(deployments)).toBe("workingg");
  });

  it("returns null when nothing has succeeded, rather than guessing", () => {
    expect(selectActiveDeployment([{ sha: "aaaaaaa", state: "failure" }])).toBeNull();
    expect(selectActiveDeployment([])).toBeNull();
    expect(selectActiveDeployment(undefined)).toBeNull();
  });

  it("ignores an entry with no sha", () => {
    expect(selectActiveDeployment([{ state: "success" }, { sha: "good", state: "success" }])).toBe(
      "good",
    );
  });
});

describe("isSupersededDeployment", () => {
  it("treats the live commit as not superseded", () => {
    expect(isSupersededDeployment(DEPLOYED_SHA, DEPLOYED_SHA)).toBe(false);
  });

  it("treats an overtaken commit as superseded", () => {
    expect(isSupersededDeployment("newersha", DEPLOYED_SHA)).toBe(true);
  });

  it("does not call a commit superseded when no active deployment is known", () => {
    // Caller stops on a null active deployment. Reporting "superseded" here would silently skip
    // a release for the opposite reason -- nothing is live, rather than something newer is.
    expect(isSupersededDeployment(null, DEPLOYED_SHA)).toBe(false);
    expect(isSupersededDeployment("", DEPLOYED_SHA)).toBe(false);
  });

  it("ignores case", () => {
    expect(isSupersededDeployment(DEPLOYED_SHA.toUpperCase(), DEPLOYED_SHA)).toBe(false);
  });
});
