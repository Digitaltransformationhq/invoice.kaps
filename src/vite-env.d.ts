/// <reference types="vite/client" />

// Minimal shim for `react-dom`'s `createPortal`. The full @types/react-dom
// package isn't installed in this project, but createPortal works at runtime —
// this just keeps the TS checker quiet.
declare module 'react-dom' {
  import type { ReactNode } from 'react';
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactNode;
}
