type DiagElement = HTMLElement | null;

function logElement(label: string, target: DiagElement, extra?: Record<string, unknown>) {
  if (!target) return;
  const cs = window.getComputedStyle(target);
  console.debug(label, {
    tag: target.tagName,
    className: target.className,
    id: target.id,
    text: target.innerText?.slice?.(0, 80),
    pointerEvents: cs.pointerEvents,
    zIndex: cs.zIndex,
    position: cs.position,
    ...extra,
  });
}

/** DEV-only global click / elementFromPoint diagnostics for overlay hit-testing. */
export function mountClickInteractionDiag(): () => void {
  if (!import.meta.env.DEV) return () => {};

  let lastFromPointLog = 0;
  const FROM_POINT_THROTTLE_MS = 250;

  const onClick = (e: MouseEvent) => {
    logElement("[CLICK_TARGET_DIAG]", e.target as DiagElement);
  };

  const onPointerMove = (e: PointerEvent) => {
    const now = Date.now();
    if (now - lastFromPointLog < FROM_POINT_THROTTLE_MS) return;
    lastFromPointLog = now;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    logElement("[ELEMENT_FROM_POINT_DIAG]", el as DiagElement, {
      clientX: e.clientX,
      clientY: e.clientY,
    });
  };

  document.addEventListener("click", onClick, true);
  document.addEventListener("pointermove", onPointerMove, true);

  return () => {
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("pointermove", onPointerMove, true);
  };
}
