const paths = {
  visibility: "M3 11v2l12 5V6L3 11z M15 9h3a3 3 0 0 1 0 6h-3 M5 14l2 7h4l-2-5 M21 4l-2 2 M22 20l-3-2",
  chat: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z",
  orders: "M8 3h8v4H8z M8 5H5v16h14V5h-3 M8 12h8 M8 16h5",
  send: "m22 2-7 20-4-9-9-4 20-7z M22 2 11 13",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  image: "M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M8 7h.01",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2l1 4 M4 12l1 4a8 8 0 0 0 13 2",
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
