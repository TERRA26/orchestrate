import { KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/**
 * Sensors used by the sidebar's manual project drag-reorder.
 *
 * The PointerSensor preserves the existing mouse and touch UX
 * (drag begins after a 6 px movement so click does not race with
 * drag intent). The KeyboardSensor wires the dnd-kit/sortable
 * coordinate getter so a keyboard-only user can focus a project
 * row, press Space to pick it up, and use ArrowUp/ArrowDown to
 * reorder, Space/Enter to drop, Escape to cancel.
 *
 * Extracted from Sidebar.tsx so the contract can be pinned without
 * mounting the entire 4 000 line sidebar component.
 *
 * @see ORC-250
 */
export const useProjectDnDSensors = () => {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
};
