/** Day identity is shared by tabs, list rows, markers and sequence lines. */
const colors = ['#2563eb', '#0f766e', '#b45309', '#7c3aed', '#be123c', '#0369a1'];
export const dayColor = (day: number) => colors[day % colors.length];
