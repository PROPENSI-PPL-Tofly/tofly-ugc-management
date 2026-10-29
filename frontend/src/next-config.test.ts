import nextConfig from "../next.config";
import { PROOF_MAX_BYTES } from "./lib/invoice-payment";

describe("next.config", () => {
  // A server action refuses a body over 1 MB unless the config says otherwise, before the action
  // runs. The payment proof upload (PBI-13, subtask 13.4) takes files up to 5 MB, as the PRD
  // proposes, plus the bytes multipart/form-data adds around them.
  it("lets a server action take the largest payment proof, with room for the multipart overhead", () => {
    expect(PROOF_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe("6mb");
  });
});
