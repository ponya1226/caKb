import { describe, expect, it } from "vitest";
import { buildUserProfile } from "./userProfile";

describe("userProfile", () => {
  it("builds a user profile from Firebase user values", () => {
    expect(
      buildUserProfile(
        {
          uid: "user-1",
          displayName: " Sample User ",
          email: " sample@example.com ",
        },
        "2026-07-05T00:00:00.000Z",
      ),
    ).toEqual({
      uid: "user-1",
      displayName: "Sample User",
      email: "sample@example.com",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z",
    });
  });

  it("uses safe fallback values when display name or email is missing", () => {
    expect(
      buildUserProfile(
        {
          uid: "user-1",
          displayName: null,
          email: null,
        },
        "2026-07-05T00:00:00.000Z",
      ),
    ).toMatchObject({
      displayName: "名前未設定",
      email: "",
    });
  });
});
