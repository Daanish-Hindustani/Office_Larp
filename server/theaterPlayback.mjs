export const demoFilm = {
  id: "adialante-demo",
  kind: "url",
  title: "Adialante — Launch demo",
  url: "/media/adialante-demo.mp4",
  duration: 92.88,
};

export function playbackPosition(state, now = Date.now()) {
  const position = state.position +
    (state.playing ? Math.max(0, now - state.updatedAt) / 1000 : 0);
  const duration = state.source.duration;
  if (!Number.isFinite(duration) || duration <= 0) return position;
  return state.source.url === demoFilm.url
    ? position % duration
    : Math.min(duration, position);
}

export function initialTheaterState() {
  return {
    source: { ...demoFilm },
    queue: [],
    playing: true,
    position: 0,
    updatedAt: Date.now(),
    revision: 0,
    author: "",
  };
}
