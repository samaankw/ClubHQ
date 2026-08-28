import "react-native-url-polyfill/auto";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

// SecureStore has historically had practical per-value size constraints on some
// platforms. Supabase sessions can be larger than one safe value, so split the
// serialized session across multiple SecureStore entries instead of falling
// back to AsyncStorage or custom cryptography.
//
// expo-secure-store's web implementation doesn't support the same API surface
// (browsers have no OS-level Keychain/Keystore to back it), so on web this
// falls back to plain localStorage. Native platforms (iOS/Android) still get
// real secure, encrypted storage via SecureStore.
const CHUNK_SIZE = 1800;
const META_SUFFIX = ".meta";
const CHUNK_SUFFIX = ".chunk.";

const platformStorage = {
  async getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    }
    return SecureStore.getItemAsync(key);
  },
  async setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

class ChunkedSecureStore {
  private metaKey(key: string) {
    return `${key}${META_SUFFIX}`;
  }

  private chunkKey(key: string, index: number) {
    return `${key}${CHUNK_SUFFIX}${index}`;
  }

  async getItem(key: string): Promise<string | null> {
    const rawCount = await platformStorage.getItemAsync(this.metaKey(key));
    if (!rawCount) return null;

    const count = Number(rawCount);
    if (!Number.isInteger(count) || count <= 0) {
      await this.removeItem(key);
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => platformStorage.getItemAsync(this.chunkKey(key, index)))
    );

    if (chunks.some((chunk) => chunk == null)) {
      await this.removeItem(key);
      return null;
    }

    return chunks.join("");
  }

  async setItem(key: string, value: string): Promise<void> {
    const previousCount = Number((await platformStorage.getItemAsync(this.metaKey(key))) ?? "0");
    const chunks: string[] = [];
    for (let index = 0; index < value.length; index += CHUNK_SIZE) {
      chunks.push(value.slice(index, index + CHUNK_SIZE));
    }
    if (chunks.length === 0) chunks.push("");

    await Promise.all(
      chunks.map((chunk, index) => platformStorage.setItemAsync(this.chunkKey(key, index), chunk))
    );
    await platformStorage.setItemAsync(this.metaKey(key), String(chunks.length));

    // Clean up stale chunks if the new value is shorter than the old value.
    if (Number.isInteger(previousCount) && previousCount > chunks.length) {
      await Promise.all(
        Array.from({ length: previousCount - chunks.length }, (_, offset) =>
          platformStorage.deleteItemAsync(this.chunkKey(key, chunks.length + offset))
        )
      );
    }
  }

  async removeItem(key: string): Promise<void> {
    const rawCount = await platformStorage.getItemAsync(this.metaKey(key));
    const count = Number(rawCount ?? "0");

    if (Number.isInteger(count) && count > 0) {
      await Promise.all(
        Array.from({ length: count }, (_, index) => platformStorage.deleteItemAsync(this.chunkKey(key, index)))
      );
    }
    await platformStorage.deleteItemAsync(this.metaKey(key));
  }
}

const configUrl = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const configAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || configUrl || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || configAnonKey || "";

const isPlaceholder = (value: string) => !value || value.includes("_HERE");
if (isPlaceholder(SUPABASE_URL) || isPlaceholder(supabaseAnonKey)) {
  console.warn(
    "ClubHQ Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env."
  );
}

export const supabase = createClient(SUPABASE_URL, supabaseAnonKey, {
  auth: {
    storage: new ChunkedSecureStore(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
