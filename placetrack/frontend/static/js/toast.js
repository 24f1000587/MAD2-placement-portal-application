const { reactive } = Vue;

export const toastStore = reactive({ items: [] });

let counter = 0;


export function pushToast(message, variant = 'success') {
  const id = ++counter;
  toastStore.items.push({ id, message, variant });
  setTimeout(() => {
    const idx = toastStore.items.findIndex((t) => t.id === id);
    if (idx !== -1) toastStore.items.splice(idx, 1);
  }, 4000);
}
