import { env } from "@/lib/env";
import { memoryStore } from "@/lib/store/memory";
import { supabaseStore } from "@/lib/store/supabase-store";

function promisifyStore(store: typeof memoryStore) {
  return new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const output = value.apply(target, args);
        return output instanceof Promise ? output : Promise.resolve(output);
      };
    },
  });
}

export const db: any = env.demoMode ? promisifyStore(memoryStore) : supabaseStore;
