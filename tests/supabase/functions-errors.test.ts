import { expect, test } from "bun:test";

import { getFunctionsInvokeErrorMessage } from "@/lib/supabase/functions-errors";

test("getFunctionsInvokeErrorMessage returns message from error body", async () => {
  const error = {
    message: "Function failed",
    context: {
      body: JSON.stringify({ error: "Invite expired" }),
    },
  };

  const result = await getFunctionsInvokeErrorMessage(error);
  expect(result).toBe("Invite expired");
});

test("getFunctionsInvokeErrorMessage returns message when body is plain text", async () => {
  const error = {
    message: "Function failed",
    context: {
      body: "Request rejected",
    },
  };

  const result = await getFunctionsInvokeErrorMessage(error);
  expect(result).toBe("Request rejected");
});

test("getFunctionsInvokeErrorMessage falls back to error message", async () => {
  const error = { message: "Function failed" };
  const result = await getFunctionsInvokeErrorMessage(error);
  expect(result).toBe("Function failed");
});
