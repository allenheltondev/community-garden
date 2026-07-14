// Shared value types for the garden designer surfaces. Kept in a
// dependency-free module so both the isometric masterplan editor and the
// designer hook can import them without pulling in any component code.

// The masterplan is the single editing surface. Most interactions are
// modeless direct manipulation (drag to move, handles to resize/rotate);
// the one true mode is per-vertex reshaping of a custom-shape bed.
export type DesignerMode = 'idle' | 'editing-vertices';

// Grid snap for drag/resize, in inches. 'off' means free placement.
export type GridSnap = 'off' | '6' | '12';
