/**
 * Every dialog (`.modal__box`) can be moved by its title: drag the heading and the window follows, always staying fully on screen.
 * One observer on the page does it for all dialogs, so none of them needs code of its own.
 */
export function enableMovableDialogs(): void {
  const attach = (box: HTMLElement): void => {
    const handle = box.querySelector<HTMLElement>('h2');
    if (!handle || handle.dataset.movable) return;
    handle.dataset.movable = '1';
    handle.title = 'Zum Verschieben ziehen';
    let drag: { x: number; y: number; dx: number; dy: number; rect: DOMRect } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, dx: Number(box.dataset.dx ?? 0), dy: Number(box.dataset.dy ?? 0), rect: box.getBoundingClientRect() };
      handle.setPointerCapture(e.pointerId);
      box.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { rect } = drag;
      // Stay inside the window: the box must not leave any edge.
      const moveX = Math.min(Math.max(e.clientX - drag.x, -rect.left), window.innerWidth - rect.right);
      const moveY = Math.min(Math.max(e.clientY - drag.y, -rect.top), window.innerHeight - rect.bottom);
      box.dataset.dx = String(drag.dx + moveX);
      box.dataset.dy = String(drag.dy + moveY);
      box.style.transform = `translate(${drag.dx + moveX}px, ${drag.dy + moveY}px)`;
    });
    const stop = () => {
      drag = null;
      box.classList.remove('is-dragging');
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  };
  const scan = (node: Node): void => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches('.modal__box')) attach(node);
    node.querySelectorAll<HTMLElement>('.modal__box').forEach(attach);
  };
  new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach(scan))).observe(document.body, { childList: true });
}
