// Keep unchanged rows (and their focus, open details and decoded images) alive.
export function createListView(container) {
  const rows = new Map();
  let order = "";
  return (items, signature, create) => {
    const nextOrder = items.map((item) => item.id).join(",");
    const animate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const moved = order && nextOrder !== order;
    const before = moved && animate
      ? new Map([...rows].map(([id, row]) => [id, row.node.getBoundingClientRect().top])) : null;
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = focused ? [focused.dataset.id, focused.dataset.action] : null;
    const keep = new Set(items.map((item) => item.id));
    for (const [id, row] of rows) {
      if (!keep.has(id)) { row.node.remove(); rows.delete(id); }
    }
    items.forEach((item, index) => {
      const version = signature(item, index);
      let row = rows.get(item.id);
      const fresh = !row;
      if (!row || row.version !== version) {
        const node = create(item, index);
        if (row) {
          const details = row.node.querySelector("details");
          if (details?.open && node.querySelector("details")) node.querySelector("details").open = true;
          row.node.replaceWith(node);
        }
        row = { node, version };
        rows.set(item.id, row);
      }
      const at = container.children[index];
      if (at !== row.node) container.insertBefore(row.node, at || null);
      if (fresh && animate) row.node.animate(
        [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }],
        { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" });
    });
    if (before) for (const [id, row] of rows) {
      if (!before.has(id)) continue;
      const delta = before.get(id) - row.node.getBoundingClientRect().top;
      if (Math.abs(delta) > 1) row.node.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: "none" }],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    if (focusKey && !focused.isConnected) {
      const replacement = [...container.querySelectorAll("button")].find(
        (button) => button.dataset.id === focusKey[0] && button.dataset.action === focusKey[1]);
      replacement?.focus({ preventScroll: true });
    }
    order = nextOrder;
  };
}
