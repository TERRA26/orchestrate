// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { KeyboardSensor, PointerSensor } from "@dnd-kit/core";

import { useProjectDnDSensors } from "./useProjectDnDSensors";

/**
 * Pins the keyboard accessibility contract for project drag-reorder
 * introduced by ORC-250. Without a KeyboardSensor in the sensors
 * array, dnd-kit's DndContext only responds to pointer input, which
 * makes manual project ordering unreachable for keyboard-only users.
 *
 * @see ORC-250
 */
describe("useProjectDnDSensors (ORC-250)", () => {
  it("returns at least two sensor descriptors", () => {
    const { result } = renderHook(() => useProjectDnDSensors());
    expect(result.current.length).toBeGreaterThanOrEqual(2);
  });

  it("includes a PointerSensor descriptor (preserved from prior behavior)", () => {
    const { result } = renderHook(() => useProjectDnDSensors());
    const pointer = result.current.find((d) => d.sensor === PointerSensor);
    expect(pointer).toBeDefined();
  });

  it("includes a KeyboardSensor descriptor for keyboard-only users", () => {
    const { result } = renderHook(() => useProjectDnDSensors());
    const keyboard = result.current.find((d) => d.sensor === KeyboardSensor);
    expect(keyboard).toBeDefined();
  });

  it("KeyboardSensor wires sortableKeyboardCoordinates", () => {
    const { result } = renderHook(() => useProjectDnDSensors());
    const keyboard = result.current.find((d) => d.sensor === KeyboardSensor);
    expect(keyboard).toBeDefined();
    // sortable's coordinates getter is the documented binding: it
    // computes the next focused item position from the current
    // keyboard event so Arrow keys move the active draggable. The
    // descriptor's options type is sensor-specific so we narrow via
    // a record cast for the assertion.
    const options = keyboard?.options as Record<string, unknown> | undefined;
    expect(typeof options?.coordinateGetter).toBe("function");
  });
});
