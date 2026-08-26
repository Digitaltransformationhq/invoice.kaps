/**
 * Toast placement inside the iPhone safe area.
 *
 * Sonner positions its viewport with fixed offsets — 16px on mobile — measured
 * from the edge of the layout viewport. Because `index.html` opts into
 * `viewport-fit=cover`, that edge is the physical top of the screen, so a
 * `top-right` toast on a notched iPhone lands partly under the Dynamic Island:
 * unreadable, and its dismiss control unreachable.
 *
 * Adding `env(safe-area-inset-*)` to each edge pushes the toast stack into the
 * usable area. The insets are 0px on every device without a cutout, so this
 * resolves to sonner's own 16px default everywhere else.
 *
 * Shared so the three <Toaster> mounts (app shell, dashboard, landing page)
 * can't drift apart.
 */
export const TOAST_MOBILE_OFFSET = {
  top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
  right: 'calc(env(safe-area-inset-right, 0px) + 16px)',
  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
  left: 'calc(env(safe-area-inset-left, 0px) + 16px)',
} as const;
