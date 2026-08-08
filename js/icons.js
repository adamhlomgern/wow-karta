// Enhetliga, tunna SVG-ikoner (ersätter emoji-pilar/kryss/etc för ett renare, mer konsekvent utseende).
// Använder currentColor så de ärver textfärgen från sin knapp/länk.
function svg(paths, size = 15, strokeWidth = 2) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0">${paths}</svg>`;
}

export const iconArrowLeft = svg('<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>');
export const iconClose = svg('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 14, 2);
export const iconEdit = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 14);
export const iconPlus = svg('<path d="M12 5v14"/><path d="M5 12h14"/>', 15, 2.3);
export const iconTrash = svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>', 13);
export const iconDownload = svg('<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 21H3"/>', 13);
export const iconUpload = svg('<path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M21 21H3"/>', 13);
export const iconCheck = svg('<path d="M20 6 9 17l-5-5"/>', 13, 2.3);
export const iconPin = svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>', 12);
