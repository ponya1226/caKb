import { describe, expect, it } from "vitest";
import { isFirebaseClientConfigured, readFirebaseClientConfig } from "./firebaseConfig";

describe("firebaseConfig", () => {
  it("returns null when required Firebase client env values are missing", () => {
    expect(readFirebaseClientConfig({})).toBeNull();
    expect(isFirebaseClientConfigured({ VITE_FIREBASE_API_KEY: "key" })).toBe(false);
  });

  it("builds Firebase client config from public Vite env values", () => {
    const config = readFirebaseClientConfig({
      VITE_FIREBASE_API_KEY: "public-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "example-project",
      VITE_FIREBASE_APP_ID: "1:123:web:abc",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "123",
    });

    expect(config).toEqual({
      apiKey: "public-api-key",
      authDomain: "example.firebaseapp.com",
      projectId: "example-project",
      appId: "1:123:web:abc",
      messagingSenderId: "123",
    });
    expect(isFirebaseClientConfigured({
      VITE_FIREBASE_API_KEY: "public-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "example-project",
      VITE_FIREBASE_APP_ID: "1:123:web:abc",
    })).toBe(true);
  });
});
