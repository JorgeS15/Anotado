// Must match the server's validation in server/src/notes.ts.
export const LIMITS = {
  title: 1_000,
  content: 200_000,
  items: 2_000,
  itemText: 10_000,
} as const;

const number = new Intl.NumberFormat('pt-PT');
export const formatCount = (n: number) => number.format(n);
