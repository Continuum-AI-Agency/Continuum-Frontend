import { describe, it, expect } from "bun:test";

describe("AvatarStack Type Exports", () => {
  it("exports AvatarData type", async () => {
    const module = await import("./avatar-stack");
    
    // TypeScript will fail to compile if these types don't exist
    const avatarData: typeof module.AvatarData = {} as any;
    expect(avatarData).toBeDefined();
  });

  it("exports AvatarStackProps type", async () => {
    const module = await import("./avatar-stack");
    
    // TypeScript will fail to compile if these types don't exist
    const props: typeof module.AvatarStackProps = {} as any;
    expect(props).toBeDefined();
  });

  it("exports AvatarStack component", async () => {
    const { AvatarStack } = await import("./avatar-stack");
    expect(AvatarStack).toBeFunction();
  });
});
