import { useCallback, useEffect, useRef, useState } from "react";

const MUSIC_PREFERENCE_KEY = "lobositz-music-enabled";
const MUSIC_URL = `${import.meta.env.BASE_URL}assets/cold-morning-maneuvers.ogg`;
const LOOP_START_SECONDS = 26.63;
const LOOP_END_SECONDS = 89.95;

export type MusicStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "error";

function readMusicPreference(): boolean {
  try {
    return localStorage.getItem(MUSIC_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function useBackgroundMusic() {
  const [enabled, setEnabled] = useState(readMusicPreference);
  const [status, setStatus] = useState<MusicStatus>("idle");
  const enabledRef = useRef(enabled);
  const statusRef = useRef<MusicStatus>(status);
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const bufferPromiseRef = useRef<Promise<AudioBuffer> | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const operationRef = useRef(0);
  const disposedRef = useRef(false);

  const updateStatus = useCallback((nextStatus: MusicStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const updateEnabled = useCallback((nextEnabled: boolean) => {
    enabledRef.current = nextEnabled;
    setEnabled(nextEnabled);
    try {
      localStorage.setItem(MUSIC_PREFERENCE_KEY, String(nextEnabled));
    } catch {
      // Music still works when browser storage is unavailable.
    }
  }, []);

  const play = useCallback(
    async (restart = false) => {
      if (!enabledRef.current || disposedRef.current) return;

      const operation = ++operationRef.current;
      let context = contextRef.current;
      if (!context || context.state === "closed") {
        context = new AudioContext();
        contextRef.current = context;
      }

      // Resume immediately while this call still has the user's activation.
      const resumePromise = context.resume();

      if (restart && sourceRef.current) {
        sourceRef.current.stop();
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (!sourceRef.current) updateStatus("loading");

      try {
        await resumePromise;

        let buffer = bufferRef.current;
        if (!buffer) {
          if (!bufferPromiseRef.current) {
            bufferPromiseRef.current = fetch(MUSIC_URL)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(`Music request failed: ${response.status}`);
                }
                return response.arrayBuffer();
              })
              .then((data) => context.decodeAudioData(data));
          }
          buffer = await bufferPromiseRef.current;
          if (buffer.duration < LOOP_END_SECONDS) {
            throw new Error("Music file is shorter than its loop endpoint.");
          }
          bufferRef.current = buffer;
        }

        if (
          disposedRef.current ||
          operation !== operationRef.current ||
          !enabledRef.current
        ) {
          return;
        }

        if (!sourceRef.current) {
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.loopStart = LOOP_START_SECONDS;
          source.loopEnd = LOOP_END_SECONDS;
          source.connect(context.destination);
          sourceRef.current = source;
          source.start(0, 0);
        }

        updateStatus("playing");
      } catch (error) {
        if (disposedRef.current || operation !== operationRef.current) return;
        bufferPromiseRef.current = null;
        updateStatus("error");
        console.error("Unable to play background music.", error);
      }
    },
    [updateStatus]
  );

  const toggle = useCallback(() => {
    if (enabledRef.current && statusRef.current !== "error") {
      updateEnabled(false);
      operationRef.current += 1;
      void contextRef.current?.suspend();
      updateStatus(sourceRef.current ? "paused" : "idle");
      return;
    }

    if (!enabledRef.current) updateEnabled(true);
    void play();
  }, [play, updateEnabled, updateStatus]);

  const restart = useCallback(() => {
    void play(true);
  }, [play]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      operationRef.current += 1;
      sourceRef.current?.stop();
      sourceRef.current?.disconnect();
      void contextRef.current?.close();
    };
  }, []);

  return { enabled, status, play, restart, toggle };
}
