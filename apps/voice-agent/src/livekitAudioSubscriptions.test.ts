import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { RoomEvent, TrackKind } from "@livekit/rtc-node";

import {
  installFutureAudioPublicationSubscription,
  subscribeAudioPublication,
  subscribeExistingAudioPublications,
} from "./livekitAudioSubscriptions.js";

function makePublication(input?: { readonly kind?: TrackKind; readonly subscribed?: boolean }) {
  return {
    kind: input?.kind ?? TrackKind.KIND_AUDIO,
    subscribed: input?.subscribed ?? false,
    setSubscribed: vi.fn(function setSubscribed(this: { subscribed: boolean }, value: boolean) {
      this.subscribed = value;
    }),
  } as any;
}

function makeParticipant(publications: readonly any[] = []) {
  return {
    identity: "orchestrate-user",
    trackPublications: new Map(
      publications.map((publication, index) => [`pub-${index}`, publication]),
    ),
  } as any;
}

describe("LiveKit audio publication subscription helpers", () => {
  it("subscribes audio publications and reports the subscription", () => {
    const publication = makePublication();
    const participant = makeParticipant();
    const onSubscribed = vi.fn();

    const subscribed = subscribeAudioPublication(publication, participant, "unit-test", {
      onSubscribed,
    });

    expect(subscribed).toBe(true);
    expect(publication.setSubscribed).toHaveBeenCalledWith(true);
    expect(onSubscribed).toHaveBeenCalledWith(publication, participant, "unit-test");
  });

  it("ignores non-audio publications", () => {
    const publication = makePublication({ kind: TrackKind.KIND_VIDEO });
    const participant = makeParticipant();

    const subscribed = subscribeAudioPublication(publication, participant, "unit-test");

    expect(subscribed).toBe(false);
    expect(publication.setSubscribed).not.toHaveBeenCalled();
  });

  it("subscribes existing remote audio publications", () => {
    const audio = makePublication();
    const video = makePublication({ kind: TrackKind.KIND_VIDEO });
    const room = {
      remoteParticipants: new Map([["participant", makeParticipant([audio, video])]]),
    } as any;

    expect(subscribeExistingAudioPublications(room)).toBe(1);
    expect(audio.setSubscribed).toHaveBeenCalledWith(true);
    expect(video.setSubscribed).not.toHaveBeenCalled();
  });

  it("subscribes future audio publications from TrackPublished events", () => {
    const emitter = new EventEmitter();
    const room = {
      on: emitter.on.bind(emitter),
      off: emitter.off.bind(emitter),
    } as any;
    const publication = makePublication();
    const participant = makeParticipant();
    const dispose = installFutureAudioPublicationSubscription(room);

    emitter.emit(RoomEvent.TrackPublished, publication, participant);
    expect(publication.setSubscribed).toHaveBeenCalledWith(true);

    dispose();
    const secondPublication = makePublication();
    emitter.emit(RoomEvent.TrackPublished, secondPublication, participant);
    expect(secondPublication.setSubscribed).not.toHaveBeenCalled();
  });
});
