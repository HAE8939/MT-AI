export type MaskHistory<T> = { entries: T[]; index: number };

export function createMaskHistory<T>(initial: T): MaskHistory<T> {
    return { entries: [initial], index: 0 };
}

export function currentMaskSnapshot<T>(state: MaskHistory<T>): T {
    return state.entries[state.index];
}

export function recordMaskSnapshot<T>(state: MaskHistory<T>, value: T): MaskHistory<T> {
    return { entries: [...state.entries.slice(0, state.index + 1), value], index: state.index + 1 };
}

export function undoMaskSnapshot<T>(state: MaskHistory<T>): MaskHistory<T> {
    return { ...state, index: Math.max(0, state.index - 1) };
}

export function redoMaskSnapshot<T>(state: MaskHistory<T>): MaskHistory<T> {
    return { ...state, index: Math.min(state.entries.length - 1, state.index + 1) };
}

export const canUndoMaskSnapshot = <T>(state: MaskHistory<T>) => state.index > 0;
export const canRedoMaskSnapshot = <T>(state: MaskHistory<T>) => state.index < state.entries.length - 1;
