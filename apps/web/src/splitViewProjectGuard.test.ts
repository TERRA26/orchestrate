import { describe, expect, it } from "vitest";
import { ProjectId, ThreadId } from "@orchestrate/contracts";

import {
  classifyCrossProjectNavigation,
  filterThreadsForProject,
} from "./splitViewProjectGuard";

const PROJECT_A = ProjectId.makeUnsafe("project-a");
const PROJECT_B = ProjectId.makeUnsafe("project-b");
const THREAD_A1 = ThreadId.makeUnsafe("thread-a-1");
const THREAD_B1 = ThreadId.makeUnsafe("thread-b-1");
const THREAD_UNKNOWN = ThreadId.makeUnsafe("thread-unknown");

const SAMPLE_THREADS = [
  { id: THREAD_A1, projectId: PROJECT_A },
  { id: THREAD_B1, projectId: PROJECT_B },
];

describe("classifyCrossProjectNavigation (ORC-005)", () => {
  it("ok=true when the target thread is in the pane's project", () => {
    expect(
      classifyCrossProjectNavigation({
        targetThreadId: THREAD_A1,
        paneOwnerProjectId: PROJECT_A,
        threads: SAMPLE_THREADS,
      }).ok,
    ).toBe(true);
  });

  it("ok=false when the target thread is in a different project (ORC-005 core case)", () => {
    const result = classifyCrossProjectNavigation({
      targetThreadId: THREAD_B1,
      paneOwnerProjectId: PROJECT_A,
      threads: SAMPLE_THREADS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("project-b");
      expect(result.reason).toContain("project-a");
    }
  });

  it("ok=true when the pane has no project anchor (no constraint)", () => {
    expect(
      classifyCrossProjectNavigation({
        targetThreadId: THREAD_B1,
        paneOwnerProjectId: null,
        threads: SAMPLE_THREADS,
      }).ok,
    ).toBe(true);
  });

  it("ok=true when the target thread is not in the loaded threads list (let other guards handle)", () => {
    expect(
      classifyCrossProjectNavigation({
        targetThreadId: THREAD_UNKNOWN,
        paneOwnerProjectId: PROJECT_A,
        threads: SAMPLE_THREADS,
      }).ok,
    ).toBe(true);
  });

  it("ok=true when paneOwnerProjectId is undefined", () => {
    expect(
      classifyCrossProjectNavigation({
        targetThreadId: THREAD_B1,
        paneOwnerProjectId: undefined,
        threads: SAMPLE_THREADS,
      }).ok,
    ).toBe(true);
  });
});

describe("filterThreadsForProject (ORC-005)", () => {
  it("returns only threads in the given project", () => {
    expect(filterThreadsForProject(SAMPLE_THREADS, PROJECT_A)).toEqual([
      { id: THREAD_A1, projectId: PROJECT_A },
    ]);
  });

  it("returns the original list when the project anchor is null", () => {
    expect(filterThreadsForProject(SAMPLE_THREADS, null)).toEqual(SAMPLE_THREADS);
  });

  it("returns the original list when the project anchor is undefined", () => {
    expect(filterThreadsForProject(SAMPLE_THREADS, undefined)).toEqual(SAMPLE_THREADS);
  });

  it("returns empty when no threads match the project", () => {
    const projectC = ProjectId.makeUnsafe("project-c");
    expect(filterThreadsForProject(SAMPLE_THREADS, projectC)).toEqual([]);
  });
});
