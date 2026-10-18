'use client';
import { useSyncExternalStore } from 'react';
const subscribe = () => () => {};
/** Keep mutation controls disabled until React has attached event handlers. */
export function useHydrated() { return useSyncExternalStore(subscribe, () => true, () => false); }
