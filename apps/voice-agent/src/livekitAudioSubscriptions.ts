import type { RemoteParticipant, RemoteTrackPublication, Room } from "@livekit/rtc-node";
import { RoomEvent, TrackKind } from "@livekit/rtc-node";

export interface AudioPublicationSubscriptionCallbacks {
  readonly onSubscribed?: (
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    reason: string,
  ) => void;
  readonly onAlreadySubscribed?: (
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    reason: string,
  ) => void;
  readonly onSubscribeFailed?: (
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
    reason: string,
    cause: unknown,
  ) => void;
}

function isAudioPublication(publication: RemoteTrackPublication): boolean {
  return publication.kind === TrackKind.KIND_AUDIO;
}

export function subscribeAudioPublication(
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
  reason: string,
  callbacks: AudioPublicationSubscriptionCallbacks = {},
): boolean {
  if (!isAudioPublication(publication)) {
    return false;
  }

  if (publication.subscribed) {
    callbacks.onAlreadySubscribed?.(publication, participant, reason);
    return false;
  }

  try {
    publication.setSubscribed(true);
    callbacks.onSubscribed?.(publication, participant, reason);
    return true;
  } catch (cause) {
    callbacks.onSubscribeFailed?.(publication, participant, reason, cause);
    return false;
  }
}

export function subscribeExistingAudioPublications(
  room: Room,
  callbacks: AudioPublicationSubscriptionCallbacks = {},
): number {
  let subscribedCount = 0;
  for (const participant of room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) {
      if (subscribeAudioPublication(publication, participant, "existing-publication", callbacks)) {
        subscribedCount += 1;
      }
    }
  }
  return subscribedCount;
}

export function installFutureAudioPublicationSubscription(
  room: Room,
  callbacks: AudioPublicationSubscriptionCallbacks = {},
): () => void {
  const onTrackPublished = (
    publication: RemoteTrackPublication,
    participant: RemoteParticipant,
  ) => {
    subscribeAudioPublication(publication, participant, "track-published", callbacks);
  };

  room.on(RoomEvent.TrackPublished, onTrackPublished);
  return () => {
    room.off(RoomEvent.TrackPublished, onTrackPublished);
  };
}
