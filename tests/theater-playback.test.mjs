import { test } from "node:test";
import assert from "node:assert/strict";
import { demoFilm, initialTheaterState, playbackPosition } from "../server/theaterPlayback.mjs";

test("the theater starts playing the demo and wraps its shared timeline across loops", () => {
  const state = initialTheaterState();
  assert.equal(state.playing, true);
  assert.equal(state.source.url, demoFilm.url);
  state.updatedAt = 1000;
  assert.ok(Math.abs(playbackPosition(state, 1000 + (demoFilm.duration * 3 + 5) * 1000) - 5) < 0.001);
  state.playing = false;
  state.position = 20;
  assert.equal(playbackPosition(state, 999999), 20);
});
