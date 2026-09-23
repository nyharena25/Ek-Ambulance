import { create } from "zustand";
import { createActor, type Actor } from "xstate";
import {
  patientLifecycleMachine,
  PatientLifecycleContext,
  PatientLifecycleMachineEvent,
  PatientLifecycleState,
} from "@sahayak/domain";

export interface PatientLifecycleStoreState {
  currentState: PatientLifecycleState;
  context: PatientLifecycleContext;
  send: (event: PatientLifecycleMachineEvent) => void;
  reset: () => void;
}

// The machine itself is pure (packages/domain has no side effects, per
// Invariant 1); mounting the actor and mirroring its snapshot into a
// Zustand store IS the app-layer side effect, which is where it belongs.
// Route files call `send()` and separately call `router.push`/`replace` -
// navigation stays out of the machine, exactly as it stays out of the
// domain package.
//
// A stopped XState actor cannot be restarted in place (`.start()` after
// `.stop()` is a no-op, not a reset) - `reset()` below creates a fresh
// actor and re-subscribes rather than reusing the stopped one.
let actor: Actor<typeof patientLifecycleMachine>;

export const usePatientLifecycleStore = create<PatientLifecycleStoreState>((set) => {
  const mount = () => {
    if (actor) actor.stop();
    actor = createActor(patientLifecycleMachine);
    actor.subscribe((snapshot) => {
      set({
        currentState: snapshot.value as PatientLifecycleState,
        context: snapshot.context,
      });
    });
    actor.start();
  };

  mount();

  return {
    currentState: actor.getSnapshot().value as PatientLifecycleState,
    context: actor.getSnapshot().context,
    send: (event) => actor.send(event),
    reset: () => {
      mount();
      set({
        currentState: actor.getSnapshot().value as PatientLifecycleState,
        context: actor.getSnapshot().context,
      });
    },
  };
});
