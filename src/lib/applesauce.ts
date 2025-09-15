import { EventStore } from "applesauce-core";
import { RelayPool } from "applesauce-relay";

export const eventStore = new EventStore();
export const pool = new RelayPool();
